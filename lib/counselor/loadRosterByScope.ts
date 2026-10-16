import 'server-only';

import { COUNSELOR_ROSTER_CAP, LOOKUP_LIST_CAP } from '@/lib/db/queryCaps';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import type { AdminRosterScope, ResolvedRosterScope } from '@/lib/counselor/rosterScope';
import { buildCounselorScopeOptions, rosterScopeToParam } from '@/lib/counselor/rosterScope';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

const memberSelect = {
  id: true,
  fullName: true,
  email: true,
  enrolledProgram: true,
  courseEnrollments: {
    orderBy: [{ isPrimary: 'desc' as const }, { enrolledAt: 'desc' as const }],
    select: { programSlug: true, curriculumVersion: true, isPrimary: true },
  },
  programInterest: true,
  assessmentScorePct: true,
  wioaReviewStatus: true,
  createdAt: true,
  memberProgramProgress: {
    select: { programSlug: true, averagePercent: true, coursesCompleted: true },
  },
};

export type RosterAssignmentRow = {
  id: string;
  memberId: string;
  member: {
    id: string;
    fullName: string | null;
    email: string;
    enrolledProgram: string | null;
    courseEnrollments: Array<{
      programSlug: string;
      curriculumVersion: string;
      isPrimary: boolean;
    }>;
    programInterest: string | null;
    assessmentScorePct: number | null;
    wioaReviewStatus: string | null;
    createdAt: Date;
    memberProgramProgress: Array<{
      programSlug: string;
      averagePercent: number;
      coursesCompleted: number;
    }>;
  };
};

export async function loadCounselorScopeOptions(organizationId: string, ownCounselorId: string | null) {
  // Keep tenant-model calls within the audit lookback of `withTenantScope`
  // (scripts/audit-tenant-scoping.cjs — 12-line window).
  const counselors = await withTenantScope(organizationId, (db) =>
    db.counselor.findMany({
      where: {
        active: true,
        user: { organizationId, deletedAt: null },
      },
      select: {
        id: true,
        user: { select: { fullName: true, email: true } },
        _count: { select: { assignments: { where: { active: true } } } },
      },
      orderBy: { user: { fullName: 'asc' } },
      take: LOOKUP_LIST_CAP,
    }),
  );

  const [allCount, unassignedCount] = await withTenantScope(organizationId, (db) =>
    Promise.all([
      db.counselorAssignment.count({
        where: {
          active: true,
          counselor: { active: true, user: { organizationId, deletedAt: null } },
          member: { organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
        },
      }),
      db.user.count({
        where: {
          organizationId,
          deletedAt: null,
          ...MEMBER_ONLY_WHERE,
          counselorAssignments: { none: { active: true } },
        },
      }),
    ]),
  );

  const options = buildCounselorScopeOptions({
    allCount,
    unassignedCount,
    ownCounselorId,
    counselors: counselors.map((c) => ({
      id: c.id,
      fullName: c.user.fullName,
      email: c.user.email,
      assignmentCount: c._count.assignments,
    })),
  });

  return { options, allCount, unassignedCount };
}

function toRosterMember(member: {
  id: string;
  fullName: string | null;
  email: string;
  enrolledProgram: string | null;
  courseEnrollments: Array<{
    programSlug: string;
    curriculumVersion: string | null;
    isPrimary: boolean;
  }>;
  programInterest: string | null;
  assessmentScorePct: number | null;
  wioaReviewStatus: string | null;
  createdAt: Date;
  memberProgramProgress: Array<{
    programSlug: string;
    averagePercent: number | null;
    coursesCompleted: number | null;
  }>;
}): RosterAssignmentRow['member'] {
  return {
    ...member,
    courseEnrollments: member.courseEnrollments.map((row) => ({
      programSlug: row.programSlug,
      curriculumVersion: row.curriculumVersion ?? '',
      isPrimary: row.isPrimary,
    })),
    memberProgramProgress: member.memberProgramProgress.map((row) => ({
      programSlug: row.programSlug,
      averagePercent: row.averagePercent ?? 0,
      coursesCompleted: row.coursesCompleted ?? 0,
    })),
  };
}

export async function loadRosterAssignmentsByScope(
  organizationId: string,
  scope: AdminRosterScope,
): Promise<RosterAssignmentRow[]> {
  return withTenantScope(organizationId, async (db) => {
    if (scope.kind === 'unassigned') {
      const members = await db.user.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...MEMBER_ONLY_WHERE,
          counselorAssignments: { none: { active: true } },
        },
        select: memberSelect,
        orderBy: { createdAt: 'desc' },
        take: COUNSELOR_ROSTER_CAP,
      });
      return members.map((member) => ({
        id: `unassigned:${member.id}`,
        memberId: member.id,
        member: toRosterMember(member),
      }));
    }

    const where =
      scope.kind === 'counselor'
        ? {
            counselorId: scope.counselorId,
            active: true as const,
            counselor: { active: true, user: { organizationId, deletedAt: null } },
            member: { organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
          }
        : {
            active: true as const,
            counselor: { active: true, user: { organizationId, deletedAt: null } },
            member: { organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
          };

    const assignments = await db.counselorAssignment.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where,
      include: { member: { select: memberSelect } },
      orderBy: { assignedAt: 'desc' },
    });

    return assignments.map((a) => ({
      id: a.id,
      memberId: a.memberId,
      member: toRosterMember(a.member),
    }));
  });
}

export function selectedScopeParam(
  scope: ResolvedRosterScope,
  ownCounselorId: string | null,
): string {
  return rosterScopeToParam(scope, ownCounselorId);
}
