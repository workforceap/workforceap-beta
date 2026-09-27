import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { hasSuperAdminAccess } from '@/lib/auth/roleAccess';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope, crossTenantOK } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { isDeletedEmailMarker, parseDeletedEmail } from '../../_deletedEmail';
import { isErasedEmailMarker } from '@/lib/member/deletedEmail';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { reenableAuthUserAfterRestore } from '@/lib/admin/authUserLifecycle';
import { BILLING_LIFECYCLE_UNAVAILABLE_ERROR, beginBillingRestore } from '@/lib/billing/erasureGuard';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const POST = withApiGuc(async (
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(actor.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!interactiveTransactionsGuaranteed()) return NextResponse.json({
      error: BILLING_LIFECYCLE_UNAVAILABLE_ERROR, code: 'billing_lifecycle_unavailable',
    }, { status: 503 });
  
    const { id } = await params;
    const orgId = await getActorOrganizationId(actor.id);
  
    const target = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id },
        select: {
          id: true,
          email: true,
          deletedAt: true,
          billingDeletionPendingAt: true,
          billingDeletionOperationId: true,
          billingDeletionCompletedAt: true,
          fullName: true,
          phone: true,
          profile: { select: { role: true } },
          userRoles: { select: { role: { select: { name: true } } } },
        },
      }),
    );
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (
      hasSuperAdminAccess(
        target.profile?.role ?? 'member',
        target.userRoles.map((entry) => entry.role.name),
      ) &&
      !(await isSuperAdmin(actor.id))
    ) {
      return NextResponse.json({ error: 'Super admin required.' }, { status: 403 });
    }
    if (!target.deletedAt) {
      return NextResponse.json({ error: 'User is not soft-deleted; nothing to restore.' }, { status: 400 });
    }
    if (isErasedEmailMarker(target.email, id)) {
      return NextResponse.json({ error: 'This account was permanently erased and cannot be restored.' }, { status: 409 });
    }
    if (target.billingDeletionOperationId || (target.billingDeletionPendingAt && !target.billingDeletionCompletedAt)) {
      return NextResponse.json({ error: 'Account deletion is still being completed. Retry deletion or contact support before restoring.' }, { status: 409 });
    }
  
    // If the email was rewritten, try to restore the original.
    let restoredEmail: string | null = null;
    let emailToWrite = target.email.trim().toLowerCase();
  
    const candidate = parseDeletedEmail(target.email)?.trim().toLowerCase();
    if (candidate) {
      // User.email is @unique GLOBALLY — collisions in other tenants would
      // still trigger P2002 on the update below. Use crossTenantOK so the
      // pre-check sees them and surfaces a clean 409.
      const colliding = await crossTenantOK(() =>
        prisma.user.findFirst({
          where: { email: { equals: candidate, mode: 'insensitive' }, NOT: { id } },
          select: { id: true },
        }),
      );
      if (colliding) {
        return NextResponse.json(
          { error: 'Account cannot be restored because its sign-in email is unavailable.' },
          { status: 409 },
        );
      }
      emailToWrite = candidate;
      restoredEmail = candidate;
    } else if (isDeletedEmailMarker(target.email)) {
      return NextResponse.json(
        { error: 'Cannot restore: deleted email marker is invalid and the original email cannot be recovered.' },
        { status: 409 },
      );
    }

    const restoreOperation = await beginBillingRestore(id, orgId, {
      email: target.email,
      deletedAt: target.deletedAt,
      pendingAt: target.billingDeletionPendingAt ?? null,
      completedAt: target.billingDeletionCompletedAt ?? null,
    });
    if (!restoreOperation.ok) {
      return NextResponse.json({ error: 'Account deletion or another restore is in progress. Reload and try again.' }, { status: 409 });
    }
  
    // Bring the login back too. Soft delete bans the auth user (or, before
    // 9/2/26, hard-deleted it); either way the member cannot sign in until
    // this succeeds, so a failure here is reported, not swallowed.
    const supabaseAdmin = getSupabaseAdmin();
    let authRestore: string;
    try {
      const result = await reenableAuthUserAfterRestore(supabaseAdmin, {
        id,
        email: emailToWrite,
        fullName: target.fullName,
        phone: target.phone,
      });
      if (!result.ok) {
        console.error('[admin/users/:id/restore] auth user restore failed:', result.message);
        return NextResponse.json(
          {
            ok: false,
            authRestored: false,
            reconciliationRequired: true,
            error: 'Sign-in restoration could not be confirmed. The account remains deleted; contact support for reconciliation.',
          },
          { status: 502 },
        );
      }
      authRestore = result.action;
    } catch (err) {
      console.error('[admin/users/:id/restore] auth user restore threw:', err);
      return NextResponse.json(
        {
          ok: false,
          authRestored: false,
          reconciliationRequired: true,
          error: 'Sign-in restoration could not be confirmed. The account remains deleted; contact support for reconciliation.',
        },
        { status: 503 },
      );
    }

    // Only publish the active app row once the exact Auth identity is restored.
    // Preserve the deleted state on provider failure so the action can be retried.
    try {
      const changed = await withTenantScope(orgId, (db) =>
        db.user.updateMany({
          where: {
            id, email: target.email, deletedAt: target.deletedAt,
            billingDeletionPendingAt: target.billingDeletionPendingAt ?? null,
            billingDeletionOperationId: restoreOperation.operationId,
            billingDeletionCompletedAt: target.billingDeletionCompletedAt ?? null,
          },
          data: { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null, billingDeletionCompletedAt: null, email: emailToWrite },
        }),
      );
      if (changed.count !== 1) throw new Error('Restore target changed during request');
    } catch (err) {
      // The restore owner is retained when Auth and the app row disagree.
      // A second delete or restore cannot race through the provider boundary.
      console.error('[admin/users/:id/restore] account activation requires reconciliation');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ error: 'Email collision on restore. Account reconciliation is required.', reconciliationRequired: true }, { status: 409 });
      }
      return NextResponse.json({ error: 'Account activation could not be confirmed. Contact support for account reconciliation.', reconciliationRequired: true }, { status: 503 });
    }

    await auditLog({
      actorUserId: actor.id,
      action: 'user_restore',
      targetType: 'user',
      targetId: id,
      metadata: { orgId, restoredEmail, authRestore },
    });
    const actorRole = (await isSuperAdmin(actor.id)) ? 'super_admin' : 'admin';
    await logAuditEvent({
      user: { id: actor.id, role: actorRole },
      verb: 'approved',
      object: { type: 'User', id },
      result: { success: true, extensions: { restoredEmail, orgId } },
      request: auditRequestMeta(_req),
      orgId,
    }).catch((err) => console.error('[audit] user restore:', err));

    return NextResponse.json({
      ok: true,
      restoredEmail,
      authRestored: true,
      authRestore,
      message:
        authRestore === 'recreated'
          ? 'Account restored. The login was re-created; ask the member to use "Reset password" to set a new password.'
          : 'Account restored. Sign in, or use password reset to set a password.',
    });
  } catch (error) {
    console.error('/admin/users/[id]/restore:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
