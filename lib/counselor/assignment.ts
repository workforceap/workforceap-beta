import type { Prisma } from '@prisma/client';

/**
 * Must run inside the caller's transaction. Lock the member row before reading
 * assignments so concurrent handoffs cannot leave two active counselors. The
 * assignment and conversation routing are one commit; notifications follow it.
 */
export async function assignMemberCounselor(
  tx: Prisma.TransactionClient,
  input: { memberId: string; organizationId: string; counselorUserId: string | null },
) {
  const { memberId, organizationId, counselorUserId } = input;
  const locked = await tx.user.updateMany({
    where: { id: memberId, organizationId, deletedAt: null },
    data: { updatedAt: new Date() },
  });
  if (locked.count !== 1) throw new Error('Member is no longer available in this organization.');

  const counselor = counselorUserId ? await tx.counselor.findFirst({
    where: { userId: counselorUserId, active: true, user: { organizationId, deletedAt: null } },
    include: { user: { select: { id: true, fullName: true } } },
  }) : null;
  if (counselorUserId && !counselor) throw new Error('Counselor is no longer active in this organization.');

  // Read the outgoing counselor after the member lock and before the
  // deactivate, so staff callers can audit the handoff (from -> to) and skip
  // notifying a counselor who already had this member.
  const previous = await tx.counselorAssignment.findFirst({
    where: { memberId, active: true },
    orderBy: { assignedAt: 'desc' },
    select: { counselor: { select: { userId: true, user: { select: { fullName: true } } } } },
  });
  const previousCounselorUserId = previous?.counselor?.userId ?? null;
  const previousCounselorName = previous?.counselor?.user?.fullName ?? null;

  await tx.counselorAssignment.updateMany({
    where: { memberId, active: true }, data: { active: false },
  });
  if (counselor) {
    const existing = await tx.counselorAssignment.findUnique({
      where: { counselorId_memberId: { counselorId: counselor.id, memberId } },
    });
    if (existing) {
      await tx.counselorAssignment.update({ where: { id: existing.id }, data: { active: true, assignedAt: new Date() } });
    } else {
      await tx.counselorAssignment.create({ data: { counselorId: counselor.id, memberId, active: true } });
    }
  }
  const thread = await tx.messageThread.upsert({
    where: { memberId },
    create: { kind: 'member', memberId, counselorUserId },
    update: { counselorUserId },
  });
  return { counselor, thread, previousCounselorUserId, previousCounselorName };
}
