import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROGRESS_LEDGER_ROWS,
  PROGRESS_METRICS_PRISMA_ROUND_TRIPS,
  PROGRESS_POINTS_TRANSACTION_TAKE,
  loadProgressMetrics,
  type ProgressMetricsDb,
} from './loadProgressMetrics';
import { loadMemberDashboardHome } from './loadMemberDashboardHome';
import { MEMBER_TREND_WEEK_MS } from './memberPointsTrend';
import { EVENT_LABELS } from './pointsConfig';
import { ACTIVE_APPLICATION_STATUSES } from './jobPipelineDisplay';
import { getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

const NOW = new Date('2026-10-25T15:00:00.000Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ID = 'member-under-test';
const OTHER_USER_ID = 'someone-else';
const PROGRAM_SLUG = 'it-support-professional-certificate-ibm';

type Fixture = {
  enrolledProgram: string | null;
  organization: { courses: unknown[] };
  courseEnrollments: Array<{ id: string; programSlug: string; curriculumVersion?: string; isPrimary: boolean; enrolledAt: Date }>;
  courseProgress: Array<{ programSlug: string; courseSlug: string; courseId: string | null; percentComplete: number; status: string }>;
  memberProgramProgress: Array<{ programSlug: string }>;
  memberPoints: { totalPoints: number; currentStreak: number; longestStreak: number; lastActiveDate: Date | null } | null;
  pointsTransactions: Array<{ event: string; points: number; createdAt: Date }>;
  _count: { userCertifications: number; jobApplications: number };
};

function program() {
  const found = getProgramBySlug(canonicalizeProgramSlug(PROGRAM_SLUG));
  assert.ok(found, 'fixture program must exist in the catalog');
  return found;
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  const first = program().courses[0];
  return {
    enrolledProgram: PROGRAM_SLUG,
    organization: { courses: [] },
    courseEnrollments: [{ id: 'enr-1', programSlug: PROGRAM_SLUG, isPrimary: true, enrolledAt: new Date('2026-08-01T00:00:00.000Z') }],
    courseProgress: [{ programSlug: PROGRAM_SLUG, courseSlug: first.slug, courseId: null, percentComplete: 100, status: 'COMPLETED' }],
    memberProgramProgress: [],
    memberPoints: { totalPoints: 250, currentStreak: 4, longestStreak: 9, lastActiveDate: new Date(NOW) },
    pointsTransactions: [
      { event: 'course_completed', points: 75, createdAt: new Date(NOW - 1 * 60 * 60 * 1000) },
      { event: 'daily_study', points: 5, createdAt: new Date(NOW - 2 * DAY_MS) },
      { event: 'job_application', points: 25, createdAt: new Date(NOW - 10 * DAY_MS) },
    ],
    _count: { userCertifications: 1, jobApplications: 2 },
    ...overrides,
  };
}

type Call = { where: { id: string }; select: Record<string, unknown> };

/**
 * A Prisma stand-in routed by the `select` the loader asks for, so each of the
 * three reads can be made to fail on its own. Rows are keyed by user id: any
 * other id reads as "no such member", which is how the scoping test proves the
 * loader only ever asks for the signed-in member.
 */
function mockDb(opts: {
  rows?: Record<string, Fixture | null>;
  fail?: Partial<Record<'courses' | 'counts' | 'points', Error>>;
} = {}) {
  const rows = opts.rows ?? { [USER_ID]: fixture() };
  const calls: Call[] = [];
  const db: ProgressMetricsDb = {
    user: {
      async findUnique(args: unknown) {
        const { where, select } = args as Call;
        calls.push({ where, select });
        const kind = 'courseProgress' in select ? 'courses' : '_count' in select ? 'counts' : 'points';
        const failure = opts.fail?.[kind];
        if (failure) throw failure;
        const row = rows[where.id] ?? null;
        if (!row) return null;
        if (kind === 'courses') {
          return {
            enrolledProgram: row.enrolledProgram,
            organization: row.organization,
            courseEnrollments: row.courseEnrollments,
            courseProgress: row.courseProgress,
            memberProgramProgress: row.memberProgramProgress,
          };
        }
        if (kind === 'counts') return { _count: row._count };
        return { memberPoints: row.memberPoints, pointsTransactions: row.pointsTransactions };
      },
    },
  };
  return { db, calls };
}

/** Silence and capture the structured logger (it writes JSON lines to console.error). */
function captureErrors(t: TestContext): string[] {
  const lines: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return lines;
}

test('happy path: every number is read for the signed-in member and shaped like Home shapes it', async () => {
  const { db, calls } = mockDb();
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);

  const courseCount = program().courses.length;
  assert.equal(metrics.coursePercent, Math.round(100 / courseCount));
  assert.equal(metrics.activeApplications, 2);
  assert.equal(metrics.certificates, 1);
  assert.equal(metrics.points, 250);
  assert.equal(metrics.pointsThisWeek, 80, 'rolling 7 days: the hour-old 75 and the 2-day-old 5, not the 10-day-old 25');
  assert.equal(metrics.currentStreak, 4);
  assert.equal(metrics.longestStreak, 9);
  assert.deepEqual(metrics.ledger, [
    { label: EVENT_LABELS.course_completed, amount: 75, color: 'accent' },
    { label: EVENT_LABELS.daily_study, amount: 5, color: 'gold' },
    { label: EVENT_LABELS.job_application, amount: 25, color: 'info' },
  ]);

  assert.equal(calls.length, PROGRESS_METRICS_PRISMA_ROUND_TRIPS, 'three bounded reads, no more');
  assert.equal(PROGRESS_METRICS_PRISMA_ROUND_TRIPS, 3);
  for (const call of calls) assert.deepEqual(call.where, { id: USER_ID }, 'every read is scoped to the signed-in member');
});

test('every list in the three reads is bounded and the application count uses the Jobs page definition', async () => {
  const { db, calls } = mockDb();
  await loadProgressMetrics(USER_ID, db, NOW);

  type Bounded = { take?: number; select?: Record<string, unknown> };
  const selectOf = (key: string) => calls.find((call) => key in call.select)?.select as Record<string, unknown>;
  const courses = selectOf('courseProgress') as Record<string, Bounded> & {
    organization: { select: { courses: Bounded } };
  };
  for (const key of ['courseProgress', 'courseEnrollments', 'memberProgramProgress']) {
    assert.equal(typeof courses[key].take, 'number', `${key} has a take`);
    assert.ok((courses[key].take ?? Infinity) <= 500, `${key} take stays bounded`);
    assert.ok(courses[key].select, `${key} selects explicit columns`);
  }
  assert.equal(typeof courses.organization.select.courses.take, 'number');
  const points = selectOf('pointsTransactions') as { pointsTransactions: Bounded };
  assert.equal(points.pointsTransactions.take, PROGRESS_POINTS_TRANSACTION_TAKE);
  assert.deepEqual(Object.keys(points.pointsTransactions.select ?? {}).sort(), ['createdAt', 'event', 'points']);
  const counts = (selectOf('_count') as { _count: { select: { userCertifications: boolean; jobApplications: { where: unknown } } } })._count.select;
  assert.deepEqual(counts.jobApplications.where, { status: { in: [...ACTIVE_APPLICATION_STATUSES] } });
  assert.equal(counts.userCertifications, true);
});

for (const failing of ['courses', 'counts', 'points'] as const) {
  test(`one failed read (${failing}) nulls only its own fields; the others stay intact and the failure is logged without the member id`, async (t) => {
    const logged = captureErrors(t);
    const { db } = mockDb({ fail: { [failing]: Object.assign(new Error(`boom for ${USER_ID}`), { name: 'PrismaClientKnownRequestError', code: 'P2024' }) } });
    const metrics = await loadProgressMetrics(USER_ID, db, NOW);

    const owned = {
      courses: ['coursePercent'],
      counts: ['activeApplications', 'certificates'],
      points: ['points', 'pointsThisWeek', 'ledger', 'currentStreak', 'longestStreak'],
    }[failing];
    for (const [field, value] of Object.entries(metrics)) {
      if (owned.includes(field)) assert.equal(value, null, `${field} is unknown when its read failed`);
      else assert.notEqual(value, null, `${field} is unaffected by the ${failing} failure`);
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], new RegExp(`"read":"${failing}"`));
    assert.match(logged[0], /PrismaClientKnownRequestError P2024/);
    assert.ok(!logged[0].includes(USER_ID), 'neither the member id nor the error message is logged');
  });
}

test('all reads failing returns all-null, never zeros, and does not throw', async (t) => {
  captureErrors(t);
  const err = new Error('db down');
  const { db } = mockDb({ fail: { courses: err, counts: err, points: err } });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.deepEqual(metrics, {
    coursePercent: null,
    activeApplications: null,
    certificates: null,
    points: null,
    pointsThisWeek: null,
    ledger: null,
    currentStreak: null,
    longestStreak: null,
  });
});

test('an empty member (enrolled, nothing done yet) gets real zeros, not nulls', async () => {
  const { db } = mockDb({
    rows: {
      [USER_ID]: fixture({
        courseProgress: [],
        memberPoints: null,
        pointsTransactions: [],
        _count: { userCertifications: 0, jobApplications: 0 },
      }),
    },
  });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.deepEqual(metrics, {
    coursePercent: 0,
    activeApplications: 0,
    certificates: 0,
    points: 0,
    pointsThisWeek: 0,
    ledger: [],
    currentStreak: 0,
    longestStreak: 0,
  });
});

test('a member with no program has no course percent to report (null), but the other numbers are real zeros', async () => {
  const { db } = mockDb({
    rows: {
      [USER_ID]: fixture({
        enrolledProgram: null,
        courseEnrollments: [],
        courseProgress: [],
        memberPoints: null,
        pointsTransactions: [],
        _count: { userCertifications: 0, jobApplications: 0 },
      }),
    },
  });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.coursePercent, null);
  assert.equal(metrics.activeApplications, 0);
  assert.equal(metrics.points, 0);
});

test('a member row that does not exist is unknown, not zero', async () => {
  const { db } = mockDb({ rows: {} });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.ok(Object.values(metrics).every((value) => value === null));
});

test('the loader asks only for the id it was given and never returns another member\'s numbers', async () => {
  const { db, calls } = mockDb({
    rows: {
      [USER_ID]: fixture({ _count: { userCertifications: 1, jobApplications: 1 } }),
      [OTHER_USER_ID]: fixture({ _count: { userCertifications: 9, jobApplications: 9 } }),
    },
  });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.certificates, 1);
  assert.ok(calls.every((call) => call.where.id === USER_ID));
});

test('a lapsed streak reads 0 while the best streak is kept (the points page and Home rule)', async () => {
  const { db } = mockDb({
    rows: {
      [USER_ID]: fixture({
        memberPoints: { totalPoints: 250, currentStreak: 6, longestStreak: 11, lastActiveDate: new Date(NOW - 5 * DAY_MS) },
      }),
    },
  });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.currentStreak, 0);
  assert.equal(metrics.longestStreak, 11);
});

test('streak expiry follows the injected UTC day across midnight, independent of the wall clock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2030-01-01T12:00:00.000Z') });
  const { db } = mockDb({
    rows: {
      [USER_ID]: fixture({
        memberPoints: { totalPoints: 250, currentStreak: 4, longestStreak: 9, lastActiveDate: new Date('2026-10-25T23:59:59.999Z') },
      }),
    },
  });

  for (const [at, expectedStreak] of [
    ['2026-10-25T23:59:59.999Z', 4],
    ['2026-10-26T23:59:59.999Z', 4],
    ['2026-10-27T00:00:00.000Z', 0],
  ] as const) {
    const metrics = await loadProgressMetrics(USER_ID, db, Date.parse(at));
    assert.equal(metrics.currentStreak, expectedStreak, at);
    assert.equal(metrics.longestStreak, 9, 'expiry does not change the best streak');
    assert.equal(metrics.points, 250, 'expiry does not change earned points');
  }
});

test('"this week" is the rolling 7-day window: exactly 7 days old counts, older does not, future-dated counts', async () => {
  const { db } = mockDb({
    rows: {
      [USER_ID]: fixture({
        pointsTransactions: [
          { event: 'daily_study', points: 1, createdAt: new Date(NOW + 60 * 1000) },
          { event: 'daily_study', points: 10, createdAt: new Date(NOW - MEMBER_TREND_WEEK_MS) },
          { event: 'daily_study', points: 100, createdAt: new Date(NOW - MEMBER_TREND_WEEK_MS - 1) },
        ],
      }),
    },
  });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.pointsThisWeek, 11);
});

test('a full page of rows that all fall inside the week reports "this week" as unknown, not as a short total', async () => {
  const rows = Array.from({ length: PROGRESS_POINTS_TRANSACTION_TAKE }, (_, index) => ({
    event: 'daily_study',
    points: 1,
    createdAt: new Date(NOW - index * 60 * 1000),
  }));
  const { db } = mockDb({ rows: { [USER_ID]: fixture({ pointsTransactions: rows }) } });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.pointsThisWeek, null);
  assert.equal(metrics.points, 250, 'the total comes from member_points, not from the page of rows');
  assert.equal(metrics.ledger?.length, PROGRESS_LEDGER_ROWS);

  // A full page that reaches back past the window proves the window is complete.
  const reachingBack = rows.map((row, index) => (index === rows.length - 1 ? { ...row, createdAt: new Date(NOW - 8 * DAY_MS) } : row));
  const reached = mockDb({ rows: { [USER_ID]: fixture({ pointsTransactions: reachingBack }) } });
  assert.equal((await loadProgressMetrics(USER_ID, reached.db, NOW)).pointsThisWeek, PROGRESS_POINTS_TRANSACTION_TAKE - 1);
});

test('the ledger is the newest rows, capped, with Home\'s labels', async () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    event: index % 2 === 0 ? 'course_completed' : 'daily_study',
    points: index + 1,
    createdAt: new Date(NOW - index * 60 * 1000),
  }));
  const { db } = mockDb({ rows: { [USER_ID]: fixture({ pointsTransactions: many }) } });
  const metrics = await loadProgressMetrics(USER_ID, db, NOW);
  assert.equal(metrics.ledger?.length, PROGRESS_LEDGER_ROWS);
  assert.deepEqual(metrics.ledger?.map((entry) => entry.amount), [1, 2, 3, 4, 5]);
  assert.equal(metrics.ledger?.[0].label, EVENT_LABELS.course_completed);
});

test('parity: the numbers equal what loadMemberDashboardHome computes from the same member row', async () => {
  const first = program().courses[0];
  const second = program().courses[1];
  const row = fixture({
    courseProgress: [
      { programSlug: PROGRAM_SLUG, courseSlug: first.slug, courseId: null, percentComplete: 100, status: 'COMPLETED' },
      { programSlug: PROGRAM_SLUG, courseSlug: second.slug, courseId: null, percentComplete: 40, status: 'IN_PROGRESS' },
    ],
    memberPoints: { totalPoints: 1240, currentStreak: 12, longestStreak: 20, lastActiveDate: new Date() },
    pointsTransactions: [
      { event: 'course_completed', points: 75, createdAt: new Date(Date.now() - 60 * 1000) },
      { event: 'job_application', points: 25, createdAt: new Date(Date.now() - 3 * DAY_MS) },
      { event: 'daily_study', points: 5, createdAt: new Date(Date.now() - 9 * DAY_MS) },
    ],
    _count: { userCertifications: 3, jobApplications: 4 },
  });

  const homeRow = {
    fullName: 'Alex Rivera',
    organization: row.organization,
    enrolledProgram: row.enrolledProgram,
    assessmentCompleted: false,
    courseEnrollments: row.courseEnrollments,
    courseProgress: row.courseProgress,
    memberProgramProgress: row.memberProgramProgress,
    memberPoints: row.memberPoints,
    nextBestActions: [],
    jobApplications: [],
    goals: [],
    pointsTransactions: row.pointsTransactions,
    _count: row._count,
  };
  const home = await loadMemberDashboardHome(
    { userId: USER_ID },
    {
      $transaction: async <T,>(fn: (tx: { user: { findUnique: (args: unknown) => Promise<unknown> } }) => Promise<T>) =>
        fn({ user: { findUnique: async () => homeRow } }),
    } as never,
  );

  const { db } = mockDb({ rows: { [USER_ID]: row } });
  const metrics = await loadProgressMetrics(USER_ID, db);

  assert.ok(home.coursePercent > 0 && home.coursePercent < 100, 'the fixture is a partly finished program');
  assert.equal(metrics.coursePercent, home.coursePercent);
  assert.equal(metrics.activeApplications, home.activeJobs);
  assert.equal(metrics.certificates, home.certs);
  assert.equal(metrics.points, home.points);
  assert.equal(metrics.pointsThisWeek, home.pointsThisWeek);
  assert.equal(metrics.currentStreak, home.currentStreak);
  assert.equal(metrics.longestStreak, home.longestStreak);
  assert.deepEqual(metrics.ledger, home.pointsLedger, 'the ledger is Home\'s, row for row (both lists are under their caps here)');
});
