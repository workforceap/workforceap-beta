import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { captureApiError } from '@/lib/observability/captureApiError';
import { buildDeletedEmail, isDeletedEmailMarker, parseDeletedEmail } from '../_deletedEmail';
import { disableAuthUserForSoftDelete } from '@/lib/admin/authUserLifecycle';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { hasAdminAccess } from '@/lib/auth/roleAccess';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { beginBillingDeletion, completeBillingDeletion, releaseBillingDeletion } from '@/lib/billing/erasureGuard';

/**
 * Batch-rewrite up to 100 soft-deleted users' emails to the sentinel form
 * if they aren't already rewritten. Repeated calls backfill deletes from before
 * #757 added per-row email rewriting on delete.
 *
 * Sentinel form (must match app/api/admin/members/[id]/delete/route.ts):
 *   deleted_{userId}_{timestampMs}_{originalEmail}@deleted.invalid
 *
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 4).
 * The list + per-row update go through `withTenantScope` so an admin
 * from Org A only backfills their own tenant's soft-deletes. A super-
 * admin who needs to do this platform-wide should run the operation
 * once per tenant.
 */
async function _POST() {
  try {
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(actor.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const orgId = await getActorOrganizationId(actor.id);
  
    const candidates = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: {
          deletedAt: { not: null },
          NOT: { email: { endsWith: '@deleted.invalid' } },
        },
        select: { id: true, email: true, deletedAt: true, profile: { select: { role: true } }, userRoles: { select: { role: { select: { name: true } } } } },
        take: 100,
      }),
    );
  
    let freed = 0;
    let skipped = 0;
    const ts = Date.now();
    for (const u of candidates) {
      if (!u.deletedAt) { skipped += 1; continue; }
      if (u.id === actor.id || hasAdminAccess(u.profile?.role ?? 'member', u.userRoles.map((entry) => entry.role.name))) { skipped += 1; continue; }
      const originalEmail = parseDeletedEmail(u.email) ?? u.email;
      if (isDeletedEmailMarker(u.email) && !parseDeletedEmail(u.email)) { skipped += 1; continue; }
      const newEmail = parseDeletedEmail(u.email) ? u.email : buildDeletedEmail(u.id, ts, u.email);
      if (!newEmail) {
        skipped += 1;
        continue;
      }
      try {
        const authAdmin = getSupabaseAdmin();
        // Restore uses the same lifecycle operation. A stale batch row must
        // never disable a login that has since been restored.
        const deletion = await beginBillingDeletion(u.id, orgId, undefined, u.deletedAt);
        if (!deletion.ok) { skipped += 1; continue; }
        const disabled = await disableAuthUserForSoftDelete(authAdmin, u.id, originalEmail);
        if (!disabled.ok) {
          await releaseBillingDeletion(u.id, deletion.operationId);
          skipped += 1;
          continue;
        }
        const changed = await withTenantScope(orgId, (db) =>
          db.user.updateMany({
            where: { id: u.id, email: u.email, deletedAt: u.deletedAt, billingDeletionOperationId: deletion.operationId },
            data: { email: newEmail },
          }),
        );
        if (changed.count === 1) {
          await completeBillingDeletion(u.id, deletion.operationId);
          freed += 1;
        } else skipped += 1;
      } catch (err) {
        skipped += 1;
        captureApiError(err, { route: 'admin/users/free-deleted-emails', extra: { userId: u.id } });
      }
    }
  
    void auditLog({ actorUserId: actor.id, action: 'admin_deleted_emails_freed', targetType: 'User', targetId: actor.id, metadata: { freed, skipped, total: candidates.length } }).catch(() => {});
    logAuditEvent({ user: { id: actor.id, role: 'admin' }, verb: 'deleted', object: { type: 'DeletedEmailBatch', id: actor.id }, result: { success: true, extensions: { freed, skipped } } }).catch(() => {});
    return NextResponse.json({ ok: true, freed, skipped, total: candidates.length });
  } catch (error) {
    console.error('/admin/users/free-deleted-emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
