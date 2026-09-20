import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * Admin-preview caseload: every enrolled member in the actor's organization.
 * Member-role profiles only — staff accounts with a program pointer are not
 * caseload (admin audit 2026-09-20, 4.1).
 */
export function enrolledMembersInOrganizationWhere(organizationId: string) {
  return {
    organizationId,
    deletedAt: null,
    enrolledProgram: { not: null },
    ...MEMBER_ONLY_WHERE,
  };
}

export async function resolveAdminEnrolledMemberIds(
  actorUserId: string,
  take = 200,
): Promise<string[]> {
  const organizationId = await getActorOrganizationId(actorUserId);
  const members = await prisma.user.findMany({
    where: enrolledMembersInOrganizationWhere(organizationId),
    select: { id: true },
    take,
  });
  return members.map((m) => m.id);
}
