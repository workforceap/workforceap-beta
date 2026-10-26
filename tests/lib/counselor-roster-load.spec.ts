/**
 * #2813 leftover: rosterScope helpers are covered, but the Prisma `where`
 * objects that keep staff / fixture / foreign-org accounts off the counselor
 * students page were untested. These cases evaluate the issued filters against
 * the shared member-definition roster instead of asserting SQL wording.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { COUNSELOR_ROSTER_CAP, LOOKUP_LIST_CAP } from '@/lib/db/queryCaps';
import {
  admittedIds,
  matchesWhere,
  MEMBER_DEFINITION_ROSTER,
  MEMBER_ONLY_IDS,
} from '../helpers/prismaWhereMatches';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
  counselorFindMany: vi.fn(),
  assignmentCount: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  assignmentFindMany: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: (_org: string, fn: (client: unknown) => unknown) =>
    fn({
      counselor: { findMany: db.counselorFindMany },
      counselorAssignment: { count: db.assignmentCount, findMany: db.assignmentFindMany },
      user: { count: db.userCount, findMany: db.userFindMany },
    }),
}));

import { loadCounselorScopeOptions, loadRosterAssignmentsByScope } from '@/lib/counselor/loadRosterByScope';

const ORG = 'org-1';
const OTHER = 'org-2';
const COUNSELOR_ID = 'c-1';
const createdAt = new Date('2026-10-01T00:00:00Z');

type MemberRow = Record<string, unknown> & { id: string };

function memberRow(source: { id: string } & Record<string, unknown>, extra: Record<string, unknown> = {}): MemberRow {
  return {
    ...source,
    organizationId: ORG,
    deletedAt: null,
    fullName: source.id,
    email: `${source.id}@mail.invalid`,
    enrolledProgram: null,
    courseEnrollments: [],
    programInterest: null,
    assessmentScorePct: null,
    wioaReviewStatus: null,
    createdAt,
    memberProgramProgress: [],
    counselorAssignments: [],
    ...extra,
  };
}

function assignmentRow(member: MemberRow, extra: Record<string, unknown> = {}) {
  return {
    id: `asg-${member.id}`,
    memberId: member.id,
    counselorId: COUNSELOR_ID,
    active: true,
    assignedAt: createdAt,
    counselor: { active: true, user: { organizationId: ORG, deletedAt: null } },
    member,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.counselorFindMany.mockResolvedValue([]);
  db.assignmentCount.mockResolvedValue(0);
  db.userCount.mockResolvedValue(0);
  db.userFindMany.mockResolvedValue([]);
  db.assignmentFindMany.mockResolvedValue([]);
});

describe('counselor roster load membership filters', () => {
  it('counts All / Unassigned against member-only rows in the actor organization', async () => {
    await loadCounselorScopeOptions(ORG, COUNSELOR_ID);
    expect(db.counselorFindMany.mock.calls[0][0]).toMatchObject({
      take: LOOKUP_LIST_CAP,
      where: { active: true, user: { organizationId: ORG, deletedAt: null } },
    });
    const assignedWhere = db.assignmentCount.mock.calls[0][0].where;
    const unassignedWhere = db.userCount.mock.calls[0][0].where;
    expect(assignedWhere).toEqual({
      active: true,
      counselor: { active: true, user: { organizationId: ORG, deletedAt: null } },
      member: { organizationId: ORG, deletedAt: null, ...MEMBER_ONLY_WHERE },
    });
    expect(unassignedWhere).toEqual({
      organizationId: ORG,
      deletedAt: null,
      ...MEMBER_ONLY_WHERE,
      counselorAssignments: { none: { active: true } },
    });
    expect(admittedIds(assignedWhere.member, { organizationId: ORG, deletedAt: null })).toEqual([...MEMBER_ONLY_IDS]);
    expect(admittedIds(unassignedWhere, {
      organizationId: ORG,
      deletedAt: null,
      counselorAssignments: [],
    })).toEqual([...MEMBER_ONLY_IDS]);
  });

  it('keeps the unassigned roster free of staff, foreign-org, deleted, and assigned accounts', async () => {
    const users = [
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember),
      memberRow(MEMBER_DEFINITION_ROSTER.profileOnlyMember),
      memberRow(MEMBER_DEFINITION_ROSTER.counselorWithBaselineRow),
      memberRow(MEMBER_DEFINITION_ROSTER.adminWithBaselineRow),
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'foreign', organizationId: OTHER }),
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'deleted', deletedAt: createdAt }),
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, {
        id: 'assigned',
        counselorAssignments: [{ active: true }],
      }),
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, {
        id: 'inactive-assign',
        counselorAssignments: [{ active: false }],
      }),
    ];
    db.userFindMany.mockImplementation(async ({ where, take }: { where: object; take: number }) =>
      users.filter((row) => matchesWhere(row, where)).slice(0, take),
    );

    const rows = await loadRosterAssignmentsByScope(ORG, { kind: 'unassigned' });
    expect(rows.map((row) => row.memberId)).toEqual(['backfilled', 'profile-only', 'inactive-assign']);
    expect(rows[0]).toMatchObject({ id: 'unassigned:backfilled', memberId: 'backfilled' });
    expect(db.userFindMany.mock.calls[0][0].take).toBe(COUNSELOR_ROSTER_CAP);
    expect(db.assignmentFindMany).not.toHaveBeenCalled();
  });

  it('pins named-counselor and all-assignment scans to the same member-only tenant filter', async () => {
    const assignments = [
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember)),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.counselorWithBaselineRow)),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'foreign', organizationId: OTHER })),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'deleted', deletedAt: createdAt })),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'other-counselor' }), {
        counselorId: 'c-other',
      }),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'foreign-counselor' }), {
        counselor: { active: true, user: { organizationId: OTHER, deletedAt: null } },
      }),
      assignmentRow(memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, { id: 'inactive-counselor' }), {
        counselor: { active: false, user: { organizationId: ORG, deletedAt: null } },
      }),
    ];
    db.assignmentFindMany.mockImplementation(async ({ where, take }: { where: object; take: number }) =>
      assignments.filter((row) => matchesWhere(row, where)).slice(0, take),
    );

    const mine = await loadRosterAssignmentsByScope(ORG, { kind: 'counselor', counselorId: COUNSELOR_ID });
    expect(mine.map((row) => row.memberId)).toEqual(['backfilled']);
    expect(db.assignmentFindMany.mock.calls[0][0]).toMatchObject({
      take: COUNSELOR_ROSTER_CAP,
      where: {
        counselorId: COUNSELOR_ID,
        active: true,
        counselor: { active: true, user: { organizationId: ORG, deletedAt: null } },
        member: { organizationId: ORG, deletedAt: null, ...MEMBER_ONLY_WHERE },
      },
    });

    const all = await loadRosterAssignmentsByScope(ORG, { kind: 'all' });
    expect(all.map((row) => row.memberId)).toEqual(['backfilled', 'other-counselor']);
    expect(db.assignmentFindMany.mock.calls[1][0].where).not.toHaveProperty('counselorId');
    expect(admittedIds(db.assignmentFindMany.mock.calls[1][0].where.member, {
      organizationId: ORG,
      deletedAt: null,
    })).toEqual([...MEMBER_ONLY_IDS]);
  });

  it('coalesces missing curriculum version and progress numbers on roster rows', async () => {
    db.userFindMany.mockResolvedValue([
      memberRow(MEMBER_DEFINITION_ROSTER.backfilledMember, {
        courseEnrollments: [{ programSlug: 'it-support', curriculumVersion: null, isPrimary: true }],
        memberProgramProgress: [{ programSlug: 'it-support', averagePercent: null, coursesCompleted: null }],
      }),
    ]);
    const [row] = await loadRosterAssignmentsByScope(ORG, { kind: 'unassigned' });
    expect(row.member.courseEnrollments).toEqual([
      { programSlug: 'it-support', curriculumVersion: '', isPrimary: true },
    ]);
    expect(row.member.memberProgramProgress).toEqual([
      { programSlug: 'it-support', averagePercent: 0, coursesCompleted: 0 },
    ]);
  });
});
