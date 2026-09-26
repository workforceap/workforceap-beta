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
  | { ok: true; pendingAt: Date; operationId: string }
  | { ok: false; reason: 'missing' | 'unresolved_send' | 'in_progress' | 'raced' };

/**
 * Commit the deletion barrier before touching external Storage. A claim that
 * wins the lock first leaves an unresolved row and blocks deletion. If deletion
 * wins, the claim sees pending state and cannot call the provider.
 * The operation token owns external cleanup. A returned Storage failure
 * releases ownership but keeps the marker; a crashed operation needs manual
 * reconciliation before its token can be cleared.
 */
export async function beginBillingDeletion(memberId: string, organizationId?: string, deletedBefore?: Date): Promise<BeginBillingDeletionResult> {
  return prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const scoped = await scopedBillingUser(tx, memberId, organizationId);
    if (!scoped) return { ok: false as const, reason: 'missing' as const };
    const where = { id: memberId, ...(organizationId ? { organizationId } : {}), ...(deletedBefore ? { deletedAt: { not: null, lt: deletedBefore } } : {}) };
    const member = await scoped.user.findFirst({ where, select: { billingDeletionPendingAt: true, billingDeletionOperationId: true } });
    if (!member) return { ok: false as const, reason: 'missing' as const };
    if (member.billingDeletionOperationId) return { ok: false as const, reason: 'in_progress' as const };
    if (await hasUnresolvedBillingSend(tx, memberId)) return { ok: false as const, reason: 'unresolved_send' as const };
    const pendingAt = member.billingDeletionPendingAt ?? new Date();
    const operationId = randomUUID();
    const { count } = await scoped.user.updateMany({
      where: { ...where, billingDeletionOperationId: null },
      data: { billingDeletionPendingAt: pendingAt, billingDeletionOperationId: operationId, billingDeletionCompletedAt: null },
    });
    return count === 1 ? { ok: true as const, pendingAt, operationId } : { ok: false as const, reason: 'raced' as const };
  });
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
    await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId, organizationId);
    if (!scoped) return { ok: false as const, reason: 'missing' as const };
    const where = { id: userId, organizationId, email: expectedEmail, deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };
    const active = await scoped.user.findFirst({ where, select: { id: true } });
    if (!active) return { ok: false as const, reason: 'in_progress' as const };
    if (await hasUnresolvedBillingSend(tx, userId)) return { ok: false as const, reason: 'unresolved_send' as const };
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
    await lockBillingMemberLifecycle(tx, userId);
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
