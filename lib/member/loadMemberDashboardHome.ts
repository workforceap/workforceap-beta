import { buildMemberApprovalStatus, type MemberApprovalFacts, type MemberApprovalStatus } from './memberApprovalStatus';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from './starterProfileReview';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  canonicalizeProgramSlug,
  programSlugsEquivalent,
} from '@/lib/content/programSlug';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { describeCourseDenominator } from '@/lib/coursera/progressTileSummary';
import { effectiveStreak } from '@/lib/member/streakDisplay';
import { isTrainingActivityStale, trainingEligibleSince } from '@/lib/member/trainingStaleness';
import { ACTIVE_APPLICATION_STATUSES } from '@/lib/member/jobPipelineDisplay';
import { parseGoalDescription } from '@/lib/member/goalSteps';
import { EVENT_LABELS, getLevelForPoints, getNextLevel } from '@/lib/member/pointsConfig';
import {
  buildMemberPointsTrend,
  memberPointsSpark,
  type MemberStatSpark,
} from '@/lib/member/memberPointsTrend';
import { MEMBER_PROGRAM_HREF, resolveMemberProgramHref } from '@/lib/member/memberProgramHref';
import { buildNextBestActions, type NextBestAction } from '@/lib/member/nextBestActions';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import {
  digitalLiteracyFirstModuleHref,
  isWorkforceApCourse,
  workforceApCourseHref,
} from '@/lib/content/courseDelivery';

/**
 * Kit-default `/dashboard` home loader (SCALE Phase 2).
 *
 * Combines the former page-level fan-out (12 Prisma client calls on the kit
 * path; 24 on `?ui=legacy`) into **one `$transaction`** of at most
 * {@link MEMBER_DASHBOARD_HOME_PRISMA_BUDGET} operations:
 *
 *  1. `user.findUnique` with the nested relations / `_count`s the kit needs
 * Course facts are included in the nested user read so the page can apply the
 * same validated X/Y/% formula as the training detail without trusting a stale
 * aggregate rollup. The Points tile's weekly trend is bucketed in memory from
 * the same nested `points_transactions` page (see `memberPointsTrend`), so the
 * sparkline adds no Prisma operation and no second round trip.
 *
 * Coursera B4B + `maybeAutoSyncCourseraOnDashboard` stay **off this path**.
 * Hourly `coursera-training-sync` owns seeding. `getMemberState` (Redis
 * optional) is not called — the page still renders with no Upstash.
 *
 * `?ui=legacy` does not use this loader and may remain fat.
 */

/** Prisma ops this loader issues on the happy path (1–2). Layout bootstrap is extra. */
export const MEMBER_DASHBOARD_HOME_PRISMA_BUDGET = 2;

/**
 * Points rows read with the member (newest first).
 *
 * Sized for the eight rolling weeks the Points sparkline buckets into, not for
 * the three-row ledger. There is no natural ceiling to appeal to — `daily_study`
 * alone reaches 400 rows in 400 days, and job applications, counselor sessions
 * and counselor bonuses are unbounded — so this number is not a proof that
 * truncation cannot happen. It is a cheap headroom figure (the busiest member
 * in production history holds 54 rows in total), and correctness comes from
 * `buildMemberPointsTrend`, which drops the series rather than draw a
 * truncated one. Widening this costs no extra Prisma operation: it is the same
 * nested read.
 */
const POINTS_TRANSACTION_TAKE = 400;
/** Recent pipeline rows shown on the home card: anything not yet closed. */
const PIPELINE_ROW_STATUSES_EXCLUDED = ['REJECTED', 'ACCEPTED'] as const;

export type DashboardPipelineRow = {
  role: string;
  company: string;
  stage: string;
  tone: 'warn' | 'muted' | 'info';
  stageIndex: number;
  stageTotal: number;
  appliedLabel: string;
};

export type DashboardGoalSummary = {
  title: string;
  percent: number;
};

export type DashboardPointsLedgerEntry = {
  label: string;
  amount: number;
  color: 'accent' | 'info' | 'gold';
};

export type MemberDashboardHomeView = {
  approvalStatus: MemberApprovalStatus;
  firstName: string;
  coursePercent: number;
  /**
   * Training has gone quiet for longer than `STALE_TRAINING_ACTIVITY_DAYS`
   * (or the stale-training cron has already flagged it). The Course stat tile
   * only warns when this is true — being newly enrolled at 0% is not a fault.
   */
  courseProgressStale: boolean;
  programTitle?: string;
  /** Coursera progress exists, but no WAP program is assigned yet. */
  noProgram?: boolean;
  activeJobs: number;
  certs: number;
  points: number;
  currentStreak: number;
  longestStreak: number;
  /**
   * Plain line under the program tile naming the WorkforceAP lab inside the
   * course denominator (null when the program has no lab row).
   */
  programCoursesNote: string | null;
  goals: DashboardGoalSummary[];
  /**
   * Real next step title. For an enrolled member this is the program's next
   * incomplete module (first module when there is no progress yet), so the
   * certification-path card names a module even when the top next-best action
   * is the preassessment. Falls back to the top action title. Omit rather than
   * invent "Continue your training".
   */
  nextLesson?: string;
  nextLessonDue?: string;
  /** Deep link for `nextLesson` when it names a program module. */
  nextLessonHref?: string;
  /** Honest enrollment status. Omit when no program is on file. */
  programStatus?: string;
  nextBadgeName?: string;
  nextBadgePercent?: number;
  nextBadgeRemaining?: string;
  pipeline: DashboardPipelineRow[];
  certModulesDone: number;
  certModulesTotal: number;
  pointsLedger: DashboardPointsLedgerEntry[];
  pointsThisWeek?: number;
  /**
   * Points earned per rolling week for the Points tile's sparkline, with the
   * week-over-week delta chip. Omitted when there is nothing honest to draw.
   * The last point equals `pointsThisWeek` by construction — both come from
   * `buildMemberPointsTrend`, so the line cannot end on a different number
   * than the chip beside it.
   *
   * Course %, Active jobs and Certs have no series here on purpose: the first
   * two need history this schema does not keep, and a certification count
   * moves twice a year.
   */
  pointsSpark?: MemberStatSpark;
  programHref: string;
  resumeHref: string;
  coursesHref: string;
  toolkitHref: string;
  jobsHref: string;
  doThisNext: NextBestAction | null;
  /** Always the Digital Literacy lesson-1 URL; the kit shows it when no program is enrolled. */
  ungatedDigitalBasicsHref: string;
  /** Prisma client operations issued by this call (happy path ≤ budget). */
  prismaOpCount: number;
};

export type LoadMemberDashboardHomeArgs = {
  userId: string;
  fallbackDisplayName?: string | null;
  /** Orphan auth user: provision then the loader re-reads. */
  provisionIfMissing?: () => Promise<void>;
};

type DashboardHomeTx = {
  user: {
    findUnique: (args: unknown) => Promise<DashboardUserRow | null>;
  };
};

type DashboardHomeDb = {
  $transaction: <T>(fn: (tx: DashboardHomeTx) => Promise<T>) => Promise<T>;
};

type DashboardUserRow = MemberApprovalFacts & {
  phone?: string | null;
  profile?: { profilePhone: string | null; profileAddress: string | null; city: string | null; state: string | null; zip: string | null; referralSource: string | null } | null;
  fullName: string | null;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  /** Program enrolment date — half of the training-eligibility baseline. */
  enrolledAt?: Date | null;
  /** Preassessment completion — the other half; training cannot start before it. */
  assessmentCompletedAt?: Date | null;
  /** Written by the stale-training cron once it has flagged this member. */
  staleTrainingDetectedAt?: Date | null;
  organization: {
    courses: Array<{
      programSlug: string;
      courseSlug: string;
      name: string;
      estimatedHours: number | null;
      courseraCourseId: string | null;
      courseraSlug: string | null;
    }>;
  };
  courseEnrollments: Array<{ programSlug: string; curriculumVersion?: string; enrolledByAdminId?: string | null; enrolledAt?: Date | null }>;
  courseProgress: Array<{
    programSlug: string;
    courseSlug: string;
    courseId: string | null;
    percentComplete: number;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    lastActivityAt?: Date | null;
  }>;
  memberProgramProgress: Array<{
    programSlug: string;
    averagePercent: number;
    coursesCompleted: number;
  }>;
  memberPoints: {
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: Date | null;
  } | null;
  nextBestActions: Array<{
    id: string;
    title: string;
    description: string;
    ctaHref: string;
    ctaLabel: string;
    priority: number;
  }>;
  jobApplications: Array<{
    role: string;
    company: string;
    status: string;
    updatedAt: Date;
  }>;
  goals: Array<{
    title: string;
    description: string | null;
    targetMetricValue: number | null;
    currentMetricValue: number;
  }>;
  pointsTransactions: Array<{
    event: string;
    points: number;
    createdAt: Date;
  }>;
  _count: {
    userCertifications: number;
    jobApplications: number;
  };
};

const STAGE_TONE_BY_STATUS: Record<
  string,
  { label: string; tone: DashboardPipelineRow['tone']; step: number }
> = {
  SAVED: { label: 'Saved', tone: 'muted', step: 0 },
  APPLIED: { label: 'Applied', tone: 'muted', step: 1 },
  PHONE_SCREEN: { label: 'Screening', tone: 'info', step: 2 },
  INTERVIEWING: { label: 'Interviewing', tone: 'warn', step: 3 },
  OFFER: { label: 'Offer', tone: 'warn', step: 3 },
};

export function mapPipelineRows(
  jobs: Array<{ role: string; company: string; status: string; updatedAt: Date }>,
): DashboardPipelineRow[] {
  return jobs.map((job) => {
    const meta = STAGE_TONE_BY_STATUS[job.status] ?? { label: 'Applied', tone: 'muted' as const, step: 1 };
    return {
      role: job.role,
      company: job.company,
      stage: meta.label,
      tone: meta.tone,
      stageIndex: meta.step,
      stageTotal: 3,
      appliedLabel: job.updatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  });
}

export function pointsLedgerColor(event: string): DashboardPointsLedgerEntry['color'] {
  if (event === 'job_application' || event === 'interview_requested' || event === 'placement_recorded') {
    return 'info';
  }
  if (event === 'daily_study' || event.startsWith('referral_') || event === 'program_enrolled') {
    return 'gold';
  }
  return 'accent';
}

export function mapPointsLedger(
  rows: Array<{ event: string; points: number }>,
): DashboardPointsLedgerEntry[] {
  return rows.map((row) => ({
    label: EVENT_LABELS[row.event] ?? 'Points earned',
    amount: row.points,
    color: pointsLedgerColor(row.event),
  }));
}

export function mapGoalSummaries(
  goals: Array<{
    title: string;
    description: string | null;
    targetMetricValue: number | null;
    currentMetricValue: number;
  }>,
): DashboardGoalSummary[] {
  return goals.map((goal) => {
    let percent: number;
    if (goal.targetMetricValue && goal.targetMetricValue > 0) {
      percent = Math.max(0, Math.min(100, Math.round((goal.currentMetricValue / goal.targetMetricValue) * 100)));
    } else {
      const { steps } = parseGoalDescription(goal.description);
      const total = steps.length;
      const done = steps.filter((step) => step.done).length;
      percent = total > 0 ? Math.round((done / total) * 100) : 0;
    }
    return { title: goal.title, percent };
  });
}

export function deriveNextBadge(args: {
  totalPoints: number;
  certCount: number;
}): {
  nextBadgeName: string;
  nextBadgePercent: number;
  nextBadgeRemaining: string;
} {
  const currentLevel = getLevelForPoints(args.totalPoints);
  const nextLevel = getNextLevel(currentLevel.name);
  if (nextLevel) {
    const bandStart = currentLevel.min;
    const bandEnd = nextLevel.min;
    const span = Math.max(1, bandEnd - bandStart);
    const into = Math.max(0, args.totalPoints - bandStart);
    const remainingPts = Math.max(0, bandEnd - args.totalPoints);
    return {
      nextBadgeName: nextLevel.label,
      nextBadgePercent: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
      nextBadgeRemaining: `${remainingPts} ${remainingPts === 1 ? 'point' : 'points'}`,
    };
  }
  return {
    nextBadgeName: args.certCount > 0 ? 'Next certification' : 'First certification',
    nextBadgePercent: 0,
    nextBadgeRemaining: '1 certification',
  };
}

function displayFirstName(
  fullName: string | null | undefined,
  fallback: string | null | undefined,
): string {
  const pick = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return '';
    if (trimmed.includes('@')) return trimmed.split('@')[0] || '';
    return trimmed.split(/\s+/)[0] || '';
  };
  return pick(fullName) || pick(fallback);
}

function dashboardHomeStateLetter(args: {
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  allCoursesComplete: boolean;
}): 'A' | 'B' | 'C' | 'D' {
  if (!args.enrolledProgram) return 'A';
  if (!args.assessmentCompleted) return 'B';
  if (args.allCoursesComplete) return 'D';
  return 'C';
}

function fallbackDashboardHomeAction(args: {
  noApplicationOnFile?: boolean;
  starterProfileReviewRequired?: boolean;
  starterProfileMissingFields?: string[];
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  courseEnrollmentActive: boolean;
  completedCourseCount: number;
  jobApplicationCount: number;
  trainingCoursesIncomplete: boolean;
  nextIncompleteCourseName: string | null;
  allCoursesComplete: boolean;
}): NextBestAction {
  const actions = buildNextBestActions({
    state: dashboardHomeStateLetter(args),
    noApplicationOnFile: args.noApplicationOnFile ?? false,
    enrolledProgram: args.enrolledProgram,
    assessmentCompleted: args.assessmentCompleted,
    completedCourseCount: args.completedCourseCount,
    starterProfileReviewRequired: args.starterProfileReviewRequired,
    starterProfileMissingFields: args.starterProfileMissingFields,
    hasResume: true,
    profileCompletenessPct: 100,
    jobApplicationCount: args.jobApplicationCount,
    counselorUnreadCount: 0,
    weeklyRecapUnopened: false,
    courseEnrollmentActive: args.courseEnrollmentActive,
    trainingCoursesIncomplete: args.trainingCoursesIncomplete,
    nextIncompleteCourseName: args.nextIncompleteCourseName,
  });
  return actions[0]!;
}

function resolveDashboardHomeNextAction(args: {
  persisted: DashboardUserRow['nextBestActions'];
  noApplicationOnFile?: boolean;
  starterProfileReviewRequired?: boolean;
  starterProfileMissingFields?: string[];
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  courseEnrollmentActive: boolean;
  completedCourseCount: number;
  jobApplicationCount: number;
  trainingCoursesIncomplete: boolean;
  nextIncompleteCourseName: string | null;
  allCoursesComplete: boolean;
}): NextBestAction {
  const persisted = args.persisted[0];
  if (persisted) {
    return {
      id: persisted.id,
      title: persisted.title,
      body: persisted.description,
      href: resolveMemberProgramHref(persisted.ctaHref),
      cta: persisted.ctaLabel,
      variant: 'urgent',
      weight: persisted.priority + 100,
    };
  }
  return fallbackDashboardHomeAction(args);
}

function emptyHome(fallbackDisplayName: string | null | undefined): MemberDashboardHomeView {
  const firstName = displayFirstName(null, fallbackDisplayName);
  const badge = deriveNextBadge({ totalPoints: 0, certCount: 0 });
  const doThisNext = fallbackDashboardHomeAction({
    enrolledProgram: null,
    assessmentCompleted: false,
    courseEnrollmentActive: false,
    completedCourseCount: 0,
    jobApplicationCount: 0,
    trainingCoursesIncomplete: false,
    nextIncompleteCourseName: null,
    allCoursesComplete: false,
  });
  return {
    firstName,
    coursePercent: 0,
    courseProgressStale: false,
    approvalStatus: buildMemberApprovalStatus({}),
    activeJobs: 0,
    certs: 0,
    points: 0,
    currentStreak: 0,
    programCoursesNote: null,
    longestStreak: 0,
    goals: [],
    nextLesson: doThisNext.title,
    nextBadgeName: badge.nextBadgeName,
    nextBadgePercent: badge.nextBadgePercent,
    nextBadgeRemaining: badge.nextBadgeRemaining,
    pipeline: [],
    certModulesDone: 0,
    certModulesTotal: 0,
    pointsLedger: [],
    programHref: MEMBER_PROGRAM_HREF,
    resumeHref: MEMBER_PROGRAM_HREF,
    coursesHref: '/dashboard/learning',
    toolkitHref: '/dashboard/ai-tools',
    jobsHref: '/dashboard/jobs',
    doThisNext,
    ungatedDigitalBasicsHref: digitalLiteracyFirstModuleHref(),
    prismaOpCount: 1,
  };
}

function shapeHome(args: {
  row: DashboardUserRow;
  fallbackDisplayName: string | null | undefined;
  prismaOpCount: number;
}): MemberDashboardHomeView {
  const assignedSlug = args.row.courseEnrollments[0]?.programSlug ?? args.row.enrolledProgram ?? null;
  const inferredSlug =
    args.row.memberProgramProgress[0]?.programSlug ??
    args.row.courseProgress[0]?.programSlug ??
    null;
  const rawSlug = assignedSlug ?? inferredSlug;
  const slug = rawSlug ? canonicalizeProgramSlug(rawSlug) : null;
  const program = slug ? getProgramBySlug(slug) : undefined;
  const courseDbRows = slug
    ? args.row.organization.courses.filter((course) =>
        programSlugsEquivalent(course.programSlug, slug),
      )
    : [];
  const pinnedCurriculumVersion = args.row.courseEnrollments[0]?.curriculumVersion;
  const validatedCourses = program && pinnedCurriculumVersion
    ? getProgramCoursesForCurriculumVersion(program, pinnedCurriculumVersion)
    : program?.syllabus && !program.curriculumMigrationPending
      ? program.courses
      : courseDbRows.length > 0
        ? courseDbRows.map((course) => ({
            slug: course.courseSlug,
            name: course.name,
            estimatedHours: course.estimatedHours ?? 10,
            courseraCourseId: course.courseraCourseId ?? undefined,
            courseraSlug: course.courseraSlug ?? undefined,
          }))
        : (program?.courses ?? []);
  const matchingCourseProgress = slug
    ? args.row.courseProgress.filter((row) =>
        programSlugsEquivalent(row.programSlug, slug),
      )
    : [];
  const reconciliation = reconcileProgramProgress({
    validatedCourses,
    localRows: matchingCourseProgress.map((row) => ({
      courseSlug: row.courseSlug,
      courseId: row.courseId,
      percentComplete: row.percentComplete,
      status: row.status,
    })),
  });
  const totalCourses = reconciliation.totalCourses;
  const completedCount = reconciliation.completedCount;
  const pct = reconciliation.programPercent;
  const allCoursesComplete = reconciliation.allComplete;
  const firstName = displayFirstName(args.row.fullName, args.fallbackDisplayName);
  // Same ledger as the count above: a completion recorded under a Coursera id
  // (or an old synthetic slug) is complete here too, so "Next:" can never name
  // a course the header already counts as finished.
  const completedSlugs = new Set(
    reconciliation.rows.filter((row) => row.displayCompleted).map((row) => row.courseSlug),
  );
  const nextIncompleteCourse = validatedCourses.find((course) => !completedSlugs.has(course.slug));
  // The cert-path card must name a module, not the hero action: when the top
  // next-best action is the preassessment (or a guide), the program still has a
  // first / next incomplete module to show. `doThisNext` keeps the hero as is.
  const nextModule = program && slug && nextIncompleteCourse
    ? {
        title: nextIncompleteCourse.name,
        href: isWorkforceApCourse(nextIncompleteCourse)
          ? workforceApCourseHref(nextIncompleteCourse.slug, slug)
          : `${MEMBER_PROGRAM_HREF}?course=${encodeURIComponent(nextIncompleteCourse.slug)}`,
      }
    : null;

  const programHref = MEMBER_PROGRAM_HREF;
  // /dashboard/training only redirects back to /dashboard, so enrolled members
  // must resume on My Program — otherwise Continue/Resume is a do-loop.
  const resumeHref = programHref;
  const starterReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!args.row.courseEnrollments[0]?.enrolledByAdminId,
    phone: args.row.phone,
    ...args.row.profile,
  });
  const doThisNext = resolveDashboardHomeNextAction({
    noApplicationOnFile: args.row.applications ? args.row.applications.length === 0 : false,
    starterProfileReviewRequired: starterReview.required,
    starterProfileMissingFields: getStarterProfileFieldLabels(starterReview.missing),
    persisted: args.row.nextBestActions,
    enrolledProgram: assignedSlug,
    assessmentCompleted: args.row.assessmentCompleted,
    courseEnrollmentActive: args.row.courseEnrollments.length > 0,
    completedCourseCount: completedCount,
    jobApplicationCount: args.row._count.jobApplications,
    trainingCoursesIncomplete: Boolean(program) && !allCoursesComplete,
    nextIncompleteCourseName: nextIncompleteCourse?.name ?? null,
    allCoursesComplete,
  });

  // One rolling-7-day definition for both the "this week" chip and the last
  // point of the sparkline: same rows, same windows, computed once.
  const pointsTrend = buildMemberPointsTrend({
    transactions: args.row.pointsTransactions,
    now: Date.now(),
    truncated: args.row.pointsTransactions.length >= POINTS_TRANSACTION_TAKE,
  });
  const pointsThisWeek = pointsTrend.thisWeek;
  const recentLedger = args.row.pointsTransactions.slice(0, 3);
  const totalPoints = args.row.memberPoints?.totalPoints ?? 0;
  const badge = deriveNextBadge({
    totalPoints,
    certCount: args.row._count.userCertifications,
  });

  // Newest saved training activity across every course. `courseProgress` is
  // ordered by `lastActivityAt` desc, but Postgres sorts NULLs first on a
  // descending sort, so take the max rather than trusting row 0.
  //
  // Bounded by the same `take: 500` the progress maths already uses. A member
  // with more than 500 null-dated progress rows would have their real
  // activity fall outside the window and read as stale; that needs 500+
  // course rows on one member, which the catalog does not produce. Worth
  // knowing if the denominator ever grows.
  const lastTrainingActivityAt = args.row.courseProgress.reduce<Date | null>((latest, row) => {
    const at = row.lastActivityAt ?? null;
    if (!at) return latest;
    return !latest || at.getTime() > latest.getTime() ? at : latest;
  }, null);
  // The same baseline the member program page uses for
  // `isTrainingStaleForCounselorEscalation`: the later of enrolment and
  // finishing the preassessment, and only once both are true. Using the
  // program-enrolment date alone would call a member stale on their first day
  // of actually being able to start, and would disagree with that page.
  const courseProgressStale = isTrainingActivityStale({
    lastActivityAt: lastTrainingActivityAt,
    eligibleSince: trainingEligibleSince({
      enrolledProgram: assignedSlug,
      assessmentCompleted: args.row.assessmentCompleted,
      enrolledAt: args.row.enrolledAt,
      assessmentCompletedAt: args.row.assessmentCompletedAt,
    }),
    staleDetectedAt: args.row.staleTrainingDetectedAt ?? null,
  });

  return {
    firstName,
    coursePercent: pct,
    courseProgressStale,
    approvalStatus: buildMemberApprovalStatus(args.row),
    programTitle: program?.title ?? undefined,
    noProgram: Boolean(program && !assignedSlug),
    programStatus: program ? (allCoursesComplete ? 'Complete' : 'In progress') : undefined,
    activeJobs: args.row._count.jobApplications,
    certs: args.row._count.userCertifications,
    points: totalPoints,
    currentStreak: effectiveStreak({
      currentStreak: args.row.memberPoints?.currentStreak,
      lastActiveDate: args.row.memberPoints?.lastActiveDate,
    }),
    programCoursesNote: program ? describeCourseDenominator(validatedCourses) : null,
    longestStreak: args.row.memberPoints?.longestStreak ?? 0,
    goals: mapGoalSummaries(args.row.goals),
    nextLesson: nextModule?.title ?? doThisNext.title,
    nextLessonHref: nextModule?.href,
    nextBadgeName: badge.nextBadgeName,
    nextBadgePercent: badge.nextBadgePercent,
    nextBadgeRemaining: badge.nextBadgeRemaining,
    pipeline: mapPipelineRows(args.row.jobApplications),
    certModulesDone: completedCount,
    certModulesTotal: totalCourses,
    pointsLedger: mapPointsLedger(recentLedger),
    pointsThisWeek: pointsThisWeek > 0 ? pointsThisWeek : undefined,
    pointsSpark: memberPointsSpark(pointsTrend),
    programHref,
    resumeHref,
    coursesHref: '/dashboard/learning',
    toolkitHref: '/dashboard/ai-tools',
    jobsHref: '/dashboard/jobs',
    doThisNext,
    ungatedDigitalBasicsHref: digitalLiteracyFirstModuleHref(),
    prismaOpCount: args.prismaOpCount,
  };
}

function userSelect() {
  return {
    fullName: true,
    phone: true,
    profile: { select: { profilePhone: true, profileAddress: true, city: true, state: true, zip: true, referralSource: true } },
    applications: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true, submittedAt: true } },
    wioaReviewStatus: true,
    wioaReviewedAt: true,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: true,
    // WAP-91: names who owns the staff-side approval steps (same single query).
    counselorAssignments: {
      where: { active: true },
      orderBy: { assignedAt: 'desc' as const },
      take: 1,
      select: { counselor: { select: { user: { select: { fullName: true } } } } },
    },
    enrolledProgram: true,
    assessmentCompleted: true,
    enrolledAt: true,
    assessmentCompletedAt: true,
    staleTrainingDetectedAt: true,
    organization: {
      select: {
        courses: {
          take: 500,
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
      where: { isPrimary: true },
      take: 1,
      select: { programSlug: true, curriculumVersion: true, enrolledByAdminId: true, enrolledAt: true },
    },
    courseProgress: {
      orderBy: [{ lastActivityAt: 'desc' as const }, { lastUpdatedAt: 'desc' as const }],
      take: 500,
      select: {
        programSlug: true,
        courseSlug: true,
        courseId: true,
        percentComplete: true,
        status: true,
        lastActivityAt: true,
      },
    },
    memberProgramProgress: {
      orderBy: { lastUpdatedAt: 'desc' as const },
      take: 5,
      select: {
        programSlug: true,
        averagePercent: true,
        coursesCompleted: true,
      },
    },
    memberPoints: {
      select: { totalPoints: true, currentStreak: true, longestStreak: true, lastActiveDate: true },
    },
    nextBestActions: {
      where: { status: 'PENDING' },
      orderBy: { priority: 'desc' as const },
      take: 3,
      select: {
        id: true,
        title: true,
        description: true,
        ctaHref: true,
        ctaLabel: true,
        priority: true,
      },
    },
    jobApplications: {
      where: { status: { notIn: [...PIPELINE_ROW_STATUSES_EXCLUDED] } },
      orderBy: { updatedAt: 'desc' as const },
      take: 4,
      select: { role: true, company: true, status: true, updatedAt: true },
    },
    goals: {
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' as const },
      take: 3,
      select: {
        title: true,
        description: true,
        targetMetricValue: true,
        currentMetricValue: true,
      },
    },
    // Newest events, serving three readers off one nested read: the ledger
    // takes the first 3, the week chip sums the last 7 days, and the Points
    // sparkline buckets the last 8 rolling weeks. Deriving the series here
    // instead of issuing a GROUP BY keeps the loader at ONE Prisma operation,
    // inside MEMBER_DASHBOARD_HOME_PRISMA_BUDGET with a slot to spare.
    pointsTransactions: {
      orderBy: { createdAt: 'desc' as const },
      take: POINTS_TRANSACTION_TAKE,
      select: { event: true, points: true, createdAt: true },
    },
    _count: {
      select: {
        userCertifications: true,
        // "Active jobs" tile: one shared definition with the Jobs page.
        jobApplications: {
          where: { status: { in: [...ACTIVE_APPLICATION_STATUSES] } },
        },
      },
    },
  };
}

async function fetchHomeRow(
  db: DashboardHomeDb,
  userId: string,
): Promise<{ row: DashboardUserRow | null; prismaOpCount: number }> {
  return db.$transaction(async (tx) => {
    const row = await tx.user.findUnique({
      where: { id: userId },
      select: userSelect(),
    });
    if (!row) {
      return { row: null, prismaOpCount: 1 };
    }
    const slug =
      row.courseEnrollments[0]?.programSlug ??
      row.enrolledProgram ??
      row.memberProgramProgress[0]?.programSlug ??
      row.courseProgress[0]?.programSlug ??
      null;
    if (!slug) {
      return { row, prismaOpCount: 1 };
    }
    return { row, prismaOpCount: 1 };
  });
}

/**
 * Load kit-home props for `/dashboard` (default UI).
 *
 * `db` is injectable for unit tests. Production uses the shared Prisma client.
 * Redis / `getMemberState` / Coursera are intentionally not in this function.
 */
export async function loadMemberDashboardHome(
  args: LoadMemberDashboardHomeArgs,
  db?: DashboardHomeDb,
): Promise<MemberDashboardHomeView> {
  const client: DashboardHomeDb = db ?? (prisma as unknown as DashboardHomeDb);
  const run = () => fetchHomeRow(client, args.userId);
  let { row, prismaOpCount } = await withDbRetry(run);

  if (!row && args.provisionIfMissing) {
    await args.provisionIfMissing();
    ({ row, prismaOpCount } = await withDbRetry(run));
  }

  if (!row) {
    return emptyHome(args.fallbackDisplayName);
  }

  return shapeHome({
    row,
    fallbackDisplayName: args.fallbackDisplayName,
    prismaOpCount,
  });
}
