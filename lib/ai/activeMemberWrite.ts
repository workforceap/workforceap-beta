import type { Prisma } from '@prisma/client';
import { billingLifecyclePending, lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

/**
 * Short database write barrier for AI-owned member data. Callers authorize the
 * actor first and keep provider/network requests outside this transaction.
 */
export async function withActiveMemberAIWrite<T>(
  userId: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    if (await billingLifecyclePending(tx, userId)) {
      throw new Error('This account is no longer active.');
    }
    return write(tx);
  });
}
