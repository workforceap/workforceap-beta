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
import { disableAuthUserForSoftDelete } from '@/lib/admin/authUserLifecycle';
import { BILLING_SEND_IN_PROGRESS_ERROR, beginBillingDeletion, completeBillingDeletion, releaseBillingDeletion } from '@/lib/billing/erasureGuard';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';async function _DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const originalEmail = parseDeletedEmail(target.email) ?? target.email;
    if (isDeletedEmailMarker(target.email) && !parseDeletedEmail(target.email)) return NextResponse.json({ error: 'The original email cannot be recovered from this deleted account.' }, { status: 409 });
  
    try {
      // See app/api/admin/members/[id]/delete/route.ts — same pattern.
      // Rewrite the email so the @unique constraint doesn't block re-signup.
      const now = new Date();
      const newEmail = target.deletedAt ? target.email : buildDeletedEmail(id, now.getTime(), target.email);
      if (!newEmail) {
        return NextResponse.json(
          { error: 'Cannot delete user because the email is too long to preserve for restore.' },
          { status: 400 },
        );
      }

      const billingDeletion = await beginBillingDeletion(id, orgId);
      if (!billingDeletion.ok) return NextResponse.json({
    error: billingDeletion.reason === 'unresolved_send' ? BILLING_SEND_IN_PROGRESS_ERROR : 'The account changed during deletion. Reload and try again.',
    code: billingDeletion.reason === 'unresolved_send' ? 'billing_send_unresolved' : 'account_changed',
      }, { status: 409 });

      await withTenantScope(orgId, (db) =>
        db.user.updateMany({
          where: { id },
          data: { deletedAt: now, email: newEmail },
        }),
      );
  
      // Soft delete = lock the login, never destroy it: restore must be able
      // to bring the account back (9/2/26 ops report).
      const disabled = await disableAuthUserForSoftDelete(getSupabaseAdmin(), id, originalEmail);
      if (!disabled.ok) {
        console.error('[admin/users/:id DELETE] Supabase disable error:', disabled.message);
        await releaseBillingDeletion(id, billingDeletion.operationId);
        return userAuthDeleteFailedResponse();
      }
      await completeBillingDeletion(id, billingDeletion.operationId);
  
      await auditLog({
        actorUserId: actor.id,
        action: 'admin_user_delete',
        targetType: 'user',
        targetId: id,
        metadata: { email: target.email },
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

    let authEmailChanged = false;
 
    try {
      if (emailChanged) {
        const { error: authError } = await supabase.auth.admin.updateUserById(id, {
          email: normalizedEmail,
          email_confirm: true,
        });
        if (authError) {
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
          where: { id, organizationId: orgId },
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
      if (authEmailChanged) {
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
