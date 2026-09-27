import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { hasSuperAdminAccess } from '@/lib/auth/roleAccess';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crossTenantOK, withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { ADMIN_USER_ROLES, ensureProfileRole, syncManagedUserRoles } from '@/lib/admin/adminUserProvisioning';
import { userAuthDeleteFailedResponse } from '@/lib/admin/userDeleteResponse';
import { buildDeletedEmail, isDeletedEmailMarker, parseDeletedEmail } from '../_deletedEmail';
import { isErasedEmailMarker } from '@/lib/member/deletedEmail';
import { disableAuthUserForSoftDelete } from '@/lib/admin/authUserLifecycle';
import { BILLING_LIFECYCLE_UNAVAILABLE_ERROR, BILLING_SEND_IN_PROGRESS_ERROR, beginBillingDeletion, beginBillingIdentityEdit, completeBillingDeletion, endBillingIdentityEdit, releaseBillingDeletion } from '@/lib/billing/erasureGuard';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

async function _DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let deletionOwner: { id: string; operationId: string } | null = null;
  try {
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isSuperAdmin(actor.id))) return NextResponse.json({ error: 'Super admin required.' }, { status: 403 });
  
    const { id } = await params;
  
    if (id === actor.id) {
      return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
    }
  
    const orgId = await getActorOrganizationId(actor.id);
  
    const target = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id },
        select: { id: true, email: true, deletedAt: true },
      }),
    );
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  
    try {
      // See app/api/admin/members/[id]/delete/route.ts — same pattern.
      // Rewrite the email so the @unique constraint doesn't block re-signup.
      const now = new Date();
      const billingDeletion = await beginBillingDeletion(id, orgId, undefined, target.deletedAt ?? undefined);
      if (!billingDeletion.ok && billingDeletion.reason === 'transaction_unavailable') return NextResponse.json({
        error: BILLING_LIFECYCLE_UNAVAILABLE_ERROR, code: 'billing_lifecycle_unavailable',
      }, { status: 503 });
      if (!billingDeletion.ok) return NextResponse.json({
    error: billingDeletion.reason === 'unresolved_send' ? BILLING_SEND_IN_PROGRESS_ERROR : 'The account changed during deletion. Reload and try again.',
    code: billingDeletion.reason === 'unresolved_send' ? 'billing_send_unresolved' : 'account_changed',
      }, { status: 409 });
      deletionOwner = { id, operationId: billingDeletion.operationId };

      // The first lookup is not an update preimage. Read under the committed
      // owner, then compare-and-set the exact account before touching Auth.
      const current = await withTenantScope(orgId, (db) => db.user.findFirst({
        where: { id, billingDeletionOperationId: billingDeletion.operationId },
        select: { id: true, email: true, deletedAt: true },
      }));
      if (!current || current.email !== target.email || current.deletedAt?.getTime() !== target.deletedAt?.getTime()) {
        return NextResponse.json({ error: 'The account changed during deletion. Reload and try again.' }, { status: 409 });
      }
      const originalEmail = parseDeletedEmail(current.email) ?? current.email;
      if (isErasedEmailMarker(current.email, id) || (isDeletedEmailMarker(current.email) && !parseDeletedEmail(current.email))) {
        return NextResponse.json({ error: 'The original email cannot be recovered from this deleted account.' }, { status: 409 });
      }
      const newEmail = current.deletedAt ? current.email : buildDeletedEmail(id, now.getTime(), current.email);
      if (!newEmail) return NextResponse.json({ error: 'Cannot delete user because the email is too long to preserve for restore.' }, { status: 400 });

      const changed = await withTenantScope(orgId, (db) =>
        db.user.updateMany({
          where: { id, email: current.email, deletedAt: current.deletedAt, billingDeletionOperationId: billingDeletion.operationId },
          data: { deletedAt: current.deletedAt ?? now, email: newEmail },
        }),
      );
      if (changed.count !== 1) return NextResponse.json({ error: 'The account changed during deletion. Reconciliation is required.', reconciliationRequired: true }, { status: 409 });
  
      // Soft delete = lock the login, never destroy it: restore must be able
      // to bring the account back (9/2/26 ops report).
      const disabled = await disableAuthUserForSoftDelete(getSupabaseAdmin(), id, originalEmail);
      if (!disabled.ok) {
        console.error('[admin/users/:id DELETE] Supabase disable error:', disabled.message);
        return userAuthDeleteFailedResponse();
      }
      await completeBillingDeletion(id, billingDeletion.operationId);
      deletionOwner = null;
  
      await auditLog({
        actorUserId: actor.id,
        action: 'admin_user_delete',
        targetType: 'user',
        targetId: id,
        metadata: { email: current.email },
      });
      logAuditEvent({ user: { id: actor.id, role: 'admin' }, verb: 'deleted', object: { type: 'User', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('[admin/users/:id DELETE]', err);
      return NextResponse.json({ error: 'Failed to delete user.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/users/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (deletionOwner) {
      await releaseBillingDeletion(deletionOwner.id, deletionOwner.operationId).catch((error) => {
        console.error('[admin/users/:id DELETE] operation release requires reconciliation:', error);
      });
    }
  }
}
export const DELETE = withApiGuc(_DELETE);

const schema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  role: z.enum(ADMIN_USER_ROLES).optional(),
});

async function rollbackSupabaseEmailChange(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  previousEmail: string,
) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email: previousEmail,
    email_confirm: true,
  });
  return error ?? null;
}

async function _PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getUser();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(admin.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const { id } = await params;
  
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
  
    const { fullName, email, role } = parsed.data;
  
    const orgId = await getActorOrganizationId(admin.id);
    const existing = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id },
        select: {
          id: true,
          email: true,
          profile: { select: { role: true } },
          userRoles: { select: { role: { select: { name: true } } } },
        },
      }),
    );
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const actorIsSuperAdmin = await isSuperAdmin(admin.id);
    const targetIsSuperAdmin = hasSuperAdminAccess(
      existing.profile?.role ?? 'member',
      existing.userRoles.map((entry) => entry.role.name),
    );
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      return NextResponse.json({ error: 'Super admin required.' }, { status: 403 });
    }

    if (role && !actorIsSuperAdmin) {
      return NextResponse.json({ error: 'Only super admins can change roles.' }, { status: 403 });
    }
  
    const supabase = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase();
    const emailChanged = normalizedEmail !== existing.email.toLowerCase();

    if (emailChanged) {
      // Email uniqueness is global, so this preflight intentionally crosses
      // tenant scope. The row is disclosed only after an explicit tenant
      // comparison; request GUC context alone is not authorization proof.
      const collisionIdentity = await crossTenantOK(() =>
        prisma.user.findFirst({
          where: { email: normalizedEmail, id: { not: id } },
          select: { id: true, organizationId: true },
        }),
      );
      if (collisionIdentity) {
        if (collisionIdentity.organizationId !== orgId) {
          return NextResponse.json(
            { error: 'That email already has an account.' },
            { status: 409 },
          );
        }
        const collision = await withTenantScope(orgId, (db) =>
          db.user.findFirst({
            where: { id: collisionIdentity.id },
            select: {
              id: true,
              fullName: true,
              email: true,
              profile: { select: { role: true } },
            },
          }),
        );
        if (!collision) {
          return NextResponse.json(
            { error: 'That email already has an account.' },
            { status: 409 },
          );
        }
        return NextResponse.json(
          {
            error: 'That email already has an account. Use the edit or reset tools on the existing user.',
            user: {
              id: collision.id,
              fullName: collision.fullName,
              email: collision.email,
              role: collision.profile?.role ?? 'member',
            },
          },
          { status: 409 },
        );
      }
    }

    // Claim a member/counselor lifecycle hold before changing Auth outside
    // PostgreSQL. A send that claimed first blocks this edit; an edit that
    // wins blocks new claims until Auth and the app row agree.
    const billingEdit = await beginBillingIdentityEdit(id, orgId, existing.email);
    if (!billingEdit.ok) return NextResponse.json({
      error: billingEdit.reason === 'unresolved_send' ? BILLING_SEND_IN_PROGRESS_ERROR : 'This account is being deleted or edited. Reload and try again.',
      code: billingEdit.reason === 'unresolved_send' ? 'billing_send_unresolved' : 'account_changed',
    }, { status: 409 });

    let authEmailChanged = false;
    let authOutcomeUnknown = false;
    let dbUpdated = false;
    let editHeld = true;
 
    try {
      if (emailChanged) {
        authOutcomeUnknown = true;
        const { error: authError } = await supabase.auth.admin.updateUserById(id, {
          email: normalizedEmail,
          email_confirm: true,
        });
        authOutcomeUnknown = false;
        if (authError) {
          await endBillingIdentityEdit(id, billingEdit.operationId);
          editHeld = false;
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
        authEmailChanged = true;
      }
  
      // Membership has already been verified via withTenantScope.findFirst above.
      // The User update + Profile / UserRole writes need to be ATOMIC — Codex P2
      // catch on PR #1049: splitting them caused partial-update state when role
      // sync failed after the user write succeeded. Restore the single
      // $transaction with an explicit `organizationId` filter on the user write.
      // This is an atomicity exception — the proxy can't be inserted inside an
      // outer $transaction (the inner `tx` argument is unwrapped). The membership
      // gate from `existing` above is the primary tenant check; the explicit
      // organizationId on this updateMany is belt-and-braces.
      const updated = await prisma.$transaction(async (tx) => {
        const userResult = await tx.user.updateMany({
          where: { id, organizationId: orgId, email: existing.email, billingDeletionOperationId: billingEdit.operationId },
          data: { fullName, email: normalizedEmail },
        });
        if (userResult.count === 0) {
          throw new Error('USER_NOT_FOUND_IN_TX');
        }
  
        const profile = role
          ? await ensureProfileRole(tx, id, role)
          : await tx.profile.findFirst({
              where: { userId: id },
              select: { role: true },
            });
  
        if (role) {
          await syncManagedUserRoles(tx, id, role);
        }
  
        return {
          id,
          fullName,
          email: normalizedEmail,
          role: profile?.role ?? 'member',
        };
      });
      dbUpdated = true;
      await endBillingIdentityEdit(id, billingEdit.operationId);
      editHeld = false;
  
      await auditLog({
        actorUserId: admin.id,
        action: 'admin_user_update',
        targetType: 'user',
        targetId: id,
        metadata: { fullName, email: normalizedEmail, role: updated.role },
      });
      logAuditEvent({ user: { id: admin.id, role: 'admin' }, verb: 'updated', object: { type: 'User', id }, result: { success: true, extensions: { role: updated.role } } }).catch(() => {});
      return NextResponse.json({ success: true, user: updated });
    } catch (error) {
      if (authOutcomeUnknown) {
        console.error('[admin/users/:id PATCH] Auth email outcome unknown:', error);
        return NextResponse.json({ error: 'The sign-in email outcome is unknown; account reconciliation is required.', reconciliationRequired: true }, { status: 503 });
      }
      if (authEmailChanged && !dbUpdated) {
        try {
          const rollbackError = await rollbackSupabaseEmailChange(supabase, id, existing.email);
          if (rollbackError) {
            console.error('[admin/users/:id PATCH] Supabase email rollback failed:', rollbackError.message);
            return NextResponse.json(
              { error: 'Failed to update user; auth email rollback failed.', reconciliationRequired: true },
              { status: 500 },
            );
          }
        } catch (rollbackError) {
          console.error('[admin/users/:id PATCH] Supabase email rollback failed:', rollbackError);
          return NextResponse.json(
            { error: 'Failed to update user; auth email rollback failed.', reconciliationRequired: true },
            { status: 500 },
          );
        }
      }
      if (editHeld && !dbUpdated) {
        try {
          await endBillingIdentityEdit(id, billingEdit.operationId);
          editHeld = false;
        } catch (releaseError) {
          console.error('[admin/users/:id PATCH] billing edit release failed:', releaseError);
          return NextResponse.json({ error: 'The account edit could not be completed; reconciliation is required.', reconciliationRequired: true }, { status: 503 });
        }
      }
      if (editHeld && dbUpdated) {
        return NextResponse.json({ error: 'Account details changed, but billing remains paused until reconciliation.', reconciliationRequired: true }, { status: 503 });
      }
      if (error instanceof Error && error.message === 'USER_NOT_FOUND_IN_TX') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      if ((error as { code?: unknown })?.code === 'P2002') {
        return NextResponse.json(
          { error: 'That email already has an account.' },
          { status: 409 },
        );
      }
      console.error('[admin/users/:id PATCH]', error);
      return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/users/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);
