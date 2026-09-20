import { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/db/prisma';
import { REPORT_SAMPLE_CAP, sqlCount } from '@/lib/db/scanCaps';
import { MEMBER_ONLY_WHERE, memberOnlyProfileWhere, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { summarizeRetentionGroups } from '@/lib/analytics/retentionOutcome';
import {
  validatedProgramAssignmentRowsSql,
  validatedProgramCompletionValuesSql,
} from '@/lib/reporting/programCompletion';

/**
 * Aggregations for the Board / Funder outcomes portal.
 *
 * The buyer for WorkforceAP is a workforce board / WIOA grant administrator
 * (not the cohort member). This module reduces the raw operational data
 * (User, PlacementRecord, AIToolResult, etc.) into the headline metrics a
 * board pays to see: members served, placement rate, median wage,
 * demographic breakdowns aligned to WIOA ETA reporting categories.
 *
 * Per /plan-ceo-review (2026-04-26): "the board portal is the buyer-facing
 * surface — build it before scaling cohorts." This is the v1 demo cut for
 * a single org / pilot board. Multi-tenant board scoping is a follow-up.
 */

export type BoardOutcomesPeriod = 'all-time' | 'ytd' | 'q-current' | 'q-prev';

export type BoardOutcomes = {
  period: { label: string; startDate: Date | null; endDate: Date };
  totals: {
    membersServed: number;
    membersEnrolled: number;
    membersInTraining: number;
    /** Legacy serialized key: completed assigned training, not credential verification. */
    membersCertified: number;
    membersPlaced: number;
    placementRate: number; // %, of enrolled
    medianAnnualSalary: number | null;
    totalAnnualSalaryValue: number; // sum of placed salaries
    averageWeeksToPlacement: number | null;
  };
  funnel: Array<{ stage: string; count: number }>;
  demographics: {
    veteranBreakdown: Array<{ label: string; count: number }>;
    employmentEnteringBreakdown: Array<{ label: string; count: number }>;
    incomeBreakdown: Array<{ label: string; count: number }>;
    educationBreakdown: Array<{ label: string; count: number }>;
    ethnicityBreakdown: Array<{ label: string; count: number }>;
  };
  programs: Array<{
    programSlug: string;
    enrolled: number;
    /** Legacy serialized key: members who completed this program's assigned training. */
    certified: number;
    placed: number;
    placementRate: number;
  }>;
  /** PII-stripped placement list for the funder report */
  placements: Array<{
    jobTitle: string;
    employerIndustry: string | null;
    annualSalary: number | null;
    enrolledProgram: string | null;
    weeksFromEnrollmentToPlacement: number | null;
    placedAt: Date;
  }>;
};

function startOfPeriod(period: BoardOutcomesPeriod): Date | null {
  const now = new Date();
  if (period === 'all-time') return null;
  if (period === 'ytd') return new Date(now.getFullYear(), 0, 1);
  const month = now.getMonth();
  const qStartMonth = month - (month % 3);
  if (period === 'q-current') return new Date(now.getFullYear(), qStartMonth, 1);
  // q-prev
  const prevQStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
  return prevQStart;
}

function endOfPeriod(period: BoardOutcomesPeriod): Date {
  const now = new Date();
  if (period !== 'q-prev') return now;
  const month = now.getMonth();
  const qStartMonth = month - (month % 3);
  // Last day of previous quarter = day before this quarter starts
  return new Date(now.getFullYear(), qStartMonth, 0, 23, 59, 59);
}

function bucketFromGroupBy(
  groups: Array<{ value: string | null; count: number }>,
  buckets: string[],
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const b of buckets) counts.set(b, 0);
  let unknown = 0;
  for (const row of groups) {
    if (!row.value) {
      unknown += row.count;
      continue;
    }
    counts.set(row.value, (counts.get(row.value) ?? 0) + row.count);
  }
  const out = [...counts.entries()].map(([label, count]) => ({ label, count }));
  if (unknown > 0) out.push({ label: 'Not reported', count: unknown });
  return out.filter((r) => r.count > 0);
}

/**
 * Pick which program a placement should be credited to when the learner is
 * enrolled in multiple programs simultaneously.
 *
 * Heuristic: among the learner's `course_enrollments`, choose the one whose
 * `enrolledAt <= placedAt` and is most-recently started (i.e. the program
 * the learner had most recently entered at the time of placement). If no
 * enrollment row predates the placement (e.g. data was backfilled in an odd
 * order), fall back to the earliest enrollment so we still credit *some*
 * program. If the learner has zero `course_enrollments` rows, fall back to
 * the legacy `User.enrolledProgram` cache so unmigrated/seeded users keep
 * the old behavior. Returns `null` only if both signals are missing.
 *
 * Used by funder-facing program rollups and the placements export — see
 * audit punch list items #2 and #6.
 */
function attributeProgramAtPlacement(
  enrollments: ReadonlyArray<{ programSlug: string; enrolledAt: Date }>,
  placedAt: Date,
  legacyEnrolledProgram: string | null,
): string | null {
  if (enrollments.length === 0) return legacyEnrolledProgram ?? null;
  if (enrollments.length === 1) return enrollments[0].programSlug;
  const placedMs = placedAt.getTime();
  const eligible = enrollments.filter((e) => e.enrolledAt.getTime() <= placedMs);
  const pool = eligible.length > 0 ? eligible : enrollments;
  let best = pool[0];
  for (const e of pool) {
    if (e.enrolledAt.getTime() > best.enrolledAt.getTime()) best = e;
  }
  return best.programSlug;
}

const VETERAN_BUCKETS = ['Not a Veteran', 'Veteran', 'Disabled Veteran'];
const EMPLOYMENT_BUCKETS = ['Unemployed', 'Underemployed', 'Employed', 'Self-Employed'];
const INCOME_BUCKETS = ['Under $20K', '$20K–$40K', '$40K–$60K', 'Over $60K'];
const EDUCATION_BUCKETS = [
  'Less than HS',
  'HS Diploma or GED',
  'Some College',
  "Associate's",
  "Bachelor's",
  'Graduate',
];

export async function getBoardOutcomes(
  period: BoardOutcomesPeriod = 'all-time',
  organizationId?: string,
): Promise<BoardOutcomes> {
  const start = startOfPeriod(period);
  const end = endOfPeriod(period);
  const periodLabel = (
    {
      'all-time': 'All time',
      ytd: `${new Date().getFullYear()} year to date`,
      'q-current': `${currentQuarterLabel(new Date())}`,
      'q-prev': `${prevQuarterLabel(new Date())}`,
    } as const
  )[period];

  // Members enrolled within the period (or any time, for all-time).
  //
  // Population: member-role accounts only (`MEMBER_ONLY_WHERE`). Staff,
  // admin and fixture accounts never count as members served, never sit in
  // the placement-rate denominator and never appear in the demographics
  // (number audit 2026-09-20, F1-F3: a single super_admin dogfood placement
  // was the organisation's whole placement rate and two of the three board
  // demographic profiles were staff).
  //
  // Multi-tenant scoping: when `organizationId` is provided, every query is
  // narrowed to that org. When omitted, behavior is unchanged (single-tenant
  // pilot mode — see BoardOutcomes module header). The existing
  // `/admin/outcomes` callers pass no org and still see the cumulative roll-up.
  const enrolledWhere = {
    deletedAt: null,
    enrolledProgram: { not: null },
    ...MEMBER_ONLY_WHERE,
    ...(organizationId ? { organizationId } : {}),
    ...(start ? { enrolledAt: { gte: start, lte: end } } : {}),
  } as const;

  // Placements are counted only for member-role users (same population as
  // the denominator above), scoped by `placedAt` for the period.
  const placementWhere = {
    ...(start ? { placedAt: { gte: start, lte: end } } : {}),
    user: { ...MEMBER_ONLY_WHERE, ...(organizationId ? { organizationId } : {}) },
  } as const;
  const profileUserWhere = start
    ? enrolledWhere
    : {
        deletedAt: null,
        enrolledProgram: { not: null },
        ...MEMBER_ONLY_WHERE,
        ...(organizationId ? { organizationId } : {}),
      };
  // Demographics run on `prisma.profile`, so the role predicate sits on the
  // profile row itself (see memberOnlyProfileWhere).
  const demographicsWhere = memberOnlyProfileWhere(profileUserWhere);
  const orgSql = organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty;
  const memberJoin = memberOnlySqlJoin();
  const enrolledAtSql = start
    ? Prisma.sql`AND u.enrolled_at >= ${start} AND u.enrolled_at <= ${end}`
    : Prisma.empty;
  const placedAtSql = start
    ? Prisma.sql`AND pr.placed_at >= ${start} AND pr.placed_at <= ${end}`
    : Prisma.empty;

  const [
    membersServed,
    membersPlaced,
    progressBuckets,
    salaryAgg,
    medianRow,
    weeksRow,
    enrollmentByCourse,
    enrollmentLegacy,
    certifiedByProgram,
    placedByProgramSlug,
    placedByLegacyProgram,
    veteranGroups,
    employmentGroups,
    incomeGroups,
    educationGroups,
    ethnicityGroups,
    placementSample,
  ] = await Promise.all([
    prisma.user.count({ where: enrolledWhere }),
    prisma.placementRecord.count({ where: placementWhere }),
    prisma.$queryRaw<Array<{ certified: bigint | number; in_training: bigint | number }>>`
      WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
        VALUES ${validatedProgramCompletionValuesSql()}
      ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
        ${validatedProgramAssignmentRowsSql()}
      ), learner_training_status AS (
        SELECT
          u.id,
          BOOL_OR(
            progress_program.storage_value IS NOT NULL
            AND mpp.courses_completed = progress_program.total_courses
          ) AS certified,
          BOOL_OR(
            progress_program.storage_value IS NOT NULL
            AND (mpp.courses_completed > 0 OR mpp.average_percent > 0)
          ) AS started
        FROM users u
        ${memberJoin}
        INNER JOIN learner_program_assignments ce
          ON ce.user_id = u.id
        INNER JOIN validated_programs enrolled_program
          ON enrolled_program.storage_value = ce.program_slug
          AND enrolled_program.curriculum_version = ce.curriculum_version
        LEFT JOIN member_program_progress mpp
          ON mpp.user_id = u.id
        LEFT JOIN validated_programs progress_program
          ON progress_program.canonical_slug = enrolled_program.canonical_slug
          AND progress_program.storage_value = mpp.program_slug
          AND progress_program.curriculum_version = ce.curriculum_version
        WHERE u.deleted_at IS NULL
          AND u.enrolled_program IS NOT NULL
          ${orgSql}
          ${enrolledAtSql}
        GROUP BY u.id
      )
      SELECT
        COUNT(*) FILTER (WHERE certified)::bigint AS certified,
        COUNT(*) FILTER (WHERE started AND NOT certified)::bigint AS in_training
      FROM learner_training_status
    `,
    prisma.placementRecord.aggregate({
      where: { ...placementWhere, salaryOffered: { gt: 0 } },
      _sum: { salaryOffered: true },
      _count: { salaryOffered: true },
    }),
    prisma.$queryRaw<Array<{ median: number | null }>>`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr.salary_offered)::int AS median
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id
      ${memberJoin}
      WHERE pr.salary_offered > 0
        ${orgSql}
        ${placedAtSql}
    `,
    prisma.$queryRaw<Array<{ avg_weeks: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (pr.placed_at - u.enrolled_at)) / (7 * 86400)) AS avg_weeks
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id
      ${memberJoin}
      WHERE u.enrolled_at IS NOT NULL
        AND pr.placed_at > u.enrolled_at
        ${orgSql}
        ${placedAtSql}
    `,
    prisma.courseEnrollment.groupBy({
      by: ['programSlug'],
      where: { user: enrolledWhere },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['enrolledProgram'],
      where: { ...enrolledWhere, courseEnrollments: { none: {} } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ program_slug: string; count: bigint | number }>>`
      WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
        VALUES ${validatedProgramCompletionValuesSql()}
      ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
        ${validatedProgramAssignmentRowsSql()}
      )
      SELECT
        enrolled_program.canonical_slug AS program_slug,
        COUNT(DISTINCT u.id)::bigint AS count
      FROM users u
      ${memberJoin}
      INNER JOIN learner_program_assignments ce
        ON ce.user_id = u.id
      INNER JOIN validated_programs enrolled_program
        ON enrolled_program.storage_value = ce.program_slug
        AND enrolled_program.curriculum_version = ce.curriculum_version
      INNER JOIN member_program_progress mpp
        ON mpp.user_id = u.id
      INNER JOIN validated_programs progress_program
        ON progress_program.canonical_slug = enrolled_program.canonical_slug
        AND progress_program.storage_value = mpp.program_slug
        AND progress_program.curriculum_version = ce.curriculum_version
      WHERE u.deleted_at IS NULL
        AND u.enrolled_program IS NOT NULL
        AND mpp.courses_completed = progress_program.total_courses
        ${orgSql}
        ${enrolledAtSql}
      GROUP BY enrolled_program.canonical_slug
    `,
    prisma.placementRecord.groupBy({
      by: ['programSlug'],
      where: { ...placementWhere, programSlug: { not: null } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ program_slug: string; count: bigint | number }>>`
      SELECT u.enrolled_program AS program_slug, COUNT(*)::bigint AS count
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id
      ${memberJoin}
      WHERE pr.program_slug IS NULL
        AND u.enrolled_program IS NOT NULL
        ${orgSql}
        ${placedAtSql}
      GROUP BY u.enrolled_program
    `,
    prisma.profile.groupBy({
      by: ['veteranStatus'],
      where: demographicsWhere,
      _count: { _all: true },
    }),
    prisma.profile.groupBy({
      by: ['employmentStatus'],
      where: demographicsWhere,
      _count: { _all: true },
    }),
    prisma.profile.groupBy({
      by: ['householdIncome'],
      where: demographicsWhere,
      _count: { _all: true },
    }),
    prisma.profile.groupBy({
      by: ['educationLevel'],
      where: demographicsWhere,
      _count: { _all: true },
    }),
    prisma.profile.groupBy({
      by: ['ethnicity'],
      where: demographicsWhere,
      _count: { _all: true },
    }),
    prisma.placementRecord.findMany({
      where: placementWhere,
      take: REPORT_SAMPLE_CAP,
      orderBy: { placedAt: 'desc' },
      select: {
        jobTitle: true,
        salaryOffered: true,
        placedAt: true,
        programSlug: true,
        user: {
          select: {
            enrolledProgram: true,
            enrolledAt: true,
            courseEnrollments: { select: { programSlug: true, enrolledAt: true } },
          },
        },
      },
    }),
  ]);

  const membersCertified = sqlCount(progressBuckets[0]?.certified);
  const membersInTraining = sqlCount(progressBuckets[0]?.in_training);
  const placementRate = membersServed > 0 ? Math.round((membersPlaced / membersServed) * 100) : 0;
  const medianAnnualSalary = medianRow[0]?.median ?? null;
  const totalAnnualSalaryValue = salaryAgg._sum.salaryOffered ?? 0;
  const averageWeeksToPlacement =
    weeksRow[0]?.avg_weeks != null ? Math.round(Number(weeksRow[0].avg_weeks)) : null;

  const programs = new Map<
    string,
    { programSlug: string; enrolled: number; certified: number; placed: number }
  >();
  const bump = (slug: string | null | undefined, field: 'enrolled' | 'certified' | 'placed', n: number) => {
    if (!slug || n <= 0) return;
    const cur = programs.get(slug) ?? { programSlug: slug, enrolled: 0, certified: 0, placed: 0 };
    cur[field] += n;
    programs.set(slug, cur);
  };
  for (const row of enrollmentByCourse) bump(row.programSlug, 'enrolled', row._count._all);
  for (const row of enrollmentLegacy) bump(row.enrolledProgram, 'enrolled', row._count._all);
  for (const row of certifiedByProgram) bump(row.program_slug, 'certified', sqlCount(row.count));
  for (const row of placedByProgramSlug) bump(row.programSlug, 'placed', row._count._all);
  for (const row of placedByLegacyProgram) bump(row.program_slug, 'placed', sqlCount(row.count));

  const programsList = [...programs.values()]
    .map((p) => ({
      ...p,
      placementRate: p.enrolled > 0 ? Math.round((p.placed / p.enrolled) * 100) : 0,
    }))
    .sort((a, b) => b.enrolled - a.enrolled);

  const veteranBreakdown = bucketFromGroupBy(
    veteranGroups.map((g) => ({ value: g.veteranStatus, count: g._count._all })),
    VETERAN_BUCKETS,
  );
  const employmentEnteringBreakdown = bucketFromGroupBy(
    employmentGroups.map((g) => ({ value: g.employmentStatus, count: g._count._all })),
    EMPLOYMENT_BUCKETS,
  );
  const incomeBreakdown = bucketFromGroupBy(
    incomeGroups.map((g) => ({ value: g.householdIncome, count: g._count._all })),
    INCOME_BUCKETS,
  );
  const educationBreakdown = bucketFromGroupBy(
    educationGroups.map((g) => ({ value: g.educationLevel, count: g._count._all })),
    EDUCATION_BUCKETS,
  );
  const ethnicityBreakdown = bucketFromGroupBy(
    ethnicityGroups.map((g) => ({ value: g.ethnicity, count: g._count._all })),
    [
      'Hispanic/Latino',
      'White',
      'Black or African American',
      'Asian',
      'American Indian or Alaska Native',
      'Native Hawaiian or Pacific Islander',
      'Two or More Races',
    ],
  );

  return {
    period: { label: periodLabel, startDate: start, endDate: end },
    totals: {
      membersServed,
      membersEnrolled: membersServed,
      membersInTraining,
      membersCertified,
      membersPlaced,
      placementRate,
      medianAnnualSalary,
      totalAnnualSalaryValue,
      averageWeeksToPlacement,
    },
    funnel: [
      { stage: 'Enrolled', count: membersServed },
      { stage: 'In training', count: membersInTraining },
      { stage: 'Training completed', count: membersCertified },
      { stage: 'Placed', count: membersPlaced },
    ],
    demographics: {
      veteranBreakdown,
      employmentEnteringBreakdown,
      incomeBreakdown,
      educationBreakdown,
      ethnicityBreakdown,
    },
    programs: programsList,
    // Each placement records the program credited for it. With multi-program
    // enrollments we credit the program the learner had most recently
    // entered at placement time (see attributeProgramAtPlacement); with a
    // single enrollment behavior is unchanged. Audit punch list item #2.
    placements: placementSample.map((p) => ({
      jobTitle: p.jobTitle,
      employerIndustry: null,
      annualSalary: p.salaryOffered,
      enrolledProgram:
        p.programSlug ??
        attributeProgramAtPlacement(
          p.user.courseEnrollments,
          p.placedAt,
          p.user.enrolledProgram,
        ),
      weeksFromEnrollmentToPlacement:
        p.user.enrolledAt
          ? Math.max(0, Math.round((p.placedAt.getTime() - p.user.enrolledAt.getTime()) / (7 * 24 * 60 * 60 * 1000)))
          : null,
      placedAt: p.placedAt,
    })),
  };
}

function currentQuarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

function prevQuarterLabel(date: Date): string {
  let q = Math.floor(date.getMonth() / 3) + 1 - 1;
  let y = date.getFullYear();
  if (q === 0) {
    q = 4;
    y -= 1;
  }
  return `Q${q} ${y}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Board Snapshot — single defensible source of truth for any external pitch.
// ───────────────────────────────────────────────────────────────────────────
//
// `getBoardSnapshot()` is the function any pitch deck, WIOA submission, partner
// PDF, or employer one-pager should pull from. Every number here is sourced
// from a documented Prisma query (see docs/OUTCOMES-METHODOLOGY.md).
//
// Discipline:
//   - When N < SMALL_SAMPLE_THRESHOLD, rates are suppressed and replaced with
//     a "sample too small" marker. Counts are still shown.
//   - The `generatedAt` timestamp ships with every export so a stale PDF is
//     obvious to anyone reading it.
//   - `dataQuality` flags rows we know are incomplete — these are the things
//     a WIOA auditor will ask about.

export const SMALL_SAMPLE_THRESHOLD = 10;

export type BoardSnapshotApplicationFunnel = {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  needsInfo: number;
};

export type BoardSnapshotActivity = {
  totalMembers: number;
  active7d: number;
  active14d: number;
  active30d: number;
  inactive14d: number;
};

export type BoardSnapshotCertifications = {
  totalEarned: number;
  earnedLast30d: number;
  uniqueMembers: number;
};

export type BoardSnapshotDataQuality = {
  placementsMissingProgram: number;
  placementsMissingFunding: number;
  placementsMissingRetention: number;
  placementsMissingSalary: number;
  enrolledWithoutEnrolledAt: number;
};

export type FunnelWaterfallStage = {
  stage: string;
  count: number;
  previousCount?: number;
  conversionRate?: number; // pct from previous stage
};

export type ApplicationQueueHealth = {
  pendingCount: number;
  medianAgeDays: number | null;
  oldestAgeDays: number | null;
};

export type CohortMonth = {
  month: string; // "2026-01"
  monthLabel: string; // "Jan 2026"
  applications: number;
  approved: number;
  enrolled: number;
  /** Legacy serialized key: completed assigned training. */
  certified: number;
  placed: number;
};

export type PlacementActivityMonth = {
  month: string; // "2026-01"
  monthLabel: string; // "Jan 2026"
  placementsRecorded: number;
};

export type BoardSnapshotKpis = {
  totalMembers: number;
  activeThisWeek: number;
  qualifiedLeads: number;
  fundedStarts: number;
  placementsThisMonth: number;
  /**
   * 90-day retention rate, as a whole-number percentage, over placements in
   * the snapshot's org/period whose retention outcome is decided. A placement
   * counts as retained when `retentionDecision === 'retained'` OR
   * `retentionStatus` starts with `'retained'` (e.g. "retained_90d",
   * "retained_180d"); as not-retained when `retentionDecision === 'not_retained'`
   * OR `retentionStatus === 'separated'`. Placements that are still pending
   * (`retentionDecision === 'pending'` and no decided `retentionStatus`) or
   * have no retention data at all are excluded from the denominator.
   *
   * `null` when the denominator is 0 (no decided placements yet) — render as "—".
   */
  retentionRate: number | null;
};

export type BoardSnapshot = {
  generatedAt: Date;
  smallSampleThreshold: number;
  applicationFunnel: BoardSnapshotApplicationFunnel;
  outcomes: BoardOutcomes;
  activity: BoardSnapshotActivity;
  certifications: BoardSnapshotCertifications;
  dataQuality: BoardSnapshotDataQuality;
  /** Full funnel: accounts → applications → pending/approved/denied → enrolled → training completed → placed */
  funnelWaterfall: FunnelWaterfallStage[];
  /** Pending application queue health metrics */
  applicationQueueHealth: ApplicationQueueHealth;
  /** Monthly cohort breakdown */
  cohorts: CohortMonth[];
  /** Monthly placement activity from member_events. */
  placementActivity: PlacementActivityMonth[];
  /** Top-line KPIs for the /admin/outcomes hero row */
  kpis: BoardSnapshotKpis;
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function buildPlacementActivitySeries(
  rows: ReadonlyArray<{ createdAt: Date }>,
): PlacementActivityMonth[] {
  const months = new Map<string, PlacementActivityMonth>();
  for (const row of rows) {
    const key = monthKey(row.createdAt);
    const current = months.get(key) ?? {
      month: key,
      monthLabel: monthLabel(row.createdAt),
      placementsRecorded: 0,
    };
    current.placementsRecorded += 1;
    months.set(key, current);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Distinct member-role users with any event since `since` (staff events never count). */
/**
 * Funnel waterfall stages with their conversion from the previous stage.
 *
 * Application approval is NOT a prerequisite for enrolment (the enrol route
 * gates on WIOA screening only), so "Approved" is not a stage between
 * Applications and Enrolled: with 0 approved applications and 37 enrolled the
 * CSV printed "Approved 0 → Enrolled 37, 0%" (number audit 2026-09-20, F5).
 * Enrolled converts from Applications; approval counts stay in
 * `applicationFunnel`. A conversion is omitted (not 0%) when the previous
 * stage is empty, so no export prints a rate over nothing.
 */
export function buildFunnelWaterfall(counts: {
  accounts: number;
  applications: number;
  enrolled: number;
  trainingCompleted: number;
  placed: number;
}): FunnelWaterfallStage[] {
  const stage = (name: string, count: number, previousCount?: number): FunnelWaterfallStage =>
    previousCount === undefined
      ? { stage: name, count }
      : {
          stage: name,
          count,
          previousCount,
          ...(previousCount > 0 ? { conversionRate: Math.round((count / previousCount) * 100) } : {}),
        };
  return [
    stage('Accounts', counts.accounts),
    stage('Applications', counts.applications, counts.accounts),
    stage('Enrolled', counts.enrolled, counts.applications),
    stage('Training completed', counts.trainingCompleted, counts.enrolled),
    stage('Placed', counts.placed, counts.trainingCompleted),
  ];
}

async function countDistinctEventUsers(since: Date, organizationId?: string): Promise<number> {
  const orgSql = organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(DISTINCT me.user_id)::bigint AS count
    FROM member_events me
    INNER JOIN users u ON u.id = me.user_id
    ${memberOnlySqlJoin()}
    WHERE me.created_at >= ${since}
      ${orgSql}
  `;
  return sqlCount(rows[0]?.count);
}

/**
 * Single source of truth for any external pitch (TWC/EdVera, employers,
 * partners, board). Composes `getBoardOutcomes()` with the application
 * funnel, activity recency, certification counts, and data-quality flags.
 *
 * Period defaults to all-time so funders see the cumulative story.
 *
 * Optional `organizationId` narrows every roll-up to a single tenant. When
 * omitted, behavior is unchanged from the single-tenant pilot mode — the
 * `/admin/outcomes` page calls without it and still sees the cumulative
 * roll-up. Passed in by surfaces (e.g. /admin/members/[id]) that want the
 * member's org as the cohort denominator.
 */
export async function getBoardSnapshot(
  period: BoardOutcomesPeriod = 'all-time',
  organizationId?: string,
): Promise<BoardSnapshot> {
  const now = new Date();
  const periodStart = startOfPeriod(period);
  const periodEnd = endOfPeriod(period);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Every count in the snapshot is over member-role accounts only (see
  // getBoardOutcomes). `memberUser` is the relation filter for models keyed
  // by user; `memberJoin` is its raw-SQL twin.
  const memberUser = { ...MEMBER_ONLY_WHERE, ...(organizationId ? { organizationId } : {}) };
  const memberJoin = memberOnlySqlJoin();
  // Funnel and cohort stages honour the selected period (F4): applications
  // and accounts by `created_at`, enrolments by `enrolled_at`, placements by
  // `placed_at`. For all-time the predicates are empty.
  const periodRange = periodStart ? { gte: periodStart, lte: periodEnd } : null;
  const periodSql = (column: string) =>
    periodStart
      ? Prisma.sql`AND ${Prisma.raw(column)} >= ${periodStart} AND ${Prisma.raw(column)} <= ${periodEnd}`
      : Prisma.empty;

  const [
    outcomes,
    applicationsByStatus,
    totalMembers,
    active7dRows,
    active14dRows,
    active30dRows,
    totalCerts,
    certsLast30d,
    uniqueCertMembers,
    placementsMissingProgram,
    placementsMissingFunding,
    placementsMissingRetention,
    placementsMissingSalary,
    enrolledWithoutEnrolledAt,
    placementEventRows,
  ] = await Promise.all([
    getBoardOutcomes(period, organizationId),
    prisma.application.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { user: memberUser, ...(periodRange ? { createdAt: periodRange } : {}) },
    }),
    prisma.user.count({
      where: { deletedAt: null, ...memberUser },
    }),
    countDistinctEventUsers(sevenDaysAgo, organizationId),
    countDistinctEventUsers(fourteenDaysAgo, organizationId),
    countDistinctEventUsers(thirtyDaysAgo, organizationId),
    // Credential records: approved rows held by member-role users only.
    prisma.userCertification.count({
      where: { status: 'approved', user: memberUser },
    }),
    prisma.userCertification.count({
      where: {
        status: 'approved',
        earnedAt: { gte: thirtyDaysAgo },
        user: memberUser,
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT uc.user_id)::bigint AS count
      FROM user_certifications uc
      INNER JOIN users u ON u.id = uc.user_id
      ${memberJoin}
      WHERE uc.status = 'approved'
        ${organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty}
    `.then((rows) => sqlCount(rows[0]?.count)),
    prisma.placementRecord.count({
      where: { programSlug: null, user: memberUser },
    }),
    prisma.placementRecord.count({
      where: { fundingSource: null, user: memberUser },
    }),
    prisma.placementRecord.count({
      where: {
        AND: [{ retentionStatus: null }, { retentionDecision: null }],
        user: memberUser,
      },
    }),
    prisma.placementRecord.count({
      where: { salaryOffered: null, user: memberUser },
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        enrolledProgram: { not: null },
        enrolledAt: null,
        ...memberUser,
      },
    }),
    prisma.$queryRaw<Array<{ month: string; count: bigint | number }>>`
      SELECT to_char(date_trunc('month', me.created_at), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id
      ${memberJoin}
      WHERE me.event_name = 'placement_recorded'
        ${periodSql('me.created_at')}
        ${organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const funnelMap = new Map(applicationsByStatus.map((r) => [r.status, r._count._all]));
  const applicationFunnel: BoardSnapshotApplicationFunnel = {
    total: applicationsByStatus.reduce((sum, r) => sum + r._count._all, 0),
    pending: funnelMap.get('PENDING') ?? 0,
    approved: funnelMap.get('APPROVED') ?? 0,
    denied: funnelMap.get('DENIED') ?? 0,
    needsInfo: funnelMap.get('NEEDS_INFO') ?? 0,
  };

  const inactive14d = Math.max(0, totalMembers - active14dRows);

  // ── NEW: Full funnel waterfall + queue health + cohorts ──
  const orgUserSql = organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty;
  const [
    totalAccounts,
    pendingQueueAgg,
    applicationCohorts,
    enrolledCohorts,
    placedCohorts,
    certifiedCohorts,
  ] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, ...memberUser, ...(periodRange ? { createdAt: periodRange } : {}) },
    }),
    prisma.$queryRaw<Array<{ median_days: number | null; oldest_days: number | null }>>`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (${now} - a.created_at)) / 86400
        ) AS median_days,
        MAX(EXTRACT(EPOCH FROM (${now} - a.created_at)) / 86400) AS oldest_days
      FROM applications a
      INNER JOIN users u ON u.id = a.user_id
      ${memberJoin}
      WHERE a.status = 'PENDING'
        ${orgUserSql}
    `,
    prisma.$queryRaw<Array<{ month: string; applications: bigint | number; approved: bigint | number }>>`
      SELECT
        to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS month,
        COUNT(*)::bigint AS applications,
        COUNT(*) FILTER (WHERE a.status = 'APPROVED')::bigint AS approved
      FROM applications a
      INNER JOIN users u ON u.id = a.user_id
      ${memberJoin}
      WHERE 1=1
        ${orgUserSql}
        ${periodSql('a.created_at')}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ month: string; count: bigint | number }>>`
      SELECT to_char(date_trunc('month', u.enrolled_at), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM users u
      ${memberJoin}
      WHERE u.deleted_at IS NULL
        AND u.enrolled_program IS NOT NULL
        AND u.enrolled_at IS NOT NULL
        ${orgUserSql}
        ${periodSql('u.enrolled_at')}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ month: string; count: bigint | number }>>`
      SELECT to_char(date_trunc('month', pr.placed_at), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id
      ${memberJoin}
      WHERE 1=1
        ${orgUserSql}
        ${periodSql('pr.placed_at')}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ month: string; count: bigint | number }>>`
      WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
        VALUES ${validatedProgramCompletionValuesSql()}
      ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
        ${validatedProgramAssignmentRowsSql()}
      )
      SELECT
        to_char(date_trunc('month', u.enrolled_at), 'YYYY-MM') AS month,
        COUNT(DISTINCT u.id)::bigint AS count
      FROM users u
      ${memberJoin}
      INNER JOIN learner_program_assignments ce
        ON ce.user_id = u.id
      INNER JOIN validated_programs enrolled_program
        ON enrolled_program.storage_value = ce.program_slug
        AND enrolled_program.curriculum_version = ce.curriculum_version
      INNER JOIN member_program_progress mpp
        ON mpp.user_id = u.id
      INNER JOIN validated_programs progress_program
        ON progress_program.canonical_slug = enrolled_program.canonical_slug
        AND progress_program.storage_value = mpp.program_slug
        AND progress_program.curriculum_version = ce.curriculum_version
      WHERE u.deleted_at IS NULL
        AND u.enrolled_program IS NOT NULL
        AND u.enrolled_at IS NOT NULL
        AND mpp.courses_completed = progress_program.total_courses
        ${orgUserSql}
        ${periodSql('u.enrolled_at')}
      GROUP BY 1
    `,
  ]);

  const medianPendingAge =
    pendingQueueAgg[0]?.median_days != null ? Math.round(Number(pendingQueueAgg[0].median_days)) : null;
  const oldestPendingAge =
    pendingQueueAgg[0]?.oldest_days != null ? Math.round(Number(pendingQueueAgg[0].oldest_days)) : null;

  // Build funnel waterfall
  const totalApps = applicationFunnel.total;
  const enrolledCount = outcomes.totals.membersEnrolled;
  const certifiedCount = outcomes.totals.membersCertified;
  const placedCount = outcomes.totals.membersPlaced;

  const funnelWaterfall: FunnelWaterfallStage[] = buildFunnelWaterfall({
    accounts: totalAccounts,
    applications: totalApps,
    enrolled: enrolledCount,
    trainingCompleted: certifiedCount,
    placed: placedCount,
  });

  // Cohort table by month (application month) — SQL date_trunc groups, exact counts.
  const cohortMap = new Map<string, CohortMonth>();
  const ensureCohort = (month: string) => {
    const cur = cohortMap.get(month) ?? {
      month,
      monthLabel: monthLabel(new Date(`${month}-01T00:00:00`)),
      applications: 0,
      approved: 0,
      enrolled: 0,
      certified: 0,
      placed: 0,
    };
    cohortMap.set(month, cur);
    return cur;
  };
  for (const row of applicationCohorts) {
    const cur = ensureCohort(row.month);
    cur.applications += sqlCount(row.applications);
    cur.approved += sqlCount(row.approved);
  }
  for (const row of enrolledCohorts) ensureCohort(row.month).enrolled += sqlCount(row.count);
  for (const row of placedCohorts) ensureCohort(row.month).placed += sqlCount(row.count);
  for (const row of certifiedCohorts) ensureCohort(row.month).certified += sqlCount(row.count);

  const cohorts = [...cohortMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const placementActivity = placementEventRows.map((row) => ({
    month: row.month,
    monthLabel: monthLabel(new Date(`${row.month}-01T00:00:00`)),
    placementsRecorded: sqlCount(row.count),
  }));

  // ── NEW: Top-line KPIs for /admin/outcomes hero row ──
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Period bounds for the retention query, matching how getBoardOutcomes scopes
  // placements by `placedAt` for this period.
  const retentionStart = startOfPeriod(period);
  const retentionEnd = endOfPeriod(period);
  const [
    kpiTotalMembers,
    kpiActiveThisWeek,
    kpiQualifiedLeads,
    kpiFundedStarts,
    kpiPlacementsThisMonth,
    retentionRows,
  ] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, ...memberUser },
    }),
    countDistinctEventUsers(sevenDaysAgo, organizationId),
    // Qualified leads = members who completed assessment + have program interest but are not yet enrolled
    prisma.user.count({
      where: {
        deletedAt: null,
        assessmentCompleted: true,
        enrolledProgram: null,
        ...memberUser,
      },
    }),
    // Funded starts = members enrolled this month with a funding source on their placement (or any enrolled this month if no placement yet)
    prisma.user.count({
      where: {
        deletedAt: null,
        enrolledProgram: { not: null },
        enrolledAt: { gte: startOfMonth },
        ...memberUser,
      },
    }),
    // Placements this month
    prisma.placementRecord.count({
      where: { placedAt: { gte: startOfMonth }, user: memberUser },
    }),
    // Retention: pull retention fields for placements in this org/period so we
    // can compute the real 90-day retention rate below. Scoped by `placedAt`
    // and org exactly like getBoardOutcomes' placement query.
    prisma.placementRecord.groupBy({
      by: ['retentionStatus', 'retentionDecision'],
      where: {
        ...(retentionStart ? { placedAt: { gte: retentionStart, lte: retentionEnd } } : {}),
        user: memberUser,
      },
      _count: { _all: true },
    }),
  ]);

  // Real 90-day retention rate over placements with a *decided* outcome.
  // Retained: retentionDecision === 'retained' OR retentionStatus starts with
  // 'retained' (covers "retained_90d", "retained_180d").
  // Not retained: retentionDecision === 'not_retained' OR retentionStatus === 'separated'.
  // Pending / null outcomes are excluded from the denominator entirely.
  const retentionSummary = summarizeRetentionGroups(
    retentionRows.map((r) => ({
      retentionStatus: r.retentionStatus,
      retentionDecision: r.retentionDecision,
      count: r._count._all,
    })),
  );
  const retentionDenominator = retentionSummary.retained + retentionSummary.notRetainedOrSeparated;
  const retentionRate =
    retentionDenominator > 0 ? Math.round((retentionSummary.retained / retentionDenominator) * 100) : null;

  return {
    generatedAt: now,
    smallSampleThreshold: SMALL_SAMPLE_THRESHOLD,
    applicationFunnel,
    outcomes,
    activity: {
      totalMembers,
      active7d: active7dRows,
      active14d: active14dRows,
      active30d: active30dRows,
      inactive14d,
    },
    certifications: {
      totalEarned: totalCerts,
      earnedLast30d: certsLast30d,
      uniqueMembers: uniqueCertMembers,
    },
    dataQuality: {
      placementsMissingProgram,
      placementsMissingFunding,
      placementsMissingRetention,
      placementsMissingSalary,
      enrolledWithoutEnrolledAt,
    },
    funnelWaterfall,
    applicationQueueHealth: {
      pendingCount: applicationFunnel.pending,
      medianAgeDays: medianPendingAge,
      oldestAgeDays: oldestPendingAge,
    },
    cohorts,
    placementActivity,
    kpis: {
      totalMembers: kpiTotalMembers,
      activeThisWeek: kpiActiveThisWeek,
      qualifiedLeads: kpiQualifiedLeads,
      fundedStarts: kpiFundedStarts,
      placementsThisMonth: kpiPlacementsThisMonth,
      retentionRate,
    },
  };
}

/**
 * Format a `BoardSnapshot` as a printable single-page Markdown summary.
 *
 * This is what Dad walks into TWC, AAUL, or a corporate co-funder room with.
 * The footer carries the generation timestamp so a stale PDF never gets
 * mistaken for live data.
 */
export function formatBoardSnapshotMarkdown(snapshot: BoardSnapshot): string {
  const { generatedAt, applicationFunnel, outcomes, activity, certifications, dataQuality, funnelWaterfall, applicationQueueHealth, cohorts, kpis } = snapshot;
  const t = outcomes.totals;

  const fmtNumber = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('en-US');
  };
  const fmtMoney = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '—';
    return `$${n.toLocaleString('en-US')}`;
  };
  const fmtRate = (numerator: number, denominator: number): string => {
    if (denominator < SMALL_SAMPLE_THRESHOLD) {
      return `(N=${denominator}; sample too small for a reliable rate)`;
    }
    const pct = Math.round((numerator / denominator) * 100);
    return `${pct}% (${numerator}/${denominator})`;
  };
  const fmtDate = (d: Date): string =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const lines: string[] = [];
  lines.push(`# WorkforceAP Outcomes Snapshot`);
  lines.push('');
  lines.push(`**Period:** ${outcomes.period.label}  `);
  lines.push(`**Generated:** ${fmtDate(generatedAt)} at ${generatedAt.toLocaleTimeString('en-US')}  `);
  lines.push(`**Source:** Live production data via \`getBoardSnapshot()\``);
  lines.push('');
  lines.push('> All numbers in this snapshot are pulled live from the WorkforceAP database. Where');
  lines.push(`> the underlying sample is below ${SMALL_SAMPLE_THRESHOLD}, rates are suppressed and replaced with a sample-size note —`);
  lines.push('> deliberately, to avoid presenting unreliable proportions to funders.');
  lines.push('');

  // 1. Application funnel
  lines.push('## 1. Application Funnel');
  lines.push('');
  lines.push(`- **Total applications received:** ${fmtNumber(applicationFunnel.total)}`);
  lines.push(`- Pending review: ${fmtNumber(applicationFunnel.pending)}`);
  lines.push(`- Approved: ${fmtNumber(applicationFunnel.approved)}`);
  lines.push(`- Needs info: ${fmtNumber(applicationFunnel.needsInfo)}`);
  lines.push(`- Denied: ${fmtNumber(applicationFunnel.denied)}`);
  lines.push('');
  lines.push(`*Source: \`applications\` table grouped by \`status\`.*`);
  lines.push('');

  // 2. Member outcomes funnel
  lines.push('## 2. Member Outcomes Funnel');
  lines.push('');
  lines.push(`- **Members served (enrolled):** ${fmtNumber(t.membersEnrolled)}`);
  lines.push(`- In active training: ${fmtNumber(t.membersInTraining)}`);
  lines.push(`- Training completed: ${fmtNumber(t.membersCertified)}`);
  lines.push(`- Placed in employment: ${fmtNumber(t.membersPlaced)}`);
  lines.push('');
  lines.push(`- **Placement rate:** ${fmtRate(t.membersPlaced, t.membersEnrolled)}`);
  lines.push(`- Median annual salary at placement: ${fmtMoney(t.medianAnnualSalary)}`);
  lines.push(`- Total annual salary value: ${fmtMoney(t.totalAnnualSalaryValue)}`);
  lines.push(
    `- Average weeks from enrollment to placement: ${
      t.averageWeeksToPlacement === null ? '—' : `${t.averageWeeksToPlacement} weeks`
    }`,
  );
  lines.push('');
  lines.push(`*Source: \`users\` (enrolled), assigned-curriculum course completion rollups, and \`placement_records\`. Training completion does not establish credential verification.*`);
  lines.push('');

  // 3. Activity recency
  lines.push('## 3. Member Activity (Engagement)');
  lines.push('');
  lines.push(`- Total members in system: ${fmtNumber(activity.totalMembers)}`);
  lines.push(`- Active in last 7 days: ${fmtNumber(activity.active7d)}`);
  lines.push(`- Active in last 14 days: ${fmtNumber(activity.active14d)}`);
  lines.push(`- Active in last 30 days: ${fmtNumber(activity.active30d)}`);
  lines.push(`- Inactive 14+ days: ${fmtNumber(activity.inactive14d)}`);
  lines.push('');
  lines.push(`*Source: distinct \`user_id\` from \`member_events\` within each window.*`);
  lines.push('');

  // 4. Certifications
  lines.push('## 4. Credential Records');
  lines.push('');
  lines.push(`- Total credential records: ${fmtNumber(certifications.totalEarned)}`);
  lines.push(`- Reported earned dates in last 30 days: ${fmtNumber(certifications.earnedLast30d)}`);
  lines.push(`- Unique members with credential records: ${fmtNumber(certifications.uniqueMembers)}`);
  lines.push('');
  lines.push(`*Source: \`user_certifications\` table. Includes member-reported credentials and records with different review statuses; these are not verified-credential totals.*`);
  lines.push('');

  // 5. Programs breakdown
  lines.push('## 5. Programs');
  lines.push('');
  if (outcomes.programs.length === 0) {
    lines.push('*No enrolled members yet.*');
  } else {
    lines.push('| Program | Enrolled | Training completed | Placed | Placement Rate |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const p of outcomes.programs) {
      const rate =
        p.enrolled < SMALL_SAMPLE_THRESHOLD
          ? `(N=${p.enrolled})`
          : `${p.placementRate}%`;
      lines.push(`| ${p.programSlug} | ${p.enrolled} | ${p.certified} | ${p.placed} | ${rate} |`);
    }
  }
  lines.push('');
  lines.push(`*Source: \`users.enrolled_program\` joined with \`placement_records\` and program progress rollups.*`);
  lines.push('');

  // 6. Data quality flags
  lines.push('## 6. Data Quality Flags');
  lines.push('');
  lines.push('These are rows that exist in production but are missing fields a WIOA');
  lines.push('reviewer or board funder is likely to ask about. They are visible here');
  lines.push('so the team can fix them before any external review.');
  lines.push('');
  lines.push(`- Placements missing program slug: ${fmtNumber(dataQuality.placementsMissingProgram)}`);
  lines.push(`- Placements missing funding source: ${fmtNumber(dataQuality.placementsMissingFunding)}`);
  lines.push(`- Placements missing retention status / decision: ${fmtNumber(dataQuality.placementsMissingRetention)}`);
  lines.push(`- Placements missing salary at placement: ${fmtNumber(dataQuality.placementsMissingSalary)}`);
  lines.push(`- Enrolled members missing \`enrolled_at\` timestamp: ${fmtNumber(dataQuality.enrolledWithoutEnrolledAt)}`);
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*WorkforceAP outcomes snapshot generated ${fmtDate(generatedAt)}. Methodology: \`docs/OUTCOMES-METHODOLOGY.md\`.*`);
  lines.push('');

  return lines.join('\n');
}

const PDF_ACCENT = rgb(173 / 255, 44 / 255, 77 / 255);
const PDF_DARK = rgb(0.13, 0.13, 0.13);
const PDF_MUTED = rgb(0.45, 0.45, 0.45);
const PDF_RULE = rgb(0.87, 0.87, 0.87);
const PDF_PAGE_W = 612;
const PDF_PAGE_H = 792;
const PDF_MARGIN = 48;
const PDF_HEADER_H = 54;
const PDF_FOOTER_H = 24;

export async function formatBoardSnapshotPdf(snapshot: BoardSnapshot): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const maxWidth = PDF_PAGE_W - PDF_MARGIN * 2;
  const bodySize = 10;
  const bodyLineHeight = 14;
  const topY = PDF_PAGE_H - PDF_HEADER_H - 20;
  const bottomY = PDF_FOOTER_H + 18;

  const wrapText = (text: string, size: number): string[] => {
    const wrapped: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (!paragraph.trim()) {
        wrapped.push('');
        continue;
      }
      const words = paragraph.split(/\s+/);
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
          wrapped.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) wrapped.push(current);
    }
    return wrapped;
  };

  const lines = wrapText(formatBoardSnapshotMarkdown(snapshot).replace(/\*\*/g, ''), bodySize);

  const drawHeader = (page: ReturnType<PDFDocument['getPage']>) => {
    page.drawRectangle({ x: 0, y: PDF_PAGE_H - PDF_HEADER_H, width: PDF_PAGE_W, height: PDF_HEADER_H, color: PDF_ACCENT });
    page.drawText('WorkforceAP Outcomes Snapshot', {
      x: PDF_MARGIN,
      y: PDF_PAGE_H - PDF_HEADER_H / 2 - 6,
      font: boldFont,
      size: 15,
      color: rgb(1, 1, 1),
    });
  };

  const drawFooter = (page: ReturnType<PDFDocument['getPage']>, index: number, count: number) => {
    page.drawLine({ start: { x: PDF_MARGIN, y: PDF_FOOTER_H + 8 }, end: { x: PDF_PAGE_W - PDF_MARGIN, y: PDF_FOOTER_H + 8 }, thickness: 0.5, color: PDF_RULE });
    page.drawText(`Generated ${snapshot.generatedAt.toISOString()} · Page ${index} of ${count}`, {
      x: PDF_MARGIN,
      y: PDF_FOOTER_H - 1,
      font,
      size: 7,
      color: PDF_MUTED,
    });
  };

  let page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  drawHeader(page);
  let y = topY;

  for (const line of lines) {
    if (y < bottomY) {
      page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      drawHeader(page);
      y = topY;
    }
    if (!line.trim()) {
      y -= bodyLineHeight * 0.65;
      continue;
    }
    const isH1 = /^#\s/.test(line);
    const isH2 = /^##\s/.test(line);
    const clean = line.replace(/^#{1,3}\s+/, '');
    if (isH1 || isH2) {
      page.drawText(clean, {
        x: PDF_MARGIN,
        y,
        font: boldFont,
        size: isH1 ? 14 : 11,
        color: PDF_ACCENT,
      });
      y -= isH1 ? 20 : 16;
      continue;
    }
    page.drawText(clean, {
      x: PDF_MARGIN,
      y,
      font,
      size: bodySize,
      color: PDF_DARK,
    });
    y -= bodyLineHeight;
  }

  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i += 1) {
    drawFooter(pdfDoc.getPage(i), i + 1, pageCount);
  }

  return Buffer.from(await pdfDoc.save());
}
