import type { Prisma } from '@prisma/client';
import { billingLifecyclePending, lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

export class MemberUploadLifecycleError extends Error {
  constructor() {
    super('This account is no longer accepting uploads.');
    this.name = 'MemberUploadLifecycleError';
  }
}

/**
 * An upload is staged outside Postgres, so the final pointer write must meet
 * deletion's barrier. If this transaction wins the lock, deletion waits and
 * its Storage scan sees the committed path. If deletion wins, the marker
 * rejects the write and the caller removes only its newly staged object.
 * Preview flattens Prisma transactions, but account erasure is disabled there.
 */
export async function assertMemberUploadWritable(
  tx: Prisma.TransactionClient,
  memberId: string,
): Promise<void> {
  if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, memberId);
  if (await billingLifecyclePending(tx, memberId)) throw new MemberUploadLifecycleError();
}

/** Storage swap wraps pointer failures without changing their cause. */
export function isMemberUploadLifecycleError(error: unknown): boolean {
  if (error instanceof MemberUploadLifecycleError) return true;
  return error !== null && typeof error === 'object' && 'causeValue' in error
    && error.causeValue instanceof MemberUploadLifecycleError;
}
