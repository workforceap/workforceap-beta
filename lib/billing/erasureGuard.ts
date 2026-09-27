import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { makeScopedProxy } from '@/lib/tenant/scopeProxy';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

/** Every sign, send claim and deletion begins with this lock. */
export async function lockBillingMemberLifecycle(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  if (!interactiveTransactionsGuaranteed()) throw new Error('Billing lifecycle writes require interactive transactions');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-member-lifecycle:${memberId}`}))`;
}

/** Includes a signed counselor copy as well as a student's own packet. */
export async function hasUnresolvedBillingSend(tx: Prisma.TransactionClient, memberId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT s.id FROM public.training_billing_packet_sends s
    JOIN public.training_billing_packets p ON p.id = s.packet_id
    JOIN public.users u ON u.id = ${memberId}::text AND u.organization_id = p.organization_id
    WHERE s.status IN ('claimed', 'ambiguous', 'needs_reconciliation')
      AND (p.member_id = u.id
        OR (s.recipient = 'counselor' AND p.signed_snapshot #>> '{counselor,userId}' = u.id))
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Keep a User row until an owned milestone provider attempt records its outcome. */
export async function hasUnresolvedMilestoneDispatch(tx: Prisma.TransactionClient, memberId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.milestone_cascades
    WHERE user_id = ${memberId}::text
      AND dispatch_state #>> '{claimId}' IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Resolve a unique User's tenant only after taking its lifecycle lock. */
export async function scopedBillingUser(tx: Prisma.TransactionClient, userId: string, expectedOrgId?: string): Promise<Prisma.TransactionClient | null> {
  // Callers with only an internal User ID must first discover its tenant.
  // This one-field read is intentional cross-tenant lookup by unique ID;
  // every subsequent User read/write uses the scoped transaction proxy.
  const organizationId = expectedOrgId ?? (await crossTenantOK(() => tx.user.findFirst({
    where: { id: userId }, select: { organizationId: true },
  })))?.organizationId;
  return organizationId ? makeScopedProxy(organizationId, tx) : null;
}

/** A committed deletion or cross-system identity edit closes assignment writes. */
export async function billingLifecyclePending(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const scoped = await scopedBillingUser(tx, userId);
  if (!scoped) return true;
  const state = await scoped.user.findFirst({
    where: { id: userId }, select: { billingDeletionPendingAt: true, billingDeletionOperationId: true, deletedAt: true },
  });
  return !state || !!state.deletedAt || !!state.billingDeletionPendingAt || !!state.billingDeletionOperationId;
}

export type BeginBillingDeletionResult =
  | { ok: true; pendingAt: Date; operationId: string; priorState?: { pendingAt: Date | null; completedAt: Date | null } }
  | { ok: false; reason: 'missing' | 'unresolved_send' | 'in_progress' | 'raced' | 'transaction_unavailable' };

/**
 * Commit the deletion barrier before touching external Storage. A claim that
 * wins the lock first leaves an unresolved row and blocks deletion. If deletion
 * wins, the claim sees pending state and cannot call the provider.
 * The operation token owns external cleanup. Returned failures release only
 * their own token while keeping the deletion marker. A crashed operation
 * stays held until an operator proves the worker has ended, checks Auth and
 * Storage state, and explicitly reconciles the exact token. Time alone is
 * never evidence that the old worker cannot resume.
 */
export async function beginBillingDeletion(memberId: string, organizationId?: string, deletedBefore?: Date, expectedDeletedAt?: Date): Promise<BeginBillingDeletionResult> {
  if (!interactiveTransactionsGuaranteed()) return { ok: false, reason: 'transaction_unavailable' };
  return prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const scoped = await scopedBillingUser(tx, memberId, organizationId);
    if (!scoped) return { ok: false as const, reason: 'missing' as const };
    const where = {
      id: memberId,
      ...(organizationId ? { organizationId } : {}),
      ...(expectedDeletedAt ? { deletedAt: expectedDeletedAt } : deletedBefore ? { deletedAt: { not: null, lt: deletedBefore } } : {}),
    };
    const member = await scoped.user.findFirst({ where, select: { billingDeletionPendingAt: true, billingDeletionOperationId: true, billingDeletionCompletedAt: true } });
    if (!member) return { ok: false as const, reason: 'missing' as const };
    if (member.billingDeletionOperationId) return { ok: false as const, reason: 'in_progress' as const };
    // The exact-deletedAt claim is used by the deleted-email repair routes.
    // They may retire an old Auth address, but must not complete a failed
    // GDPR/self-delete operation that still requires hard Auth erasure.
    if (expectedDeletedAt && member.billingDeletionPendingAt && !member.billingDeletionCompletedAt) {
      return { ok: false as const, reason: 'in_progress' as const };
    }
    if (await hasUnresolvedBillingSend(tx, memberId)) return { ok: false as const, reason: 'unresolved_send' as const };
    // The dispatch claim took this same lifecycle lock. Do not let a hard
    // erase cascade the ledger before its in-flight provider receipt lands.
    if (await hasUnresolvedMilestoneDispatch(tx, memberId)) return { ok: false as const, reason: 'in_progress' as const };
    // Capture before the update: Prisma returns a value snapshot, but some
    // transaction adapters and test doubles reuse the same mutable object.
    const priorState = { pendingAt: member.billingDeletionPendingAt, completedAt: member.billingDeletionCompletedAt };
    const pendingAt = member.billingDeletionPendingAt ?? new Date();
    const operationId = randomUUID();
    const { count } = await scoped.user.updateMany({
      where: { ...where, billingDeletionOperationId: null },
      data: { billingDeletionPendingAt: pendingAt, billingDeletionOperationId: operationId, billingDeletionCompletedAt: null },
    });
    return count === 1 ? {
      ok: true as const, pendingAt, operationId,
      ...(expectedDeletedAt ? { priorState } : {}),
    } : { ok: false as const, reason: 'raced' as const };
  });
}

/**
 * Undo a deleted-email repair claim only when Auth was never mutated. The
 * exact owner, soft-delete generation, email and claimed marker must still
 * match; otherwise preserve the hold for explicit reconciliation.
 */
export async function abortBillingDeletedEmailRepairBeforeAuthChange(
  memberId: string,
  organizationId: string,
  expectedDeletedAt: Date,
  expectedEmail: string,
  claim: { pendingAt: Date; operationId: string; priorState: { pendingAt: Date | null; completedAt: Date | null } },
): Promise<void> {
  if (!interactiveTransactionsGuaranteed()) throw new Error('Billing lifecycle writes require interactive transactions');
  const undone = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const scoped = await scopedBillingUser(tx, memberId, organizationId);
    if (!scoped) return { count: 0 };
    return scoped.user.updateMany({
      where: {
        id: memberId, organizationId, email: expectedEmail, deletedAt: expectedDeletedAt,
        billingDeletionPendingAt: claim.pendingAt,
        billingDeletionOperationId: claim.operationId,
        billingDeletionCompletedAt: null,
      },
      data: {
        billingDeletionPendingAt: claim.priorState.pendingAt,
        billingDeletionOperationId: null,
        billingDeletionCompletedAt: claim.priorState.completedAt,
      },
    });
  });
  if (undone.count !== 1) throw new Error('Billing deleted-email repair rollback could not be confirmed');
}

/** Release a known failed operation without reopening the member to sign/claim. */
export async function releaseBillingDeletion(memberId: string, operationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const scoped = await scopedBillingUser(tx, memberId);
    if (!scoped) return;
    await scoped.user.updateMany({
      where: { id: memberId, billingDeletionOperationId: operationId },
      data: { billingDeletionOperationId: null },
    });
  });
}

/** A soft-deleted row becomes restorable only after all external cleanup ended. */
export async function completeBillingDeletion(memberId: string, operationId: string): Promise<void> {
  const completed = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const scoped = await scopedBillingUser(tx, memberId);
    if (!scoped) return { count: 0 };
    return scoped.user.updateMany({
      where: { id: memberId, billingDeletionOperationId: operationId, deletedAt: { not: null } },
      data: { billingDeletionOperationId: null, billingDeletionCompletedAt: new Date() },
    });
  });
  if (completed.count !== 1) throw new Error('Billing deletion completion could not be confirmed');
}

/** Temporarily close claims before an Auth email or staff-role edit crosses the DB boundary. */
export async function beginBillingIdentityEdit(userId: string, organizationId: string, expectedEmail: string): Promise<BeginBillingDeletionResult> {
  return prisma.$transaction(async (tx) => {
    // Preview uses an isolated demo database with flattened transactions;
    // billing sign/claim/deletion are disabled there. Its CAS marker still
    // protects the Auth-to-app edit boundary for ordinary profile management.
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId, organizationId);
    if (!scoped) return { ok: false as const, reason: 'missing' as const };
    const where = { id: userId, organizationId, email: expectedEmail, deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };
    const active = await scoped.user.findFirst({ where, select: { id: true } });
    if (!active) return { ok: false as const, reason: 'in_progress' as const };
    if (await hasUnresolvedBillingSend(tx, userId)) return { ok: false as const, reason: 'unresolved_send' as const };
    if (await hasUnresolvedMilestoneDispatch(tx, userId)) return { ok: false as const, reason: 'in_progress' as const };
    const pendingAt = new Date();
    const operationId = randomUUID();
    const { count } = await scoped.user.updateMany({
      where,
      data: { billingDeletionPendingAt: pendingAt, billingDeletionOperationId: operationId },
    });
    return count === 1 ? { ok: true as const, pendingAt, operationId } : { ok: false as const, reason: 'raced' as const };
  });
}

/** Only the matching edit owner may reopen billing claims. */
export async function endBillingIdentityEdit(userId: string, operationId: string): Promise<void> {
  const released = await prisma.$transaction(async (tx) => {
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId);
    if (!scoped) return { count: 0 };
    return scoped.user.updateMany({
      where: { id: userId, deletedAt: null, billingDeletionOperationId: operationId },
      data: { billingDeletionPendingAt: null, billingDeletionOperationId: null },
    });
  });
  if (released.count !== 1) throw new Error('Billing identity edit release could not be confirmed');
}

/** Own the Auth-to-app restore boundary so a second delete cannot start midway. */
export async function beginBillingRestore(userId: string, organizationId: string, expected: {
  email: string;
  deletedAt: Date;
  pendingAt: Date | null;
  completedAt: Date | null;
}): Promise<{ ok: true; operationId: string } | { ok: false }> {
  if (!interactiveTransactionsGuaranteed()) return { ok: false };
  if (expected.pendingAt && !expected.completedAt) return { ok: false };
  return prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId, organizationId);
    if (!scoped) return { ok: false as const };
    const operationId = randomUUID();
    const { count } = await scoped.user.updateMany({
      where: {
        id: userId,
        email: expected.email,
        deletedAt: expected.deletedAt,
        billingDeletionPendingAt: expected.pendingAt,
        billingDeletionCompletedAt: expected.completedAt,
        billingDeletionOperationId: null,
      },
      data: { billingDeletionOperationId: operationId },
    });
    return count === 1 ? { ok: true as const, operationId } : { ok: false as const };
  });
}

export const BILLING_SEND_IN_PROGRESS_ERROR =
  'A billing packet delivery is unresolved for this member. Reconcile that send before deleting the account.';
export const BILLING_LIFECYCLE_UNAVAILABLE_ERROR =
  'Account deletion requires an interactive database transaction. Try again in the production environment.';
