import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { buildDeletedEmail, isDeletedEmail, parseDeletedEmail, isDeletedEmailMarker } from '../../_deletedEmail';
import { disableAuthUserForSoftDelete } from '@/lib/admin/authUserLifecycle';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { hasAdminAccess } from '@/lib/auth/roleAccess';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { BILLING_LIFECYCLE_UNAVAILABLE_ERROR, abortBillingDeletedEmailRepairBeforeAuthChange, beginBillingDeletion, completeBillingDeletion, releaseBillingDeletion } from '@/lib/billing/erasureGuard';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

/**
 * Rewrite a soft-deleted user's email to the sentinel form so the
 * original address is freed for re-signup. Idempotent — does nothing
 * if the email is already in the sentinel form.
 *
 * Sentinel form (must match app/api/admin/members/[id]/delete/route.ts):
 *   deleted_{userId}_{timestampMs}_{originalEmail}@deleted.invalid
 *
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 4).
 * Lookup + update go through `withTenantScope` so an admin from Org A
 * cannot free an Org B user's email by guessing the UUID. `update`
 * becomes `updateMany` so the proxy can scope the where clause.
 */
async function _POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let deletionOwner: { id: string; operationId: string } | null = null;
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
      select: { id: true, email: true, deletedAt: true, profile: { select: { role: true } }, userRoles: { select: { role: { select: { name: true } } } } },
    }),
  );
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!target.deletedAt) {
    return NextResponse.json({ error: 'User is not soft-deleted; cannot free email.' }, { status: 400 });
  }
  if (id === actor.id || hasAdminAccess(target.profile?.role ?? 'member', target.userRoles.map((entry) => entry.role.name))) return NextResponse.json({ error: 'Restore administrator accounts instead of releasing their sign-in email.' }, { status: 403 });
  const originalEmail = parseDeletedEmail(target.email) ?? target.email;
  if (isDeletedEmailMarker(target.email) && !parseDeletedEmail(target.email)) return NextResponse.json({ error: 'The original email cannot be recovered from this deleted account.' }, { status: 409 });
  const alreadyFreed = isDeletedEmail(target.email);
  const newEmail = alreadyFreed ? target.email : buildDeletedEmail(id, Date.now(), target.email);
  if (!newEmail) {
    return NextResponse.json(
      { error: 'Cannot free email because it is too long to preserve for restore.' },
      { status: 400 },
    );
  }
  // A restore may have started after the read above. Claim the same lifecycle
  // operation it uses before crossing into Auth. Match the exact deletedAt so
  // a restored or subsequently re-deleted row cannot be mistaken for this one.
  const authAdmin = getSupabaseAdmin();
  const deletion = await beginBillingDeletion(id, orgId, undefined, target.deletedAt);
  if (!deletion.ok) return NextResponse.json({ error: 'The account is being restored, deleted, or has an unresolved billing delivery. Reload and try again.' }, { status: 409 });
  deletionOwner = { id, operationId: deletion.operationId };

  const disabled = await disableAuthUserForSoftDelete(authAdmin, id, originalEmail);
  if (!disabled.ok) {
    if (disabled.providerUnchanged && deletion.priorState) {
      // Auth update was never called. Put back the exact restorable state
      // claimed under the lifecycle lock. A failed CAS retains its owner.
      deletionOwner = null;
      await abortBillingDeletedEmailRepairBeforeAuthChange(id, orgId, target.deletedAt, target.email, {
        pendingAt: deletion.pendingAt, operationId: deletion.operationId, priorState: deletion.priorState,
      });
      return NextResponse.json({ error: 'The sign-in email could not be released. Retry or contact support.', reconciliationRequired: false }, { status: 502 });
    }
    // An Auth mutation may have reached the provider. Keep the pending
    // barrier so restore waits for explicit reconciliation.
    return NextResponse.json({ error: 'The sign-in email could not be released. Retry or contact support.', reconciliationRequired: true }, { status: 502 });
  }
  // Also compare-and-set an already-freed row: a no-op email is not proof the
  // same deleted User still owns the lifecycle operation after Auth returned.
  const changed = await withTenantScope(orgId, (db) =>
    db.user.updateMany({
      where: { id, email: target.email, deletedAt: target.deletedAt, billingDeletionOperationId: deletion.operationId },
      data: { email: newEmail },
    }),
  );
  if (changed.count !== 1) return NextResponse.json({ error: 'The account changed during this request. Reconciliation is required.', reconciliationRequired: true }, { status: 409 });
  await completeBillingDeletion(id, deletion.operationId);
  deletionOwner = null;

  auditLog({
    actorUserId: actor.id,
    action: 'admin_user_free_email',
    targetType: 'user',
    targetId: id,
    metadata: { orgId, originalEmail: target.email, newEmail },
  }).catch((err) => console.error('[admin/users/free-email] audit log failed:', err));
  logAuditEvent({
    user: { id: actor.id, role: 'admin' },
    verb: 'freed_email',
    object: { type: 'User', id },
    result: { success: true, extensions: { orgId, originalEmail: target.email } },
    request: auditRequestMeta(req),
    orgId,
  }).catch((err) => console.error('[admin/users/free-email] xAPI audit log failed:', err));

  return NextResponse.json({ ok: true, alreadyFreed, originalEmail, currentEmail: newEmail });

  } catch (error) {
    console.error('/admin/users/[id]/free-email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (deletionOwner) {
      await releaseBillingDeletion(deletionOwner.id, deletionOwner.operationId).catch((error) => {
        console.error('[admin/users/:id/free-email] operation release requires reconciliation:', error);
      });
    }
  }
}
export const POST = withApiGuc(_POST);
