import type { Prisma } from '@prisma/client';
import { billingLifecyclePending, hasUnresolvedBillingSend, lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';

export class BillingAssignmentInProgressError extends Error {
  readonly code = 'billing_send_in_progress';

  constructor() {
    super('Billing activity is paused or a packet delivery is unresolved for this member. Complete cleanup or reconcile the send before changing counselor assignment.');
    this.name = 'BillingAssignmentInProgressError';
  }
}

/** Must precede any User or CounselorAssignment row lock in this transaction. */
export async function assertBillingAssignmentMutable(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  await lockBillingMemberLifecycle(tx, memberId);
  if (await billingLifecyclePending(tx, memberId) || await hasUnresolvedBillingSend(tx, memberId)) {
    throw new BillingAssignmentInProgressError();
  }
}
