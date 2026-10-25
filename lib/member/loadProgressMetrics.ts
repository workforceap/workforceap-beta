import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { ACTIVE_APPLICATION_STATUSES } from '@/lib/member/jobPipelineDisplay';
import { MEMBER_TREND_WEEK_MS, buildMemberPointsTrend } from '@/lib/member/memberPointsTrend';
import { effectiveStreak } from '@/lib/member/streakDisplay';
import {
  mapPointsLedger,
  resolveHomeEnrollment,
  type DashboardPointsLedgerEntry,
} from '@/lib/member/loadMemberDashboardHome';

/**
 * The numbers the member Home dropped (course %, active applications,
 * certificates, points, points this week, the recent ledger, the streak), read
 * for `/dashboard/readiness` so the Progress page can show them.
 *
 * "Unknown is not zero" (WAP-206): every field is `null` when the read behind
 * it failed or has nothing to measure, and a number (a real `0` included) only
 * when the database said so. The reads are independent, so one failing nulls
 * only its own fields:
 *
 *  - `courses`  : `coursePercent`
 *  - `counts`   : `activeApplications`, `certificates`
 *  - `points`   : `points`, `pointsThisWeek`, `ledger`, `currentStreak`, `longestStreak`
 *
 * Cost: {@link PROGRESS_METRICS_PRISMA_ROUND_TRIPS} Prisma calls, issued in
 * parallel, each a single bounded `user.findUnique` scoped to the signed-in
 * member's id. This is NOT `loadMemberDashboardHome`, which carries its own
 * query budget for Home; the pure helpers that file exports are reused so a
 * number here is defined the same way it was on Home (the parity test in
 * `loadProgressMetrics.test.ts` runs both loaders over one row).
 *
 * Never throws: the readiness page awaits it beside its own loads.
 */

/** Prisma calls this loader adds to a page render. The loader test asserts it. */
export const PROGRESS_METRICS_PRISMA_ROUND_TRIPS = 3;

/** Same ceilings as the Home read, so a program percent is computed over the same rows. */
const COURSE_ROW_TAKE = 500;
const COURSE_ENROLLMENT_TAKE = 25;
const PROGRAM_ROLLUP_TAKE = 5;

/**
 * Newest points rows read for the ledger and the rolling-7-day sum. Far above
 * what one member earns in a week (`daily_study` is once a day); if a page
 * ever fills inside the window, "this week" is reported as unknown instead of
 * as a short total.
 */
export const PROGRESS_POINTS_TRANSACTION_TAKE = 100;

/** Rows in the Points card's recent list. */
export const PROGRESS_LEDGER_ROWS = 5;

export type ProgressMetrics = {
  /** 0 to 100 over the assigned program's validated courses; `null` with no program to measure. */
  coursePercent: number | null;
  /** Applications still in play (Home's "Active jobs"; the Jobs page's definition). */
  activeApplications: number | null;
  certificates: number | null;
  points: number | null;
  /** Points earned in the last rolling 7 days (Home's chip window). */
  pointsThisWeek: number | null;
  /** Newest point-earning events, newest first. */
  ledger: DashboardPointsLedgerEntry[] | null;
  /** The streak the member holds right now: a lapsed streak is 0. */
  currentStreak: number | null;
  longestStreak: number | null;
};

export const UNKNOWN_PROGRESS_METRICS: ProgressMetrics = Object.freeze({
  coursePercent: null,
  activeApplications: null,
  certificates: null,
  points: null,
  pointsThisWeek: null,
  ledger: null,
  currentStreak: null,
  longestStreak: null,
});

/** Injectable for the unit test; production passes the shared client. */
export type ProgressMetricsDb = {
  user: { findUnique(args: unknown): Promise<unknown> };
};

/* ---------------------------------------------------------------------- */
/* Selects (each `satisfies Prisma.UserSelect`: the compiler checks them)  */
/* ---------------------------------------------------------------------- */

const COURSE_SELECT = {
  enrolledProgram: true,
  organization: {
    select: {
      courses: {
        take: COURSE_ROW_TAKE,
        orderBy: [{ programSlug: 'asc' as const }, { displayOrder: 'asc' as const }],
        select: {
          programSlug: true,
          courseSlug: true,
          name: true,
          estimatedHours: true,
          courseraCourseId: true,
          courseraSlug: true,
        },
      },
    },
  },
  courseEnrollments: {
    orderBy: [{ isPrimary: 'desc' as const }, { enrolledAt: 'desc' as const }],
    take: COURSE_ENROLLMENT_TAKE,
    select: { id: true, programSlug: true, curriculumVersion: true, isPrimary: true, enrolledAt: true },
  },
  courseProgress: {
    orderBy: [{ lastActivityAt: 'desc' as const }, { lastUpdatedAt: 'desc' as const }],
    take: COURSE_ROW_TAKE,
    select: { programSlug: true, courseSlug: true, courseId: true, percentComplete: true, status: true },
  },
  memberProgramProgress: {
    orderBy: { lastUpdatedAt: 'desc' as const },
    take: PROGRAM_ROLLUP_TAKE,
    select: { programSlug: true },
  },
} satisfies Prisma.UserSelect;

const COUNT_SELECT = {
  _count: {
    select: {
      userCertifications: true,
      jobApplications: { where: { status: { in: [...ACTIVE_APPLICATION_STATUSES] } } },
    },
  },
} satisfies Prisma.UserSelect;

const POINTS_SELECT = {
  memberPoints: {
    select: { totalPoints: true, currentStreak: true, longestStreak: true, lastActiveDate: true },
  },
  pointsTransactions: {
    orderBy: { createdAt: 'desc' as const },
    take: PROGRESS_POINTS_TRANSACTION_TAKE,
    select: { event: true, points: true, createdAt: true },
  },
} satisfies Prisma.UserSelect;

type CourseRow = Prisma.UserGetPayload<{ select: typeof COURSE_SELECT }>;
type CountRow = Prisma.UserGetPayload<{ select: typeof COUNT_SELECT }>;
type PointsRow = Prisma.UserGetPayload<{ select: typeof POINTS_SELECT }>;

/* ---------------------------------------------------------------------- */
/* Pure derivations                                                         */
/* ---------------------------------------------------------------------- */

/**
 * Program percent with the Home loader's definition (`shapeHome`): the active
 * enrollment's program, its validated course list (catalog, pinned curriculum
 * version, or the organisation's course rows), reconciled against the
 * member's saved progress rows. `null` when there is no program, or no course,
 * to measure: that is "nothing to report", not 0%.
 */
export function deriveCoursePercent(row: CourseRow): number | null {
  const enrollment = resolveHomeEnrollment(row, null);
  const inferredSlug = row.memberProgramProgress[0]?.programSlug ?? row.courseProgress[0]?.programSlug ?? null;
  const rawSlug = enrollment.activeSlug ?? inferredSlug;
  const slug = rawSlug ? canonicalizeProgramSlug(rawSlug) : null;
  const program = slug ? getProgramBySlug(slug) : undefined;
  if (!slug || !program) return null;

  const courseDbRows = (row.organization?.courses ?? []).filter((course) =>
    programSlugsEquivalent(course.programSlug, slug),
  );
  const pinnedCurriculumVersion = enrollment.pinnedEnrollment?.curriculumVersion;
  const validatedCourses = pinnedCurriculumVersion
    ? getProgramCoursesForCurriculumVersion(program, pinnedCurriculumVersion)
    : program.syllabus && !program.curriculumMigrationPending
      ? program.courses
      : courseDbRows.length > 0
        ? courseDbRows.map((course) => ({
            slug: course.courseSlug,
            name: course.name,
            estimatedHours: course.estimatedHours ?? 10,
            courseraCourseId: course.courseraCourseId ?? undefined,
            courseraSlug: course.courseraSlug ?? undefined,
          }))
        : program.courses;

  const reconciliation = reconcileProgramProgress({
    validatedCourses,
    localRows: row.courseProgress
      .filter((progress) => programSlugsEquivalent(progress.programSlug, slug))
      .map((progress) => ({
        courseSlug: progress.courseSlug,
        courseId: progress.courseId,
        percentComplete: progress.percentComplete,
        status: progress.status,
      })),
  });
  if (reconciliation.totalCourses === 0) return null;
  return Math.max(0, Math.min(100, Math.round(reconciliation.programPercent)));
}

/**
 * Points, the rolling-7-day sum, the recent ledger and the streak, shaped the
 * way Home shapes them: the same `mapPointsLedger` labels and colours, the
 * same `buildMemberPointsTrend` window for "this week", the same
 * `effectiveStreak`. A member with no `member_points` row has earned nothing:
 * that is a real 0, not unknown.
 */
export function derivePointsMetrics(
  row: PointsRow,
  now: number = Date.now(),
): Pick<ProgressMetrics, 'points' | 'pointsThisWeek' | 'ledger' | 'currentStreak' | 'longestStreak'> {
  const transactions = row.pointsTransactions;
  const trend = buildMemberPointsTrend({ transactions, now, weeks: 1 });
  // Newest first, so a full page whose oldest row is still inside the window
  // may be hiding more rows from it: the sum would be short, so say unknown.
  const windowStart = now - MEMBER_TREND_WEEK_MS;
  const oldest = transactions.reduce((min, tx) => Math.min(min, tx.createdAt.getTime()), Number.POSITIVE_INFINITY);
  const pageMayHideThisWeek =
    transactions.length >= PROGRESS_POINTS_TRANSACTION_TAKE && oldest >= windowStart;

  return {
    points: row.memberPoints?.totalPoints ?? 0,
    pointsThisWeek: pageMayHideThisWeek ? null : trend.thisWeek,
    ledger: mapPointsLedger(transactions.slice(0, PROGRESS_LEDGER_ROWS)),
    currentStreak: effectiveStreak({
      currentStreak: row.memberPoints?.currentStreak,
      lastActiveDate: row.memberPoints?.lastActiveDate,
    }),
    longestStreak: row.memberPoints?.longestStreak ?? 0,
  };
}

/* ---------------------------------------------------------------------- */
/* Loader                                                                   */
/* ---------------------------------------------------------------------- */

function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: unknown; code?: unknown };
    return [typeof name === 'string' ? name : 'Error', typeof code === 'string' ? code : null]
      .filter(Boolean)
      .join(' ');
  }
  return 'Error';
}

/** One read: its result, or `null` (logged without the member id or the message) when it failed. */
async function settleRead<T>(read: 'courses' | 'counts' | 'points', run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    logger.error('progress metrics read failed', { read, error: describeError(error) });
    return null;
  }
}

/**
 * One bounded read of the signed-in member's OWN row, by the verified session id
 * (never request input). An id is unique across tenants, so this cannot reach
 * another tenant's data; `crossTenantOK` records that choice for the tenant
 * ratchet (scripts/audit-tenant-scoping.cjs) and is listed in
 * docs/TENANT-ISOLATION.md "Allowlist".
 */
function readOwnRow(db: ProgressMetricsDb, userId: string, select: Prisma.UserSelect): Promise<unknown> {
  return crossTenantOK(() => db.user.findUnique({ where: { id: userId }, select }));
}

export async function loadProgressMetrics(
  userId: string,
  db: ProgressMetricsDb = prisma as unknown as ProgressMetricsDb,
  now: number = Date.now(),
): Promise<ProgressMetrics> {
  const [coursePercent, counts, points] = await Promise.all([
    settleRead('courses', async () => {
      const row = (await readOwnRow(db, userId, COURSE_SELECT)) as CourseRow | null;
      return row ? { value: deriveCoursePercent(row) } : null;
    }),
    settleRead('counts', async () => {
      const row = (await readOwnRow(db, userId, COUNT_SELECT)) as CountRow | null;
      return row
        ? { activeApplications: row._count.jobApplications, certificates: row._count.userCertifications }
        : null;
    }),
    settleRead('points', async () => {
      const row = (await readOwnRow(db, userId, POINTS_SELECT)) as PointsRow | null;
      return row ? derivePointsMetrics(row, now) : null;
    }),
  ]);

  return {
    coursePercent: coursePercent?.value ?? null,
    activeApplications: counts?.activeApplications ?? null,
    certificates: counts?.certificates ?? null,
    points: points?.points ?? null,
    pointsThisWeek: points?.pointsThisWeek ?? null,
    ledger: points?.ledger ?? null,
    currentStreak: points?.currentStreak ?? null,
    longestStreak: points?.longestStreak ?? null,
  };
}
