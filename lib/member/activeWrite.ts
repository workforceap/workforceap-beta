import type { Prisma } from '@prisma/client';
import { billingLifecyclePending, lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

export class MemberLifecycleWriteError extends Error {
  constructor() {
    super('This account is no longer active.');
    this.name = 'MemberLifecycleWriteError';
  }
}

/** Recheck the member after the lifecycle lock, immediately before PII writes. */
export async function withActiveMemberWrite<T>(
  userId: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    if (await billingLifecyclePending(tx, userId)) throw new MemberLifecycleWriteError();
    return write(tx);
  });
}
