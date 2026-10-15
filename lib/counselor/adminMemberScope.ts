import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';

/**
 * Admin-preview caseload: every enrolled member in the actor's organization.
 * Members only by the one definition in `MEMBER_ONLY_WHERE` — staff accounts
 * with a program pointer are not caseload (admin audit 2026-09-20, 4.1).
 */
export function enrolledMembersInOrganizationWhere(organizationId: string) {
  return {
    organizationId,
    deletedAt: null,
    OR: [{ courseEnrollments: { some: { isPrimary: true, organizationId } } }, { enrolledProgram: { not: null } }],
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
    select: {
      id: true,
      enrolledProgram: true,
      courseEnrollments: { ...CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, where: { organizationId } },
    },
    take,
  });
  return members.filter((member) => Boolean(resolveConfirmedProgramAssignment(member).programSlug))
    .map((member) => member.id);
}
