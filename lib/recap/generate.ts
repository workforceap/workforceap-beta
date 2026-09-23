import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { isExcludedPublicEmployerName, isExcludedPublicJobTitle } from '@/lib/jobs/publicJobFilters';
import { computeReadinessScore, getScoreBreakdowns } from '@/lib/readiness/score';
import { parseGoalDescription } from '@/lib/member/goalSteps';
import { buildNextBestActions, type NextBestActionsContext } from '@/lib/member/nextBestActions';

/**
 * A single celebrated win from the member's week. `value` is optional so the
 * UI can render an emphasized number alongside the human label when present.
 */
export type RecapWin = {
  /** Stable key for React lists + analytics. */
  key: string;
  /** Warm, human, past-tense label, e.g. "Completed 3 learning resources". */
  label: string;
  /** Optional emphasized count to render large in the UI. */
  value?: number;
  /** Material Symbols icon name for the win card. */
  icon: string;
};

/** Per-goal progress snapshot for the recap (active goals only, capped). */
export type RecapGoalProgress = {
  id: string;
  title: string;
  goalType: string;
  status: string;
  /** Steps completed / total, from the goal's embedded step plan. */
  stepsDone: number;
  stepsTotal: number;
  /** Metric-based progress (e.g. applications 2/5) when the goal defines one. */
  currentMetricValue: number | null;
  targetMetricValue: number | null;
  /** 0–100 best-effort completion percent (steps preferred, metric fallback). */
  percent: number | null;
  /** The next not-yet-done step text, if any — used to seed the plan. */
  nextStep: string | null;
};

/** One concrete, encouraging item in the "plan for next week" list. */
export type RecapPlanItem = {
  key: string;
  title: string;
  /** Short encouraging context line. */
  body: string;
  href: string;
  cta: string;
  /** Where this came from — drives icon + grouping in the UI. */
  source: 'goal' | 'action';
  icon: string;
};

const DONE_GOAL_STATUSES = new Set(['COMPLETED', 'COMPLETE', 'DONE']);

function isDoneStatus(status: string): boolean {
  return DONE_GOAL_STATUSES.has(status.trim().toUpperCase());
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

type GoalLike = {
  id: string;
  goalType: string;
  title: string;
  status: string;
  description: string | null;
  currentMetricValue: number | null;
  targetMetricValue: number | null;
};

/** Build per-goal progress from raw Goal rows (active + recently completed). */
function buildGoalProgress(goals: GoalLike[]): RecapGoalProgress[] {
  return goals
    .filter((g) => {
      const s = g.status.trim().toUpperCase();
      return s === 'ACTIVE' || s === 'COMPLETED';
    })
    .slice(0, 4)
    .map((g) => {
      const { steps } = parseGoalDescription(g.description);
      const stepsTotal = steps.length;
      const stepsDone = steps.filter((s) => s.done).length;
      const nextStep = steps.find((s) => !s.done)?.text ?? null;

      let percent: number | null = null;
      if (stepsTotal > 0) {
        percent = clampPercent((stepsDone / stepsTotal) * 100);
      } else if (g.targetMetricValue && g.targetMetricValue > 0) {
        percent = clampPercent(((g.currentMetricValue ?? 0) / g.targetMetricValue) * 100);
      }
      if (isDoneStatus(g.status)) percent = 100;

      return {
        id: g.id,
        title: g.title,
        goalType: g.goalType,
        status: g.status,
        stepsDone,
        stepsTotal,
        currentMetricValue: g.currentMetricValue,
        targetMetricValue: g.targetMetricValue,
        percent,
        nextStep,
      };
    });
}

type WinsInput = {
  applicationsAdded: number;
  resourcesCompleted: number;
  pathwayStepsCompleted: number;
  aiToolsUsed: number;
  pointsThisWeek: number;
  certsThisWeek: number;
  goalStepsCompletedThisWeek: number;
  goalsCompletedThisWeek: number;
};

/** Turn this-week activity into warm, celebratory, past-tense win lines. */
function buildWins(w: WinsInput): RecapWin[] {
  const wins: RecapWin[] = [];

  if (w.goalsCompletedThisWeek > 0) {
    wins.push({
      key: 'goals_completed',
      value: w.goalsCompletedThisWeek,
      label: w.goalsCompletedThisWeek === 1 ? 'Reached a goal you set for yourself' : `Reached ${w.goalsCompletedThisWeek} of your goals`,
      icon: 'emoji_events',
    });
  }
  if (w.certsThisWeek > 0) {
    wins.push({
      key: 'certs',
      value: w.certsThisWeek,
      label: w.certsThisWeek === 1 ? 'Earned a new certification' : `Earned ${w.certsThisWeek} new certifications`,
      icon: 'workspace_premium',
    });
  }
  if (w.resourcesCompleted > 0) {
    wins.push({
      key: 'resources',
      value: w.resourcesCompleted,
      label: w.resourcesCompleted === 1 ? 'Completed a learning resource' : `Completed ${w.resourcesCompleted} learning resources`,
      icon: 'menu_book',
    });
  }
  if (w.pathwayStepsCompleted > 0) {
    wins.push({
      key: 'pathway',
      value: w.pathwayStepsCompleted,
      label: w.pathwayStepsCompleted === 1 ? 'Advanced a step in your learning pathway' : `Advanced ${w.pathwayStepsCompleted} steps in your learning pathway`,
      icon: 'school',
    });
  }
  if (w.goalStepsCompletedThisWeek > 0) {
    wins.push({
      key: 'goal_steps',
      value: w.goalStepsCompletedThisWeek,
      label: w.goalStepsCompletedThisWeek === 1 ? 'Checked off a step toward a goal' : `Checked off ${w.goalStepsCompletedThisWeek} steps toward your goals`,
      icon: 'task_alt',
    });
  }
  if (w.applicationsAdded > 0) {
    wins.push({
      key: 'applications',
      value: w.applicationsAdded,
      label: w.applicationsAdded === 1 ? 'Logged a job application' : `Logged ${w.applicationsAdded} job applications`,
      icon: 'work',
    });
  }
  if (w.aiToolsUsed > 0) {
    wins.push({
      key: 'ai_tools',
      value: w.aiToolsUsed,
      label: w.aiToolsUsed === 1 ? 'Used an AI career tool' : `Put ${w.aiToolsUsed} AI career tools to work`,
      icon: 'auto_awesome',
    });
  }
  if (w.pointsThisWeek > 0) {
    wins.push({
      key: 'points',
      value: w.pointsThisWeek,
      label: `Earned ${w.pointsThisWeek} momentum point${w.pointsThisWeek === 1 ? '' : 's'}`,
      icon: 'bolt',
    });
  }

  return wins;
}

/** A warm one-line headline that honestly reflects the week. */
function buildHeadline(winCount: number, fullName: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0] ?? '';
  const name = first ? `${first}, ` : '';
  if (winCount === 0) {
    return `${name}every week is a fresh start — here's a simple plan to build momentum.`;
  }
  if (winCount === 1) {
    return `${name}you made real progress this week. Let's keep it going.`;
  }
  if (winCount <= 3) {
    return `${name}you showed up and got things done this week. Nice work.`;
  }
  return `${name}what a week — you made progress on several fronts. Keep this energy.`;
}

const GOAL_TYPE_TO_PLAN_HREF: Record<string, { href: string; cta: string; icon: string }> = {
  build_resume: { href: '/dashboard/ai-tools/resume-studio?view=rewrite', cta: 'Work on resume', icon: 'description' },
  practice_interviews: { href: '/dashboard/ai-tools/interview-practice', cta: 'Practice now', icon: 'record_voice_over' },
  apply_to_jobs: { href: '/dashboard/job-applications', cta: 'Open tracker', icon: 'work' },
  complete_certification: { href: '/dashboard/program', cta: 'Continue training', icon: 'school' },
  finish_pathway: { href: '/dashboard/resources', cta: 'Open pathway', icon: 'menu_book' },
  linkedin_profile: { href: '/dashboard/profile', cta: 'Update profile', icon: 'badge' },
  tech_readiness: { href: '/dashboard/program', cta: 'Open training', icon: 'school' },
  career_pivot: { href: '/dashboard/career-brief', cta: 'Open career brief', icon: 'insights' },
};

/**
 * Plan route for a goal's next step. A goal type with no dedicated tool opens
 * the goal itself: the goals section of the career plan page (WAP-188), where
 * the member can tick the step off.
 */
export function planRouteForGoalType(goalType: string): { href: string; cta: string; icon: string } {
  return GOAL_TYPE_TO_PLAN_HREF[goalType] ?? {
    href: '/dashboard/career-brief#goals',
    cta: 'View goal',
    icon: 'flag',
  };
}

/**
 * Build a concrete, encouraging 2–3 item plan for next week:
 * the next open step from each active goal first, then top recommended
 * actions to fill out the list.
 */
function buildNextWeekPlan(
  goalProgress: RecapGoalProgress[],
  nbaCtx: NextBestActionsContext,
): RecapPlanItem[] {
  const plan: RecapPlanItem[] = [];
  const seen = new Set<string>();

  // 1. Next open step from each active (not-yet-done) goal.
  for (const g of goalProgress) {
    if (isDoneStatus(g.status)) continue;
    if (!g.nextStep) continue;
    const route = planRouteForGoalType(g.goalType);
    const key = `goal:${g.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push({
      key,
      title: g.nextStep,
      body: `Next step toward "${g.title}".`,
      href: route.href,
      cta: route.cta,
      source: 'goal',
      icon: route.icon,
    });
    if (plan.length >= 3) return plan;
  }

  // 2. Fill remaining slots with prioritized next best actions.
  const actions = buildNextBestActions(nbaCtx);
  for (const a of actions) {
    const key = `action:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push({
      key,
      title: a.title,
      body: a.body,
      href: a.href,
      cta: a.cta,
      source: 'action',
      icon: 'arrow_forward',
    });
    if (plan.length >= 3) break;
  }

  return plan.slice(0, 3);
}

/**
 * Construct a conservative NextBestActionsContext from the data already
 * available to the recap generator. We intentionally keep this minimal and
 * read-only (no extra DB calls) — the goal-step plan leads, and these
 * recommended actions only fill remaining slots.
 */
function buildRecapNbaContext(input: {
  enrolledProgram: string | null;
  jobApplicationCount: number;
  hasResume: boolean;
  hasCompletedInterviewPractice: boolean;
}): NextBestActionsContext {
  const enrolled = input.enrolledProgram;
  return {
    // Treat recap recipients as active/training members; recipients are
    // selected by the cron precisely because they have program activity.
    state: enrolled ? 'D' : 'C',
    noApplicationOnFile: false,
    enrolledProgram: enrolled,
    assessmentCompleted: true,
    completedCourseCount: 1,
    hasResume: input.hasResume,
    hasCompletedInterviewPractice: input.hasCompletedInterviewPractice,
    profileCompletenessPct: 100,
    jobApplicationCount: input.jobApplicationCount,
    counselorUnreadCount: 0,
    weeklyRecapUnopened: false,
    courseEnrollmentActive: true,
  };
}

export function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function generateWeeklyRecap(userId: string, weekStart: Date, weekEnd?: Date) {
  const end = weekEnd ?? (() => {
    const e = new Date(weekStart);
    e.setDate(weekStart.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  })();

  const now = new Date();

  const userCtx = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      enrolledProgram: true,
      courseEnrollments: { select: { programSlug: true } },
    },
  });

  if (!userCtx) {
    console.error('[generateWeeklyRecap] user not found', userId);
    return null;
  }

  const programSlugs = [
    ...new Set(
      [
        ...userCtx.courseEnrollments.map((e) => e.programSlug),
        userCtx.enrolledProgram,
      ].filter((s): s is string => !!s?.trim()),
    ),
  ];
  const programOr: { suggestedPrograms: { equals: string[] } | { hasSome: string[] } }[] = [
    { suggestedPrograms: { equals: [] } },
  ];
  if (programSlugs.length > 0) {
    programOr.push({ suggestedPrograms: { hasSome: programSlugs } });
  }

  const [goals, jobApps, aiResults, resourceProgress, pathwayProgress, certs, upcomingSessions, newJobsRaw, memberPoints, pointsTxnsThisWeek] =
    await Promise.all([
      prisma.goal.findMany({ take: 100, where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.jobApplication.findMany({ take: 100, where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.aIToolResult.findMany({ take: 100, where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.resourceProgress.findMany({ take: 100, where: { userId } }),
      prisma.pathwayStepProgress.findMany({ take: 100, where: { userId } }),
      prisma.userCertification.findMany({ take: 100, where: { userId } }),
      prisma.mentorSession.findMany({
        where: {
          memberId: userId,
          scheduledAt: { gte: now },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: { scheduledAt: true, topic: true },
      }),
      prisma.job.findMany({
        take: 100,
        where: {
          status: 'live',
          organizationId: userCtx.organizationId,
          createdAt: { gte: weekStart, lte: end },
          OR: programOr,
        },
        select: {
          title: true,
          employer: { select: { companyName: true } },
        },
      }),
      prisma.memberPoints.findUnique({ where: { userId }, select: { totalPoints: true, level: true } }),
      prisma.pointsTransaction.aggregate({
        where: { userId, createdAt: { gte: weekStart, lte: end } },
        _sum: { points: true },
      }),
    ]);

  const newLiveJobsThisWeek = newJobsRaw.filter(
    (j) =>
      !isExcludedPublicEmployerName(j.employer.companyName) && !isExcludedPublicJobTitle(j.title),
  ).length;

  const upcomingCounselorSessions = upcomingSessions.map((s) => ({
    at: s.scheduledAt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    topic: s.topic,
  }));

  // Use direct counts from source tables (reliable; works even without event tracking)
  const applicationsAdded = jobApps.filter(
    (a) => a.status !== 'SAVED' && a.createdAt >= weekStart && a.createdAt <= end
  ).length;
  const resourcesCompleted = resourceProgress.filter(
    (r) => r.completedAt && r.completedAt >= weekStart && r.completedAt <= end
  ).length;
  const aiToolsUsedThisWeek = aiResults.filter(
    (r) => r.createdAt >= weekStart && r.createdAt <= end
  );
  const aiToolsUsed = new Set(aiToolsUsedThisWeek.map((r) => r.toolType)).size;
  const pathwayStepsCompleted = pathwayProgress.filter(
    (p) => p.status === 'completed' && p.completedAt && p.completedAt >= weekStart && p.completedAt <= end
  ).length;

  let score: number | null = null;
  try {
    score = await computeReadinessScore(userId);
  } catch (e) {
    console.error('[generateWeeklyRecap] readiness score failed', userId, e);
  }

  const recapData = {
    weekInReview: {
      applicationsAdded,
      resourcesCompleted,
      aiToolsUsed,
      pathwayStepsCompleted,
      newLiveJobsThisWeek,
    },
    upcomingCounselorSessions,
    readinessScoreSnapshot: score,
    goalsSnapshot: goals.slice(0, 3).map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      currentMetricValue: g.currentMetricValue,
      targetMetricValue: g.targetMetricValue,
    })),
    applicationsCount: jobApps.filter((a) => a.status !== 'SAVED').length,
    resourcesCompletedCount: resourceProgress.filter((r) => r.completedAt).length,
    pathwayProgressCount: pathwayProgress.filter((p) => p.status === 'completed').length,
    certificationsCount: certs.length,
    recommendedActions: [] as string[],
  };

  if (!aiResults.some((r) => r.toolType === 'resume_rewriter')) {
    recapData.recommendedActions.push('Build your resume with the Resume Rewriter');
  }
  if (!aiResults.some((r) => r.toolType === 'interview_practice')) {
    recapData.recommendedActions.push('Practice interview questions');
  }
  if (jobApps.filter((a) => a.status !== 'SAVED').length === 0) {
    recapData.recommendedActions.push('Log your first job application');
  }
  if (recapData.recommendedActions.length === 0) {
    recapData.recommendedActions.push('Keep momentum—add another application or complete a resource');
  }

  // --- Motivating enrichment (additive; existing fields above untouched) ---
  const pointsThisWeek = pointsTxnsThisWeek._sum.points ?? 0;
  const certsThisWeek = certs.filter(
    (c) => c.createdAt >= weekStart && c.createdAt <= end
  ).length;
  const goalsCompletedThisWeek = goals.filter(
    (g) => isDoneStatus(g.status) && g.completedAt && g.completedAt >= weekStart && g.completedAt <= end
  ).length;

  const goalProgress = buildGoalProgress(goals);

  const wins = buildWins({
    applicationsAdded,
    resourcesCompleted,
    pathwayStepsCompleted,
    aiToolsUsed,
    pointsThisWeek,
    certsThisWeek,
    goalStepsCompletedThisWeek: 0,
    goalsCompletedThisWeek,
  });

  const nbaCtx = buildRecapNbaContext({
    enrolledProgram: userCtx.enrolledProgram,
    jobApplicationCount: recapData.applicationsCount,
    hasResume: aiResults.some((r) => r.toolType === 'resume_rewriter'),
    hasCompletedInterviewPractice: aiResults.some((r) => r.toolType === 'interview_practice'),
  });
  const nextWeekPlan = buildNextWeekPlan(goalProgress, nbaCtx);

  Object.assign(recapData, {
    headline: buildHeadline(wins.length, null),
    wins,
    pointsThisWeek,
    pointsTotal: memberPoints?.totalPoints ?? 0,
    level: memberPoints?.level ?? 'starter',
    goalProgress,
    nextWeekPlan,
  });

  const recapRecord = await prisma.weeklyRecap.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate: weekStart } },
    create: {
      userId,
      weekStartDate: weekStart,
      weekEndDate: end,
      recapJson: recapData,
      readinessScoreSnapshot: score,
      goalsSnapshotJson: recapData.goalsSnapshot,
    },
    update: {
      recapJson: recapData,
      readinessScoreSnapshot: score,
      goalsSnapshotJson: recapData.goalsSnapshot,
      generatedAt: new Date(),
    },
  });

  await trackEvent({ userId, eventName: 'weekly_recap_generated', entityType: 'weekly_recap', entityId: recapRecord.id });
  return recapRecord;
}

export type MemberRecapInput = {
  id: string;
  email: string | null;
  fullName: string | null;
  enrolledProgram: string | null;
};

export type MemberRecapOutput = {
  userId: string;
  recapData: Record<string, unknown>;
  score: number | null;
};

type RecapJsonShape = {
  weekInReview: { applicationsAdded: number; resourcesCompleted: number; aiToolsUsed: number; pathwayStepsCompleted: number; newLiveJobsThisWeek: number };
  upcomingCounselorSessions: Array<{ at: string; topic: string | null }>;
  readinessScoreSnapshot: number | null;
  goalsSnapshot: Array<{ id: string; title: string; status: string; currentMetricValue: number | null; targetMetricValue: number | null }>;
  applicationsCount: number;
  resourcesCompletedCount: number;
  pathwayProgressCount: number;
  certificationsCount: number;
  recommendedActions: string[];
  headline?: string;
  wins?: RecapWin[];
  pointsThisWeek?: number;
  pointsTotal?: number;
  level?: string;
  goalProgress?: RecapGoalProgress[];
  nextWeekPlan?: RecapPlanItem[];
};

/**
 * Batch-generate weekly recaps for many members at once.
 * Eliminates the read-side N+1 by fetching all related data in ~10 queries total.
 * Write-side upserts are still per-member (Prisma lacks bulk upsert) but capped at N writes.
 */
export async function generateWeeklyRecaps(
  members: MemberRecapInput[],
  weekStart: Date,
  weekEnd?: Date
): Promise<MemberRecapOutput[]> {
  const end = weekEnd ?? (() => {
    const e = new Date(weekStart);
    e.setDate(weekStart.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  })();
  const now = new Date();
  const memberIds = members.map((m) => m.id);

  if (memberIds.length === 0) return [];

  // 1. Batch fetch user contexts + course enrollments
  const userCtxs = await prisma.user.findMany({
    take: 1000,
    where: { id: { in: memberIds } },
    select: {
      id: true,
      organizationId: true,
      enrolledProgram: true,
      courseEnrollments: { select: { programSlug: true } },
    },
  });
  const userCtxById = new Map(userCtxs.map((u) => [u.id, u]));

  // 2. Collect program slugs per user + org ids for job query
  const orgIds = [...new Set(userCtxs.map((u) => u.organizationId).filter(Boolean))];
  const programSlugsPerUser = new Map<string, string[]>();
  for (const u of userCtxs) {
    const slugs = [...new Set([...u.courseEnrollments.map((e) => e.programSlug), u.enrolledProgram].filter((s): s is string => !!s?.trim()))];
    programSlugsPerUser.set(u.id, slugs);
  }

  // Build a combined programOr for the job query
  const allProgramSlugs = [...new Set([...programSlugsPerUser.values()].flat())];
  const programOr: { suggestedPrograms: { equals: string[] } | { hasSome: string[] } }[] = [
    { suggestedPrograms: { equals: [] } },
  ];
  if (allProgramSlugs.length > 0) {
    programOr.push({ suggestedPrograms: { hasSome: allProgramSlugs } });
  }

  // 3. Batch fetch all related data
  const [goalsAll, jobAppsAll, aiResultsAll, resourceProgressAll, pathwayProgressAll, certsAll, upcomingSessionsAll, newJobsAll, scoreBreakdowns, memberPointsAll, pointsTxnsThisWeekAll] =
    await Promise.all([
      prisma.goal.findMany({ take: 1000, where: { userId: { in: memberIds } }, orderBy: { createdAt: 'desc' } }),
      prisma.jobApplication.findMany({ take: 1000, where: { userId: { in: memberIds } }, orderBy: { createdAt: 'desc' } }),
      prisma.aIToolResult.findMany({ take: 1000, where: { userId: { in: memberIds } }, orderBy: { createdAt: 'desc' } }),
      prisma.resourceProgress.findMany({ take: 1000, where: { userId: { in: memberIds } } }),
      prisma.pathwayStepProgress.findMany({ take: 1000, where: { userId: { in: memberIds } } }),
      prisma.userCertification.findMany({ take: 1000, where: { userId: { in: memberIds } } }),
      prisma.mentorSession.findMany({
        where: { memberId: { in: memberIds }, scheduledAt: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: { memberId: true, scheduledAt: true, topic: true },
      }),
      prisma.job.findMany({
        take: 100,
        where: { status: 'live', organizationId: { in: orgIds as string[] }, createdAt: { gte: weekStart, lte: end }, OR: programOr },
        select: { title: true, employer: { select: { companyName: true } }, organizationId: true, suggestedPrograms: true },
      }),
      getScoreBreakdowns(memberIds),
      prisma.memberPoints.findMany({
        where: { userId: { in: memberIds } },
        select: { userId: true, totalPoints: true, level: true },
      }),
      prisma.pointsTransaction.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds }, createdAt: { gte: weekStart, lte: end } },
        _sum: { points: true },
      }),
    ]);

  const memberPointsByUser = new Map(memberPointsAll.map((m) => [m.userId, m]));
  const pointsThisWeekByUser = new Map(pointsTxnsThisWeekAll.map((p) => [p.userId, p._sum.points ?? 0]));

  // 4. Group by userId
  const goalsByUser = groupBy(goalsAll, 'userId');
  const jobAppsByUser = groupBy(jobAppsAll, 'userId');
  const aiResultsByUser = groupBy(aiResultsAll, 'userId');
  const resourceProgressByUser = groupBy(resourceProgressAll, 'userId');
  const pathwayProgressByUser = groupBy(pathwayProgressAll, 'userId');
  const certsByUser = groupBy(certsAll, 'userId');
  const upcomingSessionsByUser = groupBy(upcomingSessionsAll, 'memberId');

  const results: MemberRecapOutput[] = [];

  for (const member of members) {
    const userCtx = userCtxById.get(member.id);
    if (!userCtx) continue;

    const programSlugs = programSlugsPerUser.get(member.id) ?? [];

    // Filter jobs to this user's org + program match
    const userJobs = newJobsAll.filter((j) => {
      if (j.organizationId !== userCtx.organizationId) return false;
      if (programSlugs.length === 0) return true;
      const jobSlugs = (j.suggestedPrograms as string[] | null) ?? [];
      if (jobSlugs.length === 0) return true;
      return programSlugs.some((s) => jobSlugs.includes(s));
    });

    const newLiveJobsThisWeek = userJobs.filter(
      (j) => !isExcludedPublicEmployerName(j.employer.companyName) && !isExcludedPublicJobTitle(j.title)
    ).length;

    const goals = goalsByUser.get(member.id) ?? [];
    const jobApps = jobAppsByUser.get(member.id) ?? [];
    const aiResults = aiResultsByUser.get(member.id) ?? [];
    const resourceProgress = resourceProgressByUser.get(member.id) ?? [];
    const pathwayProgress = pathwayProgressByUser.get(member.id) ?? [];
    const certs = certsByUser.get(member.id) ?? [];
    const upcomingSessions = (upcomingSessionsByUser.get(member.id) ?? []).map((s) => ({
      at: s.scheduledAt.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      }),
      topic: s.topic,
    }));

    const applicationsAdded = jobApps.filter(
      (a) => a.status !== 'SAVED' && a.createdAt >= weekStart && a.createdAt <= end
    ).length;
    const resourcesCompleted = resourceProgress.filter(
      (r) => r.completedAt && r.completedAt >= weekStart && r.completedAt <= end
    ).length;
    const aiToolsUsedThisWeek = aiResults.filter((r) => r.createdAt >= weekStart && r.createdAt <= end);
    const aiToolsUsed = new Set(aiToolsUsedThisWeek.map((r) => r.toolType)).size;
    const pathwayStepsCompleted = pathwayProgress.filter(
      (p) => p.status === 'completed' && p.completedAt && p.completedAt >= weekStart && p.completedAt <= end
    ).length;

    const score = scoreBreakdowns.has(member.id)
      ? Math.min(100, Object.values(scoreBreakdowns.get(member.id)!).reduce((sum, b) => sum + b.earned, 0))
      : null;

    const recapData = {
      weekInReview: { applicationsAdded, resourcesCompleted, aiToolsUsed, pathwayStepsCompleted, newLiveJobsThisWeek },
      upcomingCounselorSessions: upcomingSessions,
      readinessScoreSnapshot: score,
      goalsSnapshot: goals.slice(0, 3).map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        currentMetricValue: g.currentMetricValue,
        targetMetricValue: g.targetMetricValue,
      })),
      applicationsCount: jobApps.filter((a) => a.status !== 'SAVED').length,
      resourcesCompletedCount: resourceProgress.filter((r) => r.completedAt).length,
      pathwayProgressCount: pathwayProgress.filter((p) => p.status === 'completed').length,
      certificationsCount: certs.length,
      recommendedActions: [] as string[],
    };

    if (!aiResults.some((r) => r.toolType === 'resume_rewriter')) {
      recapData.recommendedActions.push('Build your resume with the Resume Rewriter');
    }
    if (!aiResults.some((r) => r.toolType === 'interview_practice')) {
      recapData.recommendedActions.push('Practice interview questions');
    }
    if (jobApps.filter((a) => a.status !== 'SAVED').length === 0) {
      recapData.recommendedActions.push('Log your first job application');
    }
    if (recapData.recommendedActions.length === 0) {
      recapData.recommendedActions.push('Keep momentum—add another application or complete a resource');
    }

    // --- Motivating enrichment (additive) ---
    const pointsThisWeek = pointsThisWeekByUser.get(member.id) ?? 0;
    const mp = memberPointsByUser.get(member.id);
    const certsThisWeek = certs.filter(
      (c) => c.createdAt >= weekStart && c.createdAt <= end
    ).length;
    const goalsCompletedThisWeek = goals.filter(
      (g) => isDoneStatus(g.status) && g.completedAt && g.completedAt >= weekStart && g.completedAt <= end
    ).length;

    const goalProgress = buildGoalProgress(goals);
    const wins = buildWins({
      applicationsAdded,
      resourcesCompleted,
      pathwayStepsCompleted,
      aiToolsUsed,
      pointsThisWeek,
      certsThisWeek,
      goalStepsCompletedThisWeek: 0,
      goalsCompletedThisWeek,
    });
    const nbaCtx = buildRecapNbaContext({
      enrolledProgram: userCtx.enrolledProgram,
      jobApplicationCount: recapData.applicationsCount,
      hasResume: aiResults.some((r) => r.toolType === 'resume_rewriter'),
      hasCompletedInterviewPractice: aiResults.some((r) => r.toolType === 'interview_practice'),
    });
    const nextWeekPlan = buildNextWeekPlan(goalProgress, nbaCtx);

    Object.assign(recapData, {
      headline: buildHeadline(wins.length, member.fullName),
      wins,
      pointsThisWeek,
      pointsTotal: mp?.totalPoints ?? 0,
      level: mp?.level ?? 'starter',
      goalProgress,
      nextWeekPlan,
    });

    results.push({ userId: member.id, recapData, score });
  }

  // 5. Bulk upsert weeklyRecap records (Prisma lacks native bulk upsert;
  //    we parallelize with a small concurrency cap to avoid connection pool exhaustion)
  const UPSERT_CONCURRENCY = 8;
  for (let i = 0; i < results.length; i += UPSERT_CONCURRENCY) {
    const chunk = results.slice(i, i + UPSERT_CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ userId, recapData, score }) => {
        try {
          const record = await prisma.weeklyRecap.upsert({
            where: { userId_weekStartDate: { userId, weekStartDate: weekStart } },
            create: {
              userId,
              weekStartDate: weekStart,
              weekEndDate: end,
              recapJson: recapData as RecapJsonShape,
              readinessScoreSnapshot: score,
              goalsSnapshotJson: recapData.goalsSnapshot as RecapJsonShape['goalsSnapshot'],
            },
            update: {
              recapJson: recapData as RecapJsonShape,
              readinessScoreSnapshot: score,
              goalsSnapshotJson: recapData.goalsSnapshot as RecapJsonShape['goalsSnapshot'],
              generatedAt: new Date(),
            },
          });
          await trackEvent({
            userId,
            eventName: 'weekly_recap_generated',
            entityType: 'weekly_recap',
            entityId: record.id,
          });
        } catch (e) {
          console.error('[generateWeeklyRecaps] upsert failed for', userId, e);
        }
      })
    );
  }

  return results;
}

function groupBy<T extends Record<string, unknown>>(arr: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = String(item[key]);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
