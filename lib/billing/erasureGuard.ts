import { prisma } from '@/lib/db/prisma';

/** An already claimed copy may still be inside an external provider call. */
export async function hasClaimedBillingSend(memberId: string): Promise<boolean> {
  const row = await prisma.trainingBillingPacketSend.findFirst({
    where: { status: 'claimed', packet: { memberId } },
    select: { id: true },
  });
  return row !== null;
}

export const BILLING_SEND_IN_PROGRESS_ERROR =
  'A billing packet is being sent for this member. Finish or reconcile that send before deleting the account.';
