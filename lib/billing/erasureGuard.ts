import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

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
    WHERE s.status IN ('claimed', 'ambiguous', 'needs_reconciliation')
      AND (p.member_id = ${memberId}::text
        OR (s.recipient = 'counselor' AND p.signed_snapshot #>> '{counselor,userId}' = ${memberId}::text))
    LIMIT 1
  `;
  return rows.length > 0;
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
export async function beginBillingDeletion(memberId: string, organizationId?: string): Promise<BeginBillingDeletionResult> {
  return prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    const where = { id: memberId, ...(organizationId ? { organizationId } : {}) };
    const member = await tx.user.findFirst({ where, select: { billingDeletionPendingAt: true, billingDeletionOperationId: true } });
    if (!member) return { ok: false as const, reason: 'missing' as const };
    if (member.billingDeletionOperationId) return { ok: false as const, reason: 'in_progress' as const };
    if (await hasUnresolvedBillingSend(tx, memberId)) return { ok: false as const, reason: 'unresolved_send' as const };
    const pendingAt = member.billingDeletionPendingAt ?? new Date();
    const operationId = randomUUID();
    const { count } = await tx.user.updateMany({
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
    await tx.user.updateMany({
      where: { id: memberId, billingDeletionOperationId: operationId },
      data: { billingDeletionOperationId: null },
    });
  });
}

/** A soft-deleted row becomes restorable only after all external cleanup ended. */
export async function completeBillingDeletion(memberId: string, operationId: string): Promise<void> {
  const completed = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, memberId);
    return tx.user.updateMany({
      where: { id: memberId, billingDeletionOperationId: operationId, deletedAt: { not: null } },
      data: { billingDeletionOperationId: null, billingDeletionCompletedAt: new Date() },
    });
  });
  if (completed.count !== 1) throw new Error('Billing deletion completion could not be confirmed');
}

export const BILLING_SEND_IN_PROGRESS_ERROR =
  'A billing packet delivery is unresolved for this member. Reconcile that send before deleting the account.';
