import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';

/**
 * Behavioural pin for the number audit (2026-09-20, F1-F3, F7): every
 * placement figure and organisation KPI counts member-role accounts only.
 *
 * A seeded roster of real members plus one super_admin dogfooder, one admin
 * and one fixture account is evaluated against the real `where` clauses the
 * loaders issue. If any loader drops the member-only predicate, the staff
 * placement re-enters the numerator or the staff accounts re-enter the
 * denominator and these expectations fail.
 */

type SeededUser = {
  id: string;
  email: string;
  organizationId: string;
  deletedAt: Date | null;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  profile: { role: string; veteranStatus: string | null } | null;
  /** `roles.name` per `user_roles` row — the source of truth since #2433. */
  userRoles: string[];
  placement: { placedAt: Date; salaryOffered: number | null } | null;
};

const ORG = 'org-1';
const enrolledAt = new Date('2026-02-01T00:00:00Z');
const placedAt = new Date('2026-05-01T00:00:00Z');

const rowOnlyMember: SeededUser = {
  id: 'row-only-member',
  email: 'not.backfilled@example.test',
  organizationId: ORG,
  deletedAt: null,
  enrolledProgram: 'it-support',
  enrolledAt,
  profile: null,
  userRoles: ['member'],
  placement: null,
};

const staffWithBaselineRow: SeededUser = {
  id: 'staff-baseline-row',
  email: 'ops2@workforceap.org',
  organizationId: ORG,
  deletedAt: null,
  enrolledProgram: 'cybersecurity',
  enrolledAt,
  profile: { role: 'admin', veteranStatus: null },
  userRoles: ['member'],
  placement: null,
};

const roster: SeededUser[] = [
  ...Array.from({ length: 35 }, (_, i) => ({
    id: `member-${i}`,
    email: `member${i}@example.test`,
    organizationId: ORG,
    deletedAt: null,
    enrolledProgram: 'it-support',
    enrolledAt,
    profile: { role: 'member', veteranStatus: i === 0 ? 'Veteran' : null },
    userRoles: ['member'],
    placement: null,
  })),
  // The dogfood record: a super_admin with an enrolled program and the org's only placement.
  {
    id: 'staff-super',
    email: 'founder@workforceap.org',
    organizationId: ORG,
    deletedAt: null,
    enrolledProgram: 'it-support',
    enrolledAt,
    profile: { role: 'super_admin', veteranStatus: 'Veteran' },
    userRoles: ['member'],
    placement: { placedAt, salaryOffered: null },
  },
  {
    id: 'staff-admin',
    email: 'ops@workforceap.org',
    organizationId: ORG,
    deletedAt: null,
    enrolledProgram: 'cybersecurity',
    enrolledAt,
    profile: { role: 'super_admin', veteranStatus: 'Disabled Veteran' },
    userRoles: ['member'],
    placement: null,
  },
  // A test account with a member profile but a fixture email, also "placed".
  {
    id: 'fixture',
    email: 'member.success@workforceap.org',
    organizationId: ORG,
    deletedAt: null,
    enrolledProgram: 'it-support',
    enrolledAt,
    profile: { role: 'member', veteranStatus: null },
    userRoles: ['member'],
    placement: { placedAt, salaryOffered: 52000 },
  },
  // A seeded referral fixture (role = member, pattern-matched email, in a program).
  // Mike, 2026-09-20: "make sure test members get cut out".
  {
    id: 'seeded-referral',
    email: 'referral-member-a@workforceap.org',
    organizationId: ORG,
    deletedAt: null,
    enrolledProgram: 'it-support',
    enrolledAt,
    profile: { role: 'member', veteranStatus: 'Veteran' },
    userRoles: ['member'],
    placement: null,
  },
  // WAP-182 item 3: a member by `user_roles` whose profile the backfill has
  // not reached. `getProfileRole` already calls this account a member, so
  // every count must too.
  rowOnlyMember,
  // The mirror image: a staff profile carrying the baseline `member` row that
  // `ensureAppUser` grants everyone. The row must not make them a member.
  staffWithBaselineRow,
];

// ── Minimal evaluator for the where shapes the loaders use ──

type UserWhere = Record<string, unknown>;

function matchScalar(filter: unknown, value: unknown): boolean {
  if (filter === null) return value === null;
  if (filter !== null && typeof filter === 'object' && !(filter instanceof Date)) {
    const f = filter as Record<string, unknown>;
    if ('not' in f) return !matchScalar(f.not, value);
    if ('notIn' in f) return !(f.notIn as unknown[]).includes(value);
    if ('in' in f) return (f.in as unknown[]).includes(value);
    if ('startsWith' in f) return typeof value === 'string' && value.startsWith(f.startsWith as string);
    if ('endsWith' in f) return typeof value === 'string' && value.endsWith(f.endsWith as string);
    if ('gte' in f || 'lte' in f) {
      const v = value instanceof Date ? value.getTime() : Number(value);
      if (f.gte !== undefined && v < (f.gte as Date).getTime()) return false;
      if (f.lte !== undefined && v > (f.lte as Date).getTime()) return false;
      return true;
    }
    throw new Error(`unsupported scalar filter ${JSON.stringify(filter)}`);
  }
  return filter === value;
}

function matchesUser(where: UserWhere, u: SeededUser): boolean {
  for (const [key, filter] of Object.entries(where)) {
    switch (key) {
      case 'deletedAt': if (!matchScalar(filter, u.deletedAt)) return false; break;
      case 'organizationId': if (!matchScalar(filter, u.organizationId)) return false; break;
      case 'email': if (!matchScalar(filter, u.email)) return false; break;
      case 'enrolledProgram': if (!matchScalar(filter, u.enrolledProgram)) return false; break;
      case 'enrolledAt': if (!matchScalar(filter, u.enrolledAt)) return false; break;
      case 'profile': {
        // `profile: null` is Prisma's "no related row".
        if (filter === null) {
          if (u.profile) return false;
          break;
        }
        if (!u.profile) return false;
        const pf = filter as { role?: unknown };
        if (pf.role !== undefined && !matchScalar(pf.role, u.profile.role)) return false;
        break;
      }
      case 'userRoles': {
        const rf = filter as { some?: { role: { name: string } }; none?: { role: { name: string } } };
        if (rf.some && !u.userRoles.includes(rf.some.role.name)) return false;
        if (rf.none && u.userRoles.includes(rf.none.role.name)) return false;
        break;
      }
      case 'OR': {
        if (!(filter as UserWhere[]).some((clause) => matchesUser(clause, u))) return false;
        break;
      }
      case 'courseEnrollments': break; // `none: {}` — the seeded roster has no course_enrollments rows
      case 'NOT': {
        // Prisma `NOT: [...]`: the row is out when any listed condition matches.
        const clauses = Array.isArray(filter) ? (filter as UserWhere[]) : [filter as UserWhere];
        if (clauses.some((clause) => matchesUser(clause, u))) return false;
        break;
      }
      default: throw new Error(`unsupported user filter ${key}`);
    }
  }
  return true;
}

function matchesPlacement(where: Record<string, unknown>, u: SeededUser): boolean {
  if (!u.placement) return false;
  for (const [key, filter] of Object.entries(where)) {
    switch (key) {
      case 'user': if (!matchesUser(filter as UserWhere, u)) return false; break;
      case 'placedAt': if (!matchScalar(filter, u.placement.placedAt)) return false; break;
      case 'salaryOffered': if (!matchScalar(filter, u.placement.salaryOffered)) return false; break;
      case 'programSlug': break;
      default: throw new Error(`unsupported placement filter ${key}`);
    }
  }
  return true;
}

type ProfileWhere = { role?: unknown; user?: UserWhere; OR?: ProfileWhere[]; NOT?: ProfileWhere | ProfileWhere[] };

function matchesProfile(where: ProfileWhere, u: SeededUser): boolean {
  if (!u.profile) return false;
  if (where.role !== undefined && !matchScalar(where.role, u.profile.role)) return false;
  if (where.user && !matchesUser(where.user, u)) return false;
  if (where.OR && !where.OR.some((clause) => matchesProfile(clause, u))) return false;
  if (where.NOT) {
    const clauses = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    if (clauses.some((clause) => matchesProfile(clause, u))) return false;
  }
  return true;
}

/** Raw SQL is evaluated by its member join: with the join, only members feed the aggregate. */
function rawIsMemberOnly(strings: TemplateStringsArray, values: unknown[]): boolean {
  const q = Prisma.sql(strings, ...values);
  return q.sql.replace(/\s+/g, ' ').includes(memberOnlySqlJoin().sql.replace(/\s+/g, ' ').trim());
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      count: vi.fn(async ({ where }: { where: UserWhere }) => roster.filter((u) => matchesUser(where, u)).length),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    placementRecord: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => roster.filter((u) => matchesPlacement(where, u)).length),
      aggregate: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = roster.filter((u) => matchesPlacement(where, u));
        const sum = rows.reduce((s, u) => s + (u.placement?.salaryOffered ?? 0), 0);
        return { _sum: { salaryOffered: rows.length ? sum : null }, _count: { salaryOffered: rows.length } };
      }),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        roster.filter((u) => matchesPlacement(where, u)).map((u) => ({
          jobTitle: 'Help Desk', salaryOffered: u.placement!.salaryOffered, placedAt: u.placement!.placedAt, programSlug: null,
          user: { enrolledProgram: u.enrolledProgram, enrolledAt: u.enrolledAt, courseEnrollments: [] },
        }))),
    },
    courseEnrollment: { groupBy: vi.fn(async () => []) },
    profile: {
      groupBy: vi.fn(async ({ by, where }: { by: string[]; where: ProfileWhere }) => {
        const field = by[0] as 'veteranStatus';
        const counts = new Map<string | null, number>();
        for (const u of roster) {
          if (!matchesProfile(where, u)) continue;
          const value = u.profile![field];
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts.entries()].map(([value, count]) => ({ [field]: value, _count: { _all: count } }));
      }),
    },
  },
}));

import { getBoardOutcomes } from '@/lib/admin/boardOutcomes';
import { getMemberOutcomesSummary } from '@/lib/admin/memberOutcomesSummary';
import { prisma } from '@/lib/db/prisma';

beforeEach(() => {
  vi.mocked(prisma.$queryRaw).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const memberOnly = rawIsMemberOnly(strings, values);
    const sql = Prisma.sql(strings, ...values).sql;
    // Median / weeks: only the staff and fixture placements exist, so a member-only query finds none.
    if (sql.includes('PERCENTILE_CONT(0.5)')) return [{ median: memberOnly ? null : 52000 }];
    if (sql.includes('AVG(EXTRACT(EPOCH')) return [{ avg_weeks: memberOnly ? null : 12.9 }];
    if (sql.includes('FILTER (WHERE certified)')) return [{ certified: BigInt(0), in_training: BigInt(memberOnly ? 3 : 5) }];
    return [];
  }) as never);
});

describe('funder-facing outcome figures count members only', () => {
  it('a staff dogfood placement is not the organisation placement rate, and staff are not members served', async () => {
    const outcomes = await getBoardOutcomes('all-time', ORG);

    // 41 enrolled accounts in the org: 35 members + 2 super_admins + 1 fixture
    // + 1 seeded referral member + 1 not-yet-backfilled member + 1 staff
    // account holding the baseline `member` row.
    expect(roster.filter((u) => u.enrolledProgram).length).toBe(41);
    // 36 members: the 35 with a profile role plus the one only `user_roles` names.
    expect(outcomes.totals.membersServed).toBe(36);
    expect(outcomes.totals.membersEnrolled).toBe(36);

    // Two placement records exist (super_admin, fixture email); neither is a member placement.
    expect(roster.filter((u) => u.placement).length).toBe(2);
    expect(outcomes.totals.membersPlaced).toBe(0);
    expect(outcomes.totals.placementRate).toBe(0);
    expect(outcomes.totals.medianAnnualSalary).toBeNull();
    expect(outcomes.totals.totalAnnualSalaryValue).toBe(0);
    expect(outcomes.totals.averageWeeksToPlacement).toBeNull();
    expect(outcomes.placements).toEqual([]);
    expect(outcomes.funnel.find((f) => f.stage === 'Placed')?.count).toBe(0);
  });

  it('board demographics are member profiles, not staff profiles', async () => {
    const outcomes = await getBoardOutcomes('all-time', ORG);
    // Staff profiles hold two of the three veteran statuses in the org, and the seeded
    // referral member is a "Veteran" too; only the real member one may print.
    expect(outcomes.demographics.veteranBreakdown).toEqual([
      { label: 'Veteran', count: 1 },
      { label: 'Not reported', count: 34 },
    ]);
  });

  it('a test account does not contribute to the member-detail placement rate either', async () => {
    const summary = await getMemberOutcomesSummary(ORG, new Date('2026-06-01T00:00:00Z'));
    expect(summary).toMatchObject({ membersEnrolled: 36, membersPlaced: 0, placedLast90d: 0, placementRate: 0, averageWeeksToPlacement: null });
  });

  it('would count the staff placement if the member-only predicate were dropped (the evaluator is not vacuous)', () => {
    const naiveUserWhere = { deletedAt: null, enrolledProgram: { not: null }, organizationId: ORG };
    expect(roster.filter((u) => matchesUser(naiveUserWhere, u)).length).toBe(41);
    // Role alone is not enough either: the seeded referral member has role = member.
    const roleOnlyWhere = { ...naiveUserWhere, profile: { role: 'member' } };
    expect(roster.filter((u) => matchesUser(roleOnlyWhere, u)).length).toBe(37);
    expect(roster.filter((u) => matchesPlacement({ user: { organizationId: ORG } }, u)).length).toBe(2);
  });

  it('converges the two live definitions of a member (WAP-182 item 3)', () => {
    const where = { deletedAt: null, organizationId: ORG, ...MEMBER_ONLY_WHERE } as UserWhere;
    // A `user_roles` member row is enough, and a baseline row on a staff
    // profile is not.
    expect(matchesUser(where, rowOnlyMember)).toBe(true);
    expect(matchesUser(where, staffWithBaselineRow)).toBe(false);

    // The definition every count used before this change — `profiles.role =
    // 'member'` — misses the first account entirely. That gap is the drift.
    const profileRoleOnly = { ...where, profile: { role: 'member' } } as UserWhere;
    expect(matchesUser(profileRoleOnly, rowOnlyMember)).toBe(false);
    expect(roster.filter((u) => matchesUser(where, u)).length)
      .toBe(roster.filter((u) => matchesUser(profileRoleOnly, u)).length + 1);

    // And the bare `user_roles` filter the WIOA report used counted staff.
    const rowOnly = { deletedAt: null, organizationId: ORG, userRoles: { some: { role: { name: 'member' } } } } as UserWhere;
    expect(matchesUser(rowOnly, staffWithBaselineRow)).toBe(true);
  });
});
