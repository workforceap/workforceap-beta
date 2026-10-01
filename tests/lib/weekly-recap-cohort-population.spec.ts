import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { matchesWhere } from '../helpers/prismaWhereMatches';
import { memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';

/**
 * Behavioural pin for the number audit (2026-09-20, F2 / F7 / S1 / S22
 * class): the weekly-recap cohort table, the weekly scoreboard, the
 * certifications cohort cards and the AI-tools cohort table each count
 * member accounts only, and "activity" is something the member did.
 *
 * A seeded roster is evaluated against the real `where` clauses the loaders
 * issue. Drop a member predicate and the staff account re-enters a count;
 * drop the activity predicate and a member who was only ever nudged by mail
 * stops reading as at risk.
 */

const NOW = new Date('2026-09-23T12:00:00Z'); // Wednesday; ISO week starts Mon 2026-09-21
const THIS_WEEK = new Date('2026-09-22T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

type SeededUser = {
  id: string;
  email: string;
  organizationId: string;
  fullName?: string;
  deletedAt: Date | null;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  courseraEnrollmentApproved: boolean;
  profile: { role: string } | null;
  userRoles: Array<{ role: { name: string } }>;
  memberEvents: Array<{ eventName: string; createdAt: Date }>;
  courseEnrollments: unknown[];
  applications: unknown[];
};

const member = (id: string, extra: Partial<SeededUser>): SeededUser => ({
  id,
  email: `${id}@example.test`,
  organizationId: 'org-1',
  deletedAt: null,
  enrolledProgram: 'it-support',
  enrolledAt: daysAgo(60),
  courseraEnrollmentApproved: false,
  profile: { role: 'member' },
  userRoles: [{ role: { name: 'member' } }],
  memberEvents: [],
  courseEnrollments: [],
  applications: [],
  ...extra,
});

const roster: SeededUser[] = [
  // Signed in yesterday, enrolled this week.
  member('member-a', { enrolledAt: THIS_WEEK, memberEvents: [{ eventName: 'login', createdAt: daysAgo(1) }] }),
  // Only ever received a nudge mail: no activity of their own for 60 days.
  member('member-b', { memberEvents: [{ eventName: 'inactive_nudge_sent', createdAt: daysAgo(2) }] }),
  // Nothing at all on file.
  member('member-c', {}),
  // The dogfooder: super_admin, enrolled this week, holding the baseline member row.
  member('staff-super', {
    email: 'founder@workforceap.org',
    enrolledAt: THIS_WEEK,
    profile: { role: 'super_admin' },
    userRoles: [{ role: { name: 'member' } }, { role: { name: 'super_admin' } }],
  }),
  // A QA fixture with a member profile and a pattern-matched email.
  member('fixture', { email: 'qa-test@workforceap.org', enrolledAt: THIS_WEEK }),
];

// A second tenant. Nothing from org-2 may reach an org-1 admin's page.
const otherOrgMember = member('other-org-member', { organizationId: 'org-2', email: 'other@example.test' });
const otherOrgCounselor = member('other-org-counselor', {
  organizationId: 'org-2', email: 'c2@example.test', profile: { role: 'counselor' }, userRoles: [{ role: { name: 'counselor' } }],
});
const counselorUser = member('counselor-1', {
  fullName: 'Casey Counselor', profile: { role: 'counselor' }, userRoles: [{ role: { name: 'counselor' } }],
});
const byId = (id: string) => [...roster, otherOrgMember, otherOrgCounselor, counselorUser].find((u) => u.id === id)!;

const certs = [
  { userId: 'member-a', user: () => byId('member-a') },
  { userId: 'staff-super', user: () => byId('staff-super') },
  { userId: 'other-org-member', user: () => byId('other-org-member') },
];

// Scoreboard rows with a twin in the other tenant for every relation path.
const applications = [
  { status: 'APPROVED', submittedAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: THIS_WEEK, user: () => byId('member-a') },
  { status: 'APPROVED', submittedAt: daysAgo(3), createdAt: daysAgo(3), updatedAt: THIS_WEEK, user: () => byId('other-org-member') },
];
const messages = [
  { authorId: 'counselor-1', createdAt: THIS_WEEK, author: () => byId('counselor-1'), thread: { kind: 'member', memberId: 'member-a' } },
  { authorId: 'other-org-counselor', createdAt: THIS_WEEK, author: () => byId('other-org-counselor'), thread: { kind: 'member', memberId: 'other-org-member' } },
];
const applicationMessages = [
  { authorId: 'counselor-1', createdAt: THIS_WEEK, author: () => byId('counselor-1') },
  { authorId: 'other-org-counselor', createdAt: THIS_WEEK, author: () => byId('other-org-counselor') },
];
const sessionEvents = [
  { eventName: 'ai_tool_run_completed', sessionId: 's1', createdAt: THIS_WEEK, metadata: { actorUserId: 'counselor-1' }, user: () => byId('member-a') },
  { eventName: 'ai_tool_run_completed', sessionId: 's2', createdAt: THIS_WEEK, metadata: { actorUserId: 'counselor-1' }, user: () => byId('other-org-member') },
];
const auditLogs = [
  { action: 'application_status_change', targetType: 'application', createdAt: THIS_WEEK, actorUserId: 'counselor-1', actor: () => byId('counselor-1') },
  { action: 'application_status_change', targetType: 'application', createdAt: THIS_WEEK, actorUserId: 'counselor-1', actor: () => byId('other-org-counselor') },
];
const counselors = [
  { id: 'c-1', userId: 'counselor-1', active: true, user: () => byId('counselor-1') },
];

/** Resolve the lazy relation thunks so `matchesWhere` sees plain rows. */
function materialize<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'function' ? (v as () => unknown)() : v])) as T;
}
function scoped<T extends Record<string, unknown>>(rows: T[], where: unknown): T[] {
  return rows.map(materialize).filter((row) => matchesWhere(row, where ?? {}));
}

// Course enrollments this week: the dogfooder's, plus one for a member who
// enrolled in a course without a user.enrolledAt this week. "Enrollments" is
// the union of both halves; the staff half must be filtered like the first.
const courseEnrollments = [
  { userId: 'staff-super', enrolledAt: THIS_WEEK, user: () => roster.find((u) => u.id === 'staff-super')! },
  { userId: 'member-c', enrolledAt: THIS_WEEK, user: () => roster.find((u) => u.id === 'member-c')! },
];

const toolRuns = [
  { userId: 'member-a', createdAt: daysAgo(1) },
  { userId: 'staff-super', createdAt: daysAgo(1) },
  { userId: 'staff-super', createdAt: daysAgo(2) },
];

type Query = { where?: unknown; select?: { memberEvents?: { where?: unknown } } };

// Every `prisma.user` read sees both tenants: a query without an org predicate
// admits org-2's member into an org-1 admin's cohort.
function admitted(where: unknown): SeededUser[] {
  return [...roster, otherOrgMember, otherOrgCounselor, counselorUser].filter((u) => matchesWhere(u, where ?? {}));
}

/** `prisma.user.findMany` shaped rows; honours a nested `memberEvents.where` select filter. */
function findManyUsers({ where, select }: Query) {
  return admitted(where).map((u) => ({
    ...u,
    memberEvents: select?.memberEvents?.where
      ? u.memberEvents.filter((e) => matchesWhere(e, select.memberEvents!.where))
      : u.memberEvents,
  }));
}

function rawIsMemberOnly(strings: TemplateStringsArray, values: unknown[]): boolean {
  const q = Prisma.sql(strings, ...values);
  return q.sql.replace(/\s+/g, ' ').includes(memberOnlySqlJoin().sql.replace(/\s+/g, ' ').trim());
}

vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: vi.fn(async (query: () => Promise<unknown>) => query()),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: {
      count: vi.fn(async ({ where }: Query) => admitted(where).length),
      findMany: vi.fn(async (q: Query) => findManyUsers(q)),
      groupBy: vi.fn(async ({ where }: Query) => {
        const counts = new Map<string | null, number>();
        for (const u of admitted(where)) counts.set(u.enrolledProgram, (counts.get(u.enrolledProgram) ?? 0) + 1);
        return [...counts.entries()].map(([enrolledProgram, count]) => ({ enrolledProgram, _count: { _all: count } }));
      }),
    },
    userCertification: { findMany: vi.fn(async ({ where }: Query) => scoped(certs, where)) },
    aIToolResult: { findMany: vi.fn(async () => toolRuns), groupBy: vi.fn(async () => []) },
    application: { findMany: vi.fn(async ({ where }: Query) => scoped(applications, where)) },
    courseEnrollment: {
      findMany: vi.fn(async ({ where }: Query) =>
        courseEnrollments
          .map((row) => ({ userId: row.userId, enrolledAt: row.enrolledAt, user: row.user() }))
          .filter((row) => matchesWhere(row, where ?? {}))),
    },
    message: {
      count: vi.fn(async ({ where }: Query) => scoped(messages, where).length),
      findMany: vi.fn(async ({ where }: Query) => scoped(messages, where)),
    },
    applicationMessage: { count: vi.fn(async ({ where }: Query) => scoped(applicationMessages, where).length) },
    counselor: {
      findMany: vi.fn(async ({ where }: Query) =>
        scoped(counselors, where).map((c) => {
          // `scoped` materialised the thunk; only the type still says function.
          const u = c.user as unknown as SeededUser;
          return { ...c, user: { fullName: u.fullName, email: u.email } };
        })),
    },
    memberEvent: { findMany: vi.fn(async ({ where }: Query) => scoped(sessionEvents, where)) },
    auditLog: { findMany: vi.fn(async ({ where }: Query) => scoped(auditLogs, where)) },
  },
}));

import {
  getAiToolsCohortStats,
  getCertificationsCohortStats,
  getWeeklyRecapCohortStats,
  getWeeklyScoreboardStats,
} from '@/lib/admin/cohortAnalytics';
import { prisma } from '@/lib/db/prisma';

beforeEach(() => {
  vi.mocked(prisma.$queryRaw).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Prisma.sql(strings, ...values).sql;
    if (sql.includes('FROM weekly_recaps')) {
      // The recap cron wrote a recap for every enrolled account, staff included.
      // Only a member-joined aggregate leaves the dogfooder out.
      const memberOnly = rawIsMemberOnly(strings, values);
      return [{ enrolledProgram: 'it-support', totalRecaps: memberOnly ? 3 : 5, membersWithRecap: memberOnly ? 2 : 3, recapsLast7Days: 1, avgReadinessScore: 70 }];
    }
    return [];
  }) as never);
});

describe('weekly recap and cohort tables count members only', () => {
  it('the recap cohort table and its recap aggregate share the member population', async () => {
    const rows = await getWeeklyRecapCohortStats('org-1');
    const itSupport = rows.find((r) => r.cohortKey === 'it-support');

    // Five enrolled org-1 accounts on the roster (three members) plus one
    // org-2 member; the org-1 table shows three.
    expect(roster.filter((u) => u.enrolledProgram === 'it-support')).toHaveLength(5);
    expect(itSupport?.memberCount).toBe(3);
    expect(itSupport?.membersWithRecap).toBe(2);
    expect(itSupport?.totalRecaps).toBe(3);
  });

  it('the scoreboard counts member enrollments, and at-risk means a member with no activity of their own', async () => {
    const board = await getWeeklyScoreboardStats(NOW, 'org-1');

    // Enrollments is a union: three accounts got user.enrolledAt this ISO week
    // (member-a, the dogfooder, the fixture) and two course enrollments were
    // written (the dogfooder again, member-c). Members only: member-a + member-c.
    expect(courseEnrollments).toHaveLength(2);
    expect(board.comparison.enrollments).toBe(2);

    // At risk: member-b (mailed, never acted) and member-c (silent). Not
    // member-a (signed in yesterday), not the staff account, not the fixture.
    expect(board.atRisk.count).toBe(2);
    expect(board.atRisk.sample.map((m) => m.id).sort()).toEqual(['member-b', 'member-c']);
    // The nudge mail is not member-b's "last activity".
    expect(board.atRisk.sample.find((m) => m.id === 'member-b')?.lastActivityAt).toBeNull();
  });

  it('certification cohort cards divide member certs by members', async () => {
    const rows = await getCertificationsCohortStats('org-1');
    const itSupport = rows.find((r) => r.cohortKey === 'it-support');

    expect(itSupport?.memberCount).toBe(3);
    // Three certification rows exist: the staff one is not a member cert and
    // the other tenant's member is not in this cohort.
    expect(certs).toHaveLength(3);
    expect(itSupport?.membersWithCert).toBe(1);
    expect(itSupport?.totalCerts).toBe(1);
  });

  it('an org admin\'s scoreboard reads only their organisation through every relation path', async () => {
    const board = await getWeeklyScoreboardStats(NOW, 'org-1');

    // One APPROVED application per tenant this week; only org-1's counts.
    expect(applications).toHaveLength(2);
    expect(board.comparison.approvals).toBe(1);
    expect(board.comparison.applicationsReviewed).toBe(1);
    // One portal message and one application message per tenant: 2, not 4.
    expect(board.comparison.messagesSent).toBe(2);
    // The org-1 counselor's leaderboard row: the org-2 session and the org-2
    // actor's audit row do not credit it.
    const casey = board.counselors.find((c) => c.counselorUserId === 'counselor-1');
    expect(casey?.sessionsHeld).toBe(1);
    expect(casey?.applicationsReviewed).toBe(1);
    expect(casey?.membersContacted).toBe(1);
  });

  it('the certifications cohort table is scoped to the organisation when one is given', async () => {
    const rows = await getCertificationsCohortStats('org-1');
    // The other tenant's member and their certification never enter the cohort
    // (without the org predicate the member is a fourth cohort row and a second cert).
    expect(rows.find((r) => r.cohortKey === 'it-support')?.memberCount).toBe(3);
    expect(rows.reduce((s, r) => s + r.totalCerts, 0)).toBe(1);
    // The platform-wide view still admits them.
    const all = await getCertificationsCohortStats(null);
    expect(all.reduce((s, r) => s + r.totalCerts, 0)).toBe(2);
  });

  it('AI-tools cohort rows exclude staff from members and from members using tools', async () => {
    const rows = await getAiToolsCohortStats('org-1');
    const itSupport = rows.find((r) => r.cohortKey === 'it-support');

    expect(itSupport?.memberCount).toBe(3);
    // Three runs on file, two of them the dogfooder's.
    expect(toolRuns).toHaveLength(3);
    expect(itSupport?.membersUsedTools).toBe(1);
    expect(itSupport?.totalRuns).toBe(1);
  });
});
