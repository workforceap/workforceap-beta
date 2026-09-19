import { Prisma } from '@prisma/client';

/**
 * Caller must use a real transaction. This locks the same member row as
 * assignMemberCounselor before checking the current caseload, so a handoff
 * cannot commit between authorization and the review write.
 */
export async function lockMemberForReview(
  tx: Prisma.TransactionClient,
  args: { memberId: string; organizationId: string; actorUserId: string; actorRole: 'admin' | 'super_admin' | 'counselor' },
): Promise<boolean> {
  const members = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM users
    WHERE id = ${args.memberId} AND organization_id = ${args.organizationId}
      AND deleted_at IS NULL FOR UPDATE
  `);
  if (members.length !== 1) return false;
  if (args.actorRole !== 'counselor') return true;
  const assignment = await tx.counselorAssignment.findFirst({
    where: {
      memberId: args.memberId,
      active: true,
      counselor: {
        userId: args.actorUserId,
        active: true,
        user: { organizationId: args.organizationId, deletedAt: null },
      },
    },
    select: { id: true },
  });
  return assignment != null;
}
