import type { Prisma } from '@prisma/client';
import { buildMemberApprovalStatus, type MemberApprovalFacts, type MemberApprovalStatus } from './memberApprovalStatus';
import {
  EMPTY_COUNSELOR_CONTEXT,
  awaitingStep,
  counselorAssignmentSelect,
  resolveAssignedCounselor,
  type AssignedCounselorRow,
  type MemberCounselorContext,
} from './counselorContext';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from './starterProfileReview';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  canonicalizeProgramSlug,
  programSlugsEquivalent,
} from '@/lib/content/programSlug';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
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
import { recommendMemberTool, type MemberToolRecommendation } from '@/lib/member/recommendMemberTool';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import {
  digitalLiteracyFirstModuleHref,
  isWorkforceApCourse,
  workforceApCourseHref,
} from '@/lib/content/courseDelivery';
import {
  FIRST90_CHECK_IN_EVENT,
  buildCheckInsByStage,
  daysSincePlacement,
  getFirst90Stage,
  type First90Response,
  type First90Stage,
} from '@/lib/member/first90Days';

/**
 * The `/dashboard` home loader (SCALE Phase 2) — the only one since the
 * `?ui=legacy` home was retired (WAP-195).
 *
 * Combines the former page-level fan-out (12 Prisma client calls on the kit
 * path; 24 on the retired `?ui=legacy` home) into **one `$transaction`** of at most
 * {@link MEMBER_DASHBOARD_HOME_PRISMA_BUDGET} operations:
 *
 *  1. `user.findUnique` with the nested relations / `_count`s the kit needs
 * Course facts are included in the nested user read so the page can apply the
 * same validated X/Y/% formula as the training detail without trusting a stale
 * aggregate rollup. The Points tile's weekly trend is bucketed in memory from
 * the same nested `points_transactions` page (see `memberPointsTrend`), so the
 * sparkline adds no Prisma operation and no second round trip. The pieces the
 * retired legacy home read separately (OFFER rows for the placement confirmation
 * strip, First 90 Days check-ins, the youth notice's date of birth, every
 * persisted next-best action) ride on the same read too, and so do the
 * first-login wizard's intake fields and every `CourseEnrollment` the
 * `?program=` switch chooses between (WAP-194).
 *
 * Coursera B4B + `maybeAutoSyncCourseraOnDashboard` stay **off this path**.
 * Hourly `coursera-training-sync` owns seeding. `getMemberState` (Redis
 * optional) is not called — the page still renders with no Upstash.
 *
 * `/dashboard?ui=legacy` and `?tab=` now redirect to the kit home, so there is
 * no fat path left on this route (lib/member/dashboardLegacyRedirect.ts).
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
/** Rows the home "Application pipeline" card shows: the most recently updated open ones. */
const PIPELINE_ROW_LIMIT = 4;
/**
 * Open job-tracker rows read with the member (newest update first).
 *
 * The pipeline card shows the first {@link PIPELINE_ROW_LIMIT}; the rest of the
 * page is read so an OFFER row reaches the placement confirmation strip even
 * when newer saved or applied rows have pushed it off the card. The legacy
 * home issued a separate OFFER-only read for this (`take: 500`); here it is
 * the same nested read, so it costs no Prisma operation. Moving a row to OFFER
 * bumps its `updatedAt`, so an offer falls outside this page only when the
 * member has since touched more than this many other open rows.
 */
const OPEN_APPLICATION_TAKE = 200;
/** First 90 Days check-ins read with the member; the legacy home read the same 12. */
const FIRST90_EVENT_TAKE = 12;
/**
 * Enrollments read with the member, primary first. `(userId, programSlug)` is
 * unique, so this is a ceiling on programs, not rows: the whole catalog is a
 * few dozen programs and staff enrol a member in one or two.
 */
const COURSE_ENROLLMENT_TAKE = 25;
/** Written by the interview practice flow; counted, not listed. */
const INTERVIEW_PRACTICE_COMPLETED_EVENT = 'career_os.interview_practice_completed';

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

/** One OFFER row the placement confirmation strip asks about. */
export type DashboardJobOffer = {
  id: string;
  role: string;
  company: string;
};

/** Props for `First90DaysCard`, built the way the legacy home built them. */
export type DashboardFirst90Card = {
  stage: First90Stage;
  daysSincePlacement: number;
  employerName: string;
  currentStageResponse: First90Response | null;
  completedStages: First90Stage[];
};

/**
 * What the `member_dashboard_viewed` / `member_dashboard_activated` events
 * carry. `/api/admin/metrics` reads both (weekly dashboard views, Activation
 * Rate) and `lib/admin/healthScore.ts` counts them as member activity, so the
 * kit home writes them with the legacy home's definitions (see
 * `dashboardViewFacts`).
 */
export type DashboardViewFacts = {
  /**
   * `getMemberState`'s stage letter, the one legacy wrote: A no application,
   * B no program, C preassessment not done, D assessed. Not the letter
   * `buildNextBestActions` is given below.
   */
  state: 'A' | 'B' | 'C' | 'D';
  checklistAllDone: boolean;
  /** Completed courses in the assigned program; 0 without one. */
  completedCount: number;
  programTitle?: string;
};

/** One of the member's own enrollments, for the view-only program switch (`DashboardProgramSelector`). */
export type DashboardProgramOption = {
  id: string;
  programSlug: string;
  programTitle: string;
  isPrimary: boolean;
};

/**
 * The view-only enrolled-program switch (WAP-194). Present only when the
 * member has more than one `CourseEnrollment`; choosing an option reloads
 * `/dashboard?program=<slug>`, which changes what the home describes and
 * never an enrollment (locked stake: members do not change programs).
 */
export type DashboardProgramSwitch = {
  options: DashboardProgramOption[];
  /** The option the home describes, spelled exactly as that option's `programSlug`. */
  activeProgramSlug: string;
  /**
   * The home describes a non-primary enrollment. My Program
   * (`/dashboard/program`) and the Coursera launch still open the primary
   * program (WAP-196), so the program links on this view go to the Learning
   * hub instead of deep-linking a course My Program cannot open.
   */
  viewingSecondary: boolean;
};

/**
 * What the first-login guidance needs (`PortalEntryClient portal="member"`):
 * whether to open the onboarding wizard or auto-start the first-visit tour,
 * and the intake fields the wizard is pre-filled with. Read from the same
 * nested user read; the legacy home issued a separate intake query.
 */
export type DashboardOnboarding = {
  /** `onboardingCompletedAt` is not set: open the wizard. */
  showWizard: boolean;
  /**
   * Onboarding is done but `tourCompletedAt` is not set: the legacy 1.5 s
   * tour auto-start applies. The page still turns it off when the
   * `guided_tours_v2` flag is on (the shell owns the tour then).
   */
  showTour: boolean;
  wizard: {
    initialFullName: string;
    initialPhone: string;
    initialAddress: string;
    initialCity: string;
    initialState: string;
    initialZip: string;
    initialProgramInterest: string;
    initialReferralSource: string;
    initialStep: number;
  };
};

export type MemberDashboardHomeView = {
  approvalStatus: MemberApprovalStatus;
  /**
   * Assigned counselor + the step the member is waiting on, resolved from the
   * same user read as `approvalStatus.counselorName`. `waitEstimate` is always
   * null here: the page adds it (`getApprovalWaitEstimate`) only while the
   * application is under review, outside this loader's operation budget.
   */
  counselorContext: MemberCounselorContext;
  /** The member's organisation, for the page-level wait estimate. */
  organizationId: string | null;
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
  /**
   * The next few steps after `doThisNext`, so the home says more than one
   * true thing: the other persisted (staff- or cron-written) actions first,
   * then the stalled-training counselor row when it applies, then the
   * heuristics. Never repeats the hero or a page already listed, never the
   * always-present "talk to your counselor" floor.
   */
  upNext: NextBestAction[];
  /** One AI Career Tools pick for the member's stage; null when none fits. */
  recommendedTool: MemberToolRecommendation | null;
  /** Always the Digital Literacy lesson-1 URL; the kit shows it when no program is enrolled. */
  ungatedDigitalBasicsHref: string;
  /** OFFER rows for the placement confirmation strip (member-reported placements). Empty renders nothing. */
  jobOffers: DashboardJobOffer[];
  /** First 90 Days check-in card while a placement is inside its window; null otherwise. */
  first90: DashboardFirst90Card | null;
  /** The member's age from `profile.dob` when it is under 18 (the youth notice); null otherwise. */
  youthNoticeAge: number | null;
  /** Facts for the dashboard view / activation events; null when there is no member row to write them for. */
  dashboardViewFacts: DashboardViewFacts | null;
  /** First-login wizard / tour state; null when there is no member row. */
  onboarding: DashboardOnboarding | null;
  /** The enrolled-program switch; null unless the member has more than one enrollment. */
  programSwitch: DashboardProgramSwitch | null;
  /** Prisma client operations issued by this call (happy path ≤ budget). */
  prismaOpCount: number;
};

export type LoadMemberDashboardHomeArgs = {
  userId: string;
  fallbackDisplayName?: string | null;
  /**
   * `/dashboard?program=<slug>`: which of the member's own enrollments the
   * home describes. Honoured only when it names one of their enrollments;
   * anything else (unknown, someone else's, blank) falls back to the primary,
   * exactly as `getActiveProgramForDashboard` resolves it.
   */
  requestedProgramSlug?: string | null;
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

type DashboardUserRow = Omit<MemberApprovalFacts, 'applications'> & {
  /** Newest application; `programInterest` pre-fills the first-login wizard. */
  applications?: Array<{ status: string; submittedAt: Date | null; programInterest?: string | null }>;
  organizationId?: string;
  counselorAssignments?: AssignedCounselorRow[];
  phone?: string | null;
  profile?: {
    profilePhone: string | null;
    profileAddress: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    referralSource: string | null;
    resumeOriginalPath?: string | null;
    resumeEnhancedPath?: string | null;
    /** Date of birth; drives the youth notice (under 18). */
    dob?: Date | null;
  } | null;
  /** The member's own counselor thread (memberId is unique, so 0 or 1 rows). */
  messageThreadsAsMember?: Array<{
    memberLastReadAt: Date | null;
    /** Newest messages written by someone other than the member. */
    messages: Array<{ createdAt: Date }>;
  }>;
  /** First 90 Days check-ins, newest first (entityId = stage, metadata.response). */
  memberEvents?: Array<{ entityId: string | null; metadata: unknown; createdAt: Date }>;
  placementRecord?: {
    placedAt: Date | null;
    retentionDecision: string | null;
    retentionStatus: string | null;
    employerName?: string | null;
  } | null;
  fullName: string | null;
  /** First-login wizard / tour state (`/api/onboarding/*` writes these). */
  onboardingCompletedAt?: Date | null;
  onboardingCurrentStep?: number | null;
  tourCompletedAt?: Date | null;
  /** Intake program interest, the wizard's fallback when the application has none. */
  programInterest?: string | null;
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
  /** Every enrollment, primary first then newest (at most {@link COURSE_ENROLLMENT_TAKE}). */
  courseEnrollments: Array<{
    id?: string;
    programSlug: string;
    curriculumVersion?: string;
    isPrimary?: boolean;
    enrolledByAdminId?: string | null;
    enrolledAt?: Date | null;
  }>;
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
  /** Open rows, newest update first: the pipeline card's rows plus any OFFER further down. */
  jobApplications: Array<{
    id: string;
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
    /** Finished interview practice sessions; above 0 retires the practice row. */
    memberEvents?: number;
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

type DashboardHomeActionFacts = {
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
  /**
   * Real engagement facts from the same user read. Optional only for the
   * zeroed view (no user row), where "nothing to nag about" is the honest
   * default. Profile completeness and the weekly recap stay off this path:
   * the first needs the full profile scorer, the second a week-bounds read.
   */
  hasResume?: boolean;
  hasCompletedInterviewPractice?: boolean;
  counselorUnreadCount?: number;
  placementPlacedAt?: Date | null;
  placementRetentionDecision?: string | null;
  placementSeparated?: boolean;
};

function computeDashboardHomeActions(args: DashboardHomeActionFacts): NextBestAction[] {
  return buildNextBestActions({
    state: dashboardHomeStateLetter(args),
    noApplicationOnFile: args.noApplicationOnFile ?? false,
    enrolledProgram: args.enrolledProgram,
    assessmentCompleted: args.assessmentCompleted,
    completedCourseCount: args.completedCourseCount,
    starterProfileReviewRequired: args.starterProfileReviewRequired,
    starterProfileMissingFields: args.starterProfileMissingFields,
    hasResume: args.hasResume ?? true,
    hasCompletedInterviewPractice: args.hasCompletedInterviewPractice ?? true,
    profileCompletenessPct: 100,
    jobApplicationCount: args.jobApplicationCount,
    counselorUnreadCount: args.counselorUnreadCount ?? 0,
    weeklyRecapUnopened: false,
    courseEnrollmentActive: args.courseEnrollmentActive,
    trainingCoursesIncomplete: args.trainingCoursesIncomplete,
    nextIncompleteCourseName: args.nextIncompleteCourseName,
    placementPlacedAt: args.placementPlacedAt ?? null,
    placementRetentionDecision: args.placementRetentionDecision ?? null,
    placementSeparated: args.placementSeparated ?? false,
  });
}

/** Rows shown under the hero; the hero plus these make the four actions `buildNextBestActions` returns. */
const UP_NEXT_LIMIT = 3;

/** `/a/b?x=1#y` → `/a/b`: two rows that open the same page are one step. */
function hrefPath(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

const COUNSELOR_MESSAGES_PATH = '/dashboard/messages';

/**
 * The row the kit home shows when enrolled training has gone quiet: the
 * legacy home's `MemberStuckCounselorStrip` (`dashboard.stuckTalkToCounselor`,
 * `stuckNoActivityMessage`, `openMessages`) as one step, pointing at the same
 * counselor thread. It says only what the staleness flag knows: no activity
 * has been saved for a while.
 */
export const STALE_TRAINING_COUNSELOR_ACTION: NextBestAction = {
  id: 'stale_training_counselor',
  title: 'Stuck? Talk to an advisor',
  body: "We haven't seen training activity in a while. Message your team.",
  href: COUNSELOR_MESSAGES_PATH,
  cta: 'Open messages',
  variant: 'default',
  // Placed explicitly (after the persisted rows, before the heuristics), so
  // the weight never ranks it.
  weight: 0,
};

/** A persisted `MemberNextBestAction` row in the shape the home renders. */
function persistedAction(row: DashboardUserRow['nextBestActions'][number]): NextBestAction {
  return {
    id: row.id,
    title: row.title,
    body: row.description,
    href: resolveMemberProgramHref(row.ctaHref),
    cta: row.ctaLabel,
    variant: 'urgent',
    weight: row.priority + 100,
  };
}

/** Where program links go while the home describes a non-primary enrollment. */
export const SECONDARY_PROGRAM_HREF = '/dashboard/learning';

/**
 * A computed training step ("Continue training: …", "Launch your first
 * course") opens My Program, which shows the primary program whatever
 * `?program=` says (WAP-196). On a secondary program's view it would name
 * this program's course and open another program's page, so it points at the
 * Learning hub instead, and says so. Every other step is about the member,
 * not the program, and is left alone; so are persisted (staff-written) rows.
 */
export function secondaryProgramAction(action: NextBestAction): NextBestAction {
  if (hrefPath(action.href) !== MEMBER_PROGRAM_HREF) return action;
  return {
    ...action,
    href: SECONDARY_PROGRAM_HREF,
    body: 'Open the Learning hub for learning pathways and program tools.',
    cta: 'Open Learning hub',
  };
}

/**
 * Hero + "Up next" from one ranked list. The first persisted (staff- or
 * cron-written) action still wins the hero, and the other persisted rows lead
 * the list beneath it; the heuristics then fill what is left. When training
 * has stalled and no row already opens Messages, the counselor row joins
 * right after the persisted ones. Rows never repeat a page already on screen,
 * stop at {@link UP_NEXT_LIMIT}, and never show the "talk to your counselor"
 * floor — it exists so the hero is never blank, and Messages is one tap away
 * in the rail.
 */
function resolveDashboardHomeActions(
  args: DashboardHomeActionFacts & {
    persisted: DashboardUserRow['nextBestActions'];
    /** Enrolled training has gone quiet (see `shapeHome`); offers the counselor row. */
    trainingStalled?: boolean;
    /** The home describes a non-primary enrollment (see {@link secondaryProgramAction}). */
    viewingSecondaryProgram?: boolean;
  },
): { doThisNext: NextBestAction; upNext: NextBestAction[] } {
  const heuristicActions = computeDashboardHomeActions(args);
  const computed = args.viewingSecondaryProgram
    ? heuristicActions.map(secondaryProgramAction)
    : heuristicActions;
  const [firstPersisted, ...otherPersisted] = args.persisted.map(persistedAction);
  const doThisNext: NextBestAction = firstPersisted ?? computed[0]!;
  const heuristics = computed.filter(
    (action) => action.id !== doThisNext.id && action.id !== 'default_counselor',
  );

  const fill = (candidates: NextBestAction[]): NextBestAction[] => {
    const shownPaths = new Set([hrefPath(doThisNext.href)]);
    const rows: NextBestAction[] = [];
    for (const action of candidates) {
      if (rows.length >= UP_NEXT_LIMIT) break;
      const path = hrefPath(action.href);
      if (shownPaths.has(path)) continue;
      shownPaths.add(path);
      rows.push(action);
    }
    return rows;
  };

  const upNext = fill([...otherPersisted, ...heuristics]);
  const messagesShown = [doThisNext, ...upNext].some(
    (action) => hrefPath(action.href) === COUNSELOR_MESSAGES_PATH,
  );
  if (args.trainingStalled && !messagesShown) {
    return { doThisNext, upNext: fill([...otherPersisted, STALE_TRAINING_COUNSELOR_ACTION, ...heuristics]) };
  }
  return { doThisNext, upNext };
}

/**
 * First 90 Days card props, built exactly as the retired legacy branch of
 * `app/(portal)/dashboard/page.tsx` built them (WAP-188): a stage only inside the
 * placement's window (`getFirst90Stage`), the newest response per stage, and
 * every stage that has one.
 */
export function buildFirst90Card(
  placement: { placedAt: Date | null; employerName?: string | null } | null | undefined,
  events: Array<{ entityId: string | null; metadata: unknown; createdAt: Date }>,
  now: Date = new Date(),
): DashboardFirst90Card | null {
  const placedAt = placement?.placedAt;
  if (!placedAt) return null;
  const stage = getFirst90Stage(placedAt, now);
  if (!stage) return null;
  const checkInsByStage = buildCheckInsByStage(events);
  return {
    stage,
    daysSincePlacement: daysSincePlacement(placedAt, now),
    employerName: placement.employerName ?? '',
    currentStageResponse: checkInsByStage[stage]?.response ?? null,
    completedStages: Object.keys(checkInsByStage) as First90Stage[],
  };
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * The legacy home's age maths (`profile.dob`, whole years of 365.25 days),
 * returned only when it is under 18 — the one thing the youth notice needs.
 * A future or unreadable date of birth is bad data, not a young member, so it
 * shows nothing.
 */
export function youthNoticeAgeFromDob(dob: Date | null | undefined, now: number = Date.now()): number | null {
  if (!dob) return null;
  const age = Math.floor((now - new Date(dob).getTime()) / YEAR_MS);
  return age >= 0 && age < 18 ? age : null;
}

/**
 * Facts for the dashboard view / activation events, with the legacy home's
 * definitions (`DashboardHomeClient`): the stage letter is `getMemberState`'s
 * (`deriveStateLetter`, not exported and not importable here), the checklist
 * is its five milestones, and activation is "past stage A with a course
 * completed". Course counts come from this loader's own reconciliation, the
 * same ledger the Course tile shows; legacy blended in B4B, which stays off
 * this path.
 */
export function dashboardViewFacts(args: {
  applicationExists: boolean;
  assignedProgramSlug: string | null;
  assessmentCompleted: boolean;
  completedCount: number;
  programTitle?: string;
}): DashboardViewFacts {
  const enrolled = Boolean(args.assignedProgramSlug);
  const state: DashboardViewFacts['state'] = !args.applicationExists
    ? 'A'
    : !enrolled
      ? 'B'
      : !args.assessmentCompleted
        ? 'C'
        : 'D';
  // Legacy read training only for an assigned program, so nothing counts without one.
  const completedCount = enrolled ? args.completedCount : 0;
  return {
    state,
    // Account, program, preassessment, first course started, first course
    // completed. A completed course is also a started one, so the last two
    // collapse into one check.
    checklistAllDone: enrolled && args.assessmentCompleted && completedCount >= 1,
    completedCount,
    ...(enrolled && args.programTitle ? { programTitle: args.programTitle } : {}),
  };
}

/** Counselor-thread messages the member has not read, from the nested thread read. */
export function countUnreadCounselorMessages(
  thread: { memberLastReadAt: Date | null; messages: Array<{ createdAt: Date }> } | undefined,
): number {
  if (!thread) return 0;
  const readAt = thread.memberLastReadAt?.getTime();
  if (readAt === undefined) return thread.messages.length;
  return thread.messages.filter((message) => message.createdAt.getTime() > readAt).length;
}

function emptyHome(fallbackDisplayName: string | null | undefined): MemberDashboardHomeView {
  const firstName = displayFirstName(null, fallbackDisplayName);
  const badge = deriveNextBadge({ totalPoints: 0, certCount: 0 });
  const { doThisNext, upNext } = resolveDashboardHomeActions({
    persisted: [],
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
    counselorContext: EMPTY_COUNSELOR_CONTEXT,
    organizationId: null,
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
    upNext,
    // No user row: nothing is known about the member's stage, so name no tool.
    recommendedTool: null,
    ungatedDigitalBasicsHref: digitalLiteracyFirstModuleHref(),
    jobOffers: [],
    first90: null,
    youthNoticeAge: null,
    // No member row to attach an event to (the retired legacy home redirected
    // such sessions away; the kit home renders the empty shape instead).
    dashboardViewFacts: null,
    // No member row for the wizard to write to, and no enrollment to switch.
    onboarding: null,
    programSwitch: null,
    prismaOpCount: 1,
  };
}

/**
 * Which enrollment the home describes, with `getActiveProgramForDashboard`'s
 * semantics (`resolveActiveDashboardProgram`): the primary enrollment (or the
 * legacy `User.enrolledProgram`), unless `requestedProgramSlug` names one of
 * the member's own enrollments. With no request this is exactly the slug the
 * loader used before it read every enrollment.
 */
export function resolveHomeEnrollment(
  row: Pick<DashboardUserRow, 'courseEnrollments' | 'enrolledProgram'>,
  requestedProgramSlug: string | null | undefined,
) {
  const enrollments = row.courseEnrollments;
  const primaryEnrollment = enrollments.find((enrollment) => enrollment.isPrimary === true) ?? null;
  const resolved = resolveActiveDashboardProgram({
    enrollments: enrollments.map((enrollment, index) => ({
      id: enrollment.id ?? `enrollment-${index}`,
      programSlug: enrollment.programSlug,
      isPrimary: enrollment.isPrimary === true,
      enrolledAt: enrollment.enrolledAt ?? new Date(0),
    })),
    legacyEnrolledProgram: row.enrolledProgram,
    requestedProgramSlug,
  });
  const activeSlug = resolved.activeProgramSlug;
  const viewingSecondary = Boolean(
    activeSlug &&
      resolved.primaryProgramSlug &&
      !programSlugsEquivalent(activeSlug, resolved.primaryProgramSlug),
  );
  const activeEnrollment = activeSlug
    ? enrollments.find((enrollment) => programSlugsEquivalent(enrollment.programSlug, activeSlug)) ?? null
    : null;
  // The primary view keeps reading the primary row exactly as before (its
  // curriculum pin, "is there an enrollment"); a secondary view reads its own.
  const pinnedEnrollment = viewingSecondary ? activeEnrollment : primaryEnrollment;
  const programSwitch: DashboardProgramSwitch | null =
    enrollments.length > 1 && activeSlug
      ? {
          options: enrollments.map((enrollment, index) => ({
            id: enrollment.id ?? `enrollment-${index}`,
            programSlug: enrollment.programSlug,
            programTitle: programDisplayTitle(enrollment.programSlug),
            isPrimary: enrollment.isPrimary === true,
          })),
          activeProgramSlug: activeEnrollment?.programSlug ?? activeSlug,
          viewingSecondary,
        }
      : null;
  return { activeSlug, primaryEnrollment, pinnedEnrollment, activeEnrollment, viewingSecondary, programSwitch };
}

/** The wizard / tour gate and the wizard's pre-filled intake, as the legacy home built them. */
export function buildDashboardOnboarding(row: DashboardUserRow): DashboardOnboarding {
  const onboardingDone = row.onboardingCompletedAt != null;
  return {
    showWizard: !onboardingDone,
    showTour: onboardingDone && row.tourCompletedAt == null,
    wizard: {
      initialFullName: row.fullName ?? '',
      initialPhone: row.profile?.profilePhone ?? row.phone ?? '',
      initialAddress: row.profile?.profileAddress ?? '',
      initialCity: row.profile?.city ?? '',
      initialState: row.profile?.state ?? '',
      initialZip: row.profile?.zip ?? '',
      initialProgramInterest: row.applications?.[0]?.programInterest ?? row.programInterest ?? '',
      initialReferralSource: row.profile?.referralSource ?? '',
      initialStep: row.onboardingCurrentStep ?? 0,
    },
  };
}

function shapeHome(args: {
  row: DashboardUserRow;
  fallbackDisplayName: string | null | undefined;
  requestedProgramSlug?: string | null;
  prismaOpCount: number;
}): MemberDashboardHomeView {
  const home = resolveHomeEnrollment(args.row, args.requestedProgramSlug);
  const { viewingSecondary } = home;
  const assignedSlug = home.activeSlug;
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
  const pinnedCurriculumVersion = home.pinnedEnrollment?.curriculumVersion;
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
  // A WorkforceAP module page opens any of the member's enrollments by its
  // stored slug (`?program=`). My Program's `?course=` does not: it always
  // shows the primary program (WAP-196), so a secondary program's Coursera
  // module goes to the Learning hub rather than to a page that cannot open it.
  const nextModule = program && slug && nextIncompleteCourse
    ? {
        title: nextIncompleteCourse.name,
        href: isWorkforceApCourse(nextIncompleteCourse)
          ? workforceApCourseHref(
              nextIncompleteCourse.slug,
              viewingSecondary ? home.activeEnrollment?.programSlug ?? slug : slug,
            )
          : viewingSecondary
            ? SECONDARY_PROGRAM_HREF
            : `${MEMBER_PROGRAM_HREF}?course=${encodeURIComponent(nextIncompleteCourse.slug)}`,
      }
    : null;

  const programHref = viewingSecondary ? SECONDARY_PROGRAM_HREF : MEMBER_PROGRAM_HREF;
  // /dashboard/training only redirects back to /dashboard, so enrolled members
  // must resume on My Program — otherwise Continue/Resume is a do-loop.
  const resumeHref = programHref;
  const starterReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!home.primaryEnrollment?.enrolledByAdminId,
    phone: args.row.phone,
    ...args.row.profile,
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

  // The legacy home's `MemberStuckCounselorStrip`, as an "Up next" row: only
  // while an assigned program still has courses left, so a member who has
  // finished (or has no program) is never told their training went quiet.
  const trainingStalled =
    courseProgressStale && Boolean(assignedSlug) && Boolean(program) && !allCoursesComplete;

  const hasResume = Boolean(args.row.profile?.resumeOriginalPath || args.row.profile?.resumeEnhancedPath);
  const hasCompletedInterviewPractice = (args.row._count.memberEvents ?? 0) > 0;
  const placement = args.row.placementRecord ?? null;
  const placementSeparated = Boolean(
    placement &&
      (placement.retentionDecision === 'not_retained' || placement.retentionStatus === 'separated'),
  );
  const { doThisNext, upNext } = resolveDashboardHomeActions({
    hasResume,
    hasCompletedInterviewPractice,
    counselorUnreadCount: countUnreadCounselorMessages(args.row.messageThreadsAsMember?.[0]),
    placementPlacedAt: placement?.placedAt ?? null,
    placementRetentionDecision: placement?.retentionDecision ?? null,
    placementSeparated,
    noApplicationOnFile: args.row.applications ? args.row.applications.length === 0 : false,
    starterProfileReviewRequired: starterReview.required,
    starterProfileMissingFields: getStarterProfileFieldLabels(starterReview.missing),
    persisted: args.row.nextBestActions,
    trainingStalled,
    viewingSecondaryProgram: viewingSecondary,
    enrolledProgram: assignedSlug,
    assessmentCompleted: args.row.assessmentCompleted,
    courseEnrollmentActive: Boolean(home.pinnedEnrollment),
    completedCourseCount: completedCount,
    jobApplicationCount: args.row._count.jobApplications,
    trainingCoursesIncomplete: Boolean(program) && !allCoursesComplete,
    nextIncompleteCourseName: nextIncompleteCourse?.name ?? null,
    allCoursesComplete,
  });

  const recommendedTool = recommendMemberTool(
    {
      enrolledProgram: assignedSlug,
      assessmentCompleted: args.row.assessmentCompleted,
      hasResume,
      hasCompletedInterviewPractice,
      // Every open row read, not just the card's four: an offer further down
      // is still an offer, and the placement strip above names it.
      openApplicationStatuses: args.row.jobApplications.map((job) => job.status),
      placed: Boolean(placement?.placedAt) && !placementSeparated,
      placementSeparated,
    },
    [doThisNext.href, ...upNext.map((action) => action.href)],
  );

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

  // One resolver for "who is your counselor": the assignment is accepted only
  // when the counselor is active and in this member's organisation, and the
  // same name feeds the approval card's owner line and the reviewer line.
  const counselor = args.row.organizationId
    ? resolveAssignedCounselor({
        organizationId: args.row.organizationId,
        counselorAssignments: args.row.counselorAssignments ?? [],
      })
    : null;

  return {
    firstName,
    coursePercent: pct,
    courseProgressStale,
    approvalStatus: buildMemberApprovalStatus({ ...args.row, counselorName: counselor?.name ?? null }),
    counselorContext: { counselor, waitEstimate: null, awaiting: awaitingStep(args.row) },
    organizationId: args.row.organizationId ?? null,
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
    pipeline: mapPipelineRows(args.row.jobApplications.slice(0, PIPELINE_ROW_LIMIT)),
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
    upNext,
    recommendedTool,
    ungatedDigitalBasicsHref: digitalLiteracyFirstModuleHref(),
    jobOffers: args.row.jobApplications
      .filter((job) => job.status === 'OFFER')
      .map((job) => ({ id: job.id, role: job.role, company: job.company })),
    first90: buildFirst90Card(placement, args.row.memberEvents ?? []),
    youthNoticeAge: youthNoticeAgeFromDob(args.row.profile?.dob),
    dashboardViewFacts: dashboardViewFacts({
      applicationExists: (args.row.applications?.length ?? 0) > 0,
      assignedProgramSlug: assignedSlug,
      assessmentCompleted: args.row.assessmentCompleted,
      completedCount,
      programTitle: program?.title,
    }),
    onboarding: buildDashboardOnboarding(args.row),
    programSwitch: home.programSwitch,
    prismaOpCount: args.prismaOpCount,
  };
}

/** Unread counselor messages counted per thread; beyond this the row reads "you have unread messages" either way. */
const UNREAD_MESSAGE_TAKE = 50;

/**
 * The one nested read. `satisfies Prisma.UserSelect` has the compiler check
 * every relation and column here against the schema: `DashboardHomeTx` types
 * the call loosely for the test double, so nothing else would.
 */
function userSelect(userId: string) {
  return {
    fullName: true,
    phone: true,
    organizationId: true,
    // First-login wizard / tour gate and the wizard's program fallback
    // (the legacy home's separate intake read, folded in here).
    onboardingCompletedAt: true,
    onboardingCurrentStep: true,
    tourCompletedAt: true,
    programInterest: true,
    profile: {
      select: {
        profilePhone: true,
        profileAddress: true,
        city: true,
        state: true,
        zip: true,
        referralSource: true,
        resumeOriginalPath: true,
        resumeEnhancedPath: true,
        dob: true,
      },
    },
    // Same definition as `getMemberEngagementSignals`: messages in the
    // member's thread written by anyone else, after `memberLastReadAt`. The
    // read-time comparison is done in memory (a nested `_count` cannot
    // reference a sibling column), so this stays one Prisma operation.
    messageThreadsAsMember: {
      take: 1,
      select: {
        memberLastReadAt: true,
        messages: {
          where: { authorId: { not: userId } },
          orderBy: { createdAt: 'desc' as const },
          take: UNREAD_MESSAGE_TAKE,
          select: { createdAt: true },
        },
      },
    },
    // First 90 Days check-ins (one per stage, newest first) for the post-placement
    // card. Interview practice, which used to hold this relation, is a filtered
    // `_count` below: a relation can be selected only once per read.
    memberEvents: {
      where: { eventName: FIRST90_CHECK_IN_EVENT },
      orderBy: { createdAt: 'desc' as const },
      take: FIRST90_EVENT_TAKE,
      select: { entityId: true, metadata: true, createdAt: true },
    },
    placementRecord: {
      select: { placedAt: true, retentionDecision: true, retentionStatus: true, employerName: true },
    },
    applications: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { status: true, submittedAt: true, programInterest: true },
    },
    wioaReviewStatus: true,
    wioaReviewedAt: true,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: true,
    // WAP-91: names who owns the staff-side approval steps (same single query).
    // Shared with lib/member/counselorContext.ts so the card, the reviewer
    // line and the messaging thread agree on who the counselor is.
    counselorAssignments: counselorAssignmentSelect(),
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
    // Every enrollment, primary first (the order `getActiveProgramForDashboard`
    // reads), so `?program=` can pick a secondary one and the switch can list
    // them all without a second read.
    courseEnrollments: {
      orderBy: [{ isPrimary: 'desc' as const }, { enrolledAt: 'desc' as const }],
      take: COURSE_ENROLLMENT_TAKE,
      select: {
        id: true,
        programSlug: true,
        curriculumVersion: true,
        isPrimary: true,
        enrolledByAdminId: true,
        enrolledAt: true,
      },
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
      take: OPEN_APPLICATION_TAKE,
      select: { id: true, role: true, company: true, status: true, updatedAt: true },
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
        // Has the member ever finished an interview practice session.
        memberEvents: {
          where: { eventName: INTERVIEW_PRACTICE_COMPLETED_EVENT },
        },
      },
    },
  } satisfies Prisma.UserSelect;
}

async function fetchHomeRow(
  db: DashboardHomeDb,
  userId: string,
): Promise<{ row: DashboardUserRow | null; prismaOpCount: number }> {
  return db.$transaction(async (tx) => {
    const row = await tx.user.findUnique({
      where: { id: userId },
      select: userSelect(userId),
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
    requestedProgramSlug: args.requestedProgramSlug,
    prismaOpCount,
  });
}
