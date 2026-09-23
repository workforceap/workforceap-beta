import { prisma } from '@/lib/db/prisma';

/**
 * Setup tasks weighted lower; high-value outcomes weighted higher. The ten
 * weights sum to exactly 100, so the score IS the points earned — no cap.
 *
 * History: until 2026-09 the weights summed to 105 (20/5, 5/10/15/5, 15/15,
 * 10/5) and the score was `min(100, earned)`, so the ring said "/ 100" while
 * the recap said "of 105 points". Rescaled by largest-remainder rounding:
 * areas 25/35/30/15 → 24/33/29/14, then items inside each area, with the one
 * tie (Interview & Jobs 14.5/14.5) broken toward addApplications so its
 * 3 applications × 5 = 15 partial credit stays whole.
 */
const WEIGHTS = {
  completeProfile: 5,
  setGoals: 9,
  buildResume: 19,
  complete2Resources: 9,
  practiceInterview: 14,
  startPathway: 5,
  completePathwaySteps: 14,
  addApplications: 15,
  trackCertifications: 5,
  weeklyConsistency: 5,
};

/** Counts at which the partial-credit items reach full points (unchanged by the rescale). */
const FULL_AT = { resources: 2, pathwaySteps: 5, applications: 3 };

/** Proportional partial credit, rounded to whole points and capped at `max`. */
function partialCredit(count: number, fullAt: number, max: number): number {
  return Math.min(max, Math.round((count / fullAt) * max));
}

export const READINESS_SCORE_MAX = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);

export type ScoreBreakdown = {
  completeProfile: { earned: number; max: number; done: boolean };
  setGoals: { earned: number; max: number; done: boolean };
  buildResume: { earned: number; max: number; done: boolean };
  complete2Resources: { earned: number; max: number; done: boolean };
  practiceInterview: { earned: number; max: number; done: boolean };
  startPathway: { earned: number; max: number; done: boolean };
  completePathwaySteps: { earned: number; max: number; done: boolean };
  addApplications: { earned: number; max: number; done: boolean };
  trackCertifications: { earned: number; max: number; done: boolean };
  weeklyConsistency: { earned: number; max: number; done: boolean };
};

/** Narrow shapes — avoids coupling callers to full Prisma payloads. */
type ProfileSlice = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  profilePhone: string | null;
  profileLinkedin: string | null;
  profileBio: string | null;
  resumeOriginalPath: string | null;
  resumeEnhancedPath: string | null;
} | null | undefined;

type UserSlice = { profile: ProfileSlice } | null;

export function buildScoreBreakdownFromRelations(
  user: UserSlice,
  goals: unknown[],
  aiResults: { toolType: string; createdAt?: Date | null }[],
  resourceProgress: { completedAt: Date | null }[],
  learningProgress: unknown[],
  pathwaySteps: { status: string }[],
  jobApps: { status: string }[],
  certs: unknown[],
  hasInterviewPracticeCompletion: boolean,
  lastEvent: { createdAt: Date } | null
): ScoreBreakdown {
  const toolTypes = new Set(aiResults.map((r) => r.toolType));
  const prof = user?.profile;
  const profileSignals = [
    prof?.address,
    prof?.city,
    prof?.state,
    prof?.zip,
    prof?.profilePhone,
    prof?.profileLinkedin,
    prof?.profileBio,
  ].filter((value) => !!value).length;
  const hasResumeFile = !!prof?.resumeOriginalPath || !!prof?.resumeEnhancedPath;
  const hasProfile = profileSignals >= 2 || hasResumeFile;
  const hasGoals = goals.length > 0;
  const hasResume = hasResumeFile || ['resume_rewriter', 'resume_analysis'].some((tool) => toolTypes.has(tool));
  const resourcesCompleted = resourceProgress.filter((r) => r.completedAt).length;
  const hasInterview = hasInterviewPracticeCompletion
    || ['interview_coach', 'voice_interview_video'].some((tool) => toolTypes.has(tool));
  const hasPathway = learningProgress.length > 0;
  const pathwayStepsCompleted = pathwaySteps.filter((p) => p.status === 'completed').length;
  const appCount = jobApps.filter((a) => a.status !== 'SAVED').length;
  const hasCerts = certs.length > 0;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const lastAiActivity = aiResults.reduce((latest, row) => {
    if (!(row.createdAt instanceof Date)) return latest;
    if (!latest || row.createdAt > latest) return row.createdAt;
    return latest;
  }, null as Date | null);
  const latestActivity = [lastEvent?.createdAt ?? null, lastAiActivity]
    .filter((value): value is Date => !!value)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const hasRecentActivity = latestActivity ? latestActivity >= sevenDaysAgo : false;

  return {
    completeProfile: {
      earned: hasProfile ? WEIGHTS.completeProfile : 0,
      max: WEIGHTS.completeProfile,
      done: hasProfile,
    },
    setGoals: {
      earned: hasGoals ? WEIGHTS.setGoals : 0,
      max: WEIGHTS.setGoals,
      done: hasGoals,
    },
    buildResume: {
      earned: hasResume ? WEIGHTS.buildResume : 0,
      max: WEIGHTS.buildResume,
      done: hasResume,
    },
    complete2Resources: {
      earned: partialCredit(resourcesCompleted, FULL_AT.resources, WEIGHTS.complete2Resources),
      max: WEIGHTS.complete2Resources,
      done: resourcesCompleted >= 2,
    },
    practiceInterview: {
      earned: hasInterview ? WEIGHTS.practiceInterview : 0,
      max: WEIGHTS.practiceInterview,
      done: hasInterview,
    },
    startPathway: {
      earned: hasPathway ? WEIGHTS.startPathway : 0,
      max: WEIGHTS.startPathway,
      done: hasPathway,
    },
    completePathwaySteps: {
      earned: partialCredit(pathwayStepsCompleted, FULL_AT.pathwaySteps, WEIGHTS.completePathwaySteps),
      max: WEIGHTS.completePathwaySteps,
      done: pathwayStepsCompleted >= 3,
    },
    addApplications: {
      earned: partialCredit(appCount, FULL_AT.applications, WEIGHTS.addApplications),
      max: WEIGHTS.addApplications,
      done: appCount >= 3,
    },
    trackCertifications: {
      earned: hasCerts ? WEIGHTS.trackCertifications : 0,
      max: WEIGHTS.trackCertifications,
      done: hasCerts,
    },
    weeklyConsistency: {
      earned: hasRecentActivity ? WEIGHTS.weeklyConsistency : 0,
      max: WEIGHTS.weeklyConsistency,
      done: hasRecentActivity,
    },
  };
}

/** The readiness score: points earned across the ten items (weights sum to 100). */
export function sumReadinessPoints(breakdown: ScoreBreakdown): number {
  return Object.values(breakdown).reduce((sum, b) => sum + b.earned, 0);
}

export async function computeReadinessScore(userId: string): Promise<number> {
  const breakdown = await getScoreBreakdown(userId);
  return sumReadinessPoints(breakdown);
}

export async function getScoreBreakdown(userId: string): Promise<ScoreBreakdown> {
  const [user, goals, aiResults, resourceProgress, learningProgress, pathwaySteps, jobApps, certs, interviewPracticeCompletionEvent, lastEvent] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: {
            select: {
              address: true,
              city: true,
              state: true,
              zip: true,
              profilePhone: true,
              profileLinkedin: true,
              profileBio: true,
              resumeOriginalPath: true,
              resumeEnhancedPath: true,
            },
          },
        },
      }),
      prisma.goal.findMany({ take: 100, where: { userId } }),
      prisma.aIToolResult.findMany({ take: 100, where: { userId }, select: { toolType: true, createdAt: true } }),
      prisma.resourceProgress.findMany({ take: 100, where: { userId } }),
      prisma.learningProgress.findMany({ take: 100, where: { userId } }),
      prisma.pathwayStepProgress.findMany({ take: 100, where: { userId } }),
      prisma.jobApplication.findMany({ take: 100, where: { userId } }),
      prisma.userCertification.findMany({ take: 100, where: { userId } }),
      prisma.memberEvent.findFirst({
        where: { userId, eventName: 'career_os.interview_practice_completed' },
        select: { id: true },
      }),
      prisma.memberEvent.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);

  return buildScoreBreakdownFromRelations(
    user,
    goals,
    aiResults,
    resourceProgress,
    learningProgress,
    pathwaySteps,
    jobApps,
    certs,
    !!interviewPracticeCompletionEvent,
    lastEvent
  );
}

export type ScoreBreakdownSafeResult = {
  breakdown: ScoreBreakdown;
  loadFailed: boolean;
};

/**
 * Preserve the graceful zero-state fallback while carrying an explicit error
 * bit so a database outage cannot look like a genuinely new member.
 */
export async function getScoreBreakdownSafeResult(userId: string): Promise<ScoreBreakdownSafeResult> {
  try {
    return { breakdown: await getScoreBreakdown(userId), loadFailed: false };
  } catch (e) {
    console.error('[getScoreBreakdownSafe]', userId, e);
    return {
      breakdown: buildScoreBreakdownFromRelations(null, [], [], [], [], [], [], [], false, null),
      loadFailed: true,
    };
  }
}

/** Backwards-compatible breakdown-only helper for non-audited aggregate consumers. */
export async function getScoreBreakdownSafe(userId: string): Promise<ScoreBreakdown> {
  return (await getScoreBreakdownSafeResult(userId)).breakdown;
}

/** Batch version of getScoreBreakdown. Fetches all data in ~11 queries total. */
export async function getScoreBreakdowns(userIds: string[]): Promise<Map<string, ScoreBreakdown>> {
  if (userIds.length === 0) return new Map();

  const [users, goals, aiResults, resourceProgress, learningProgress, pathwaySteps, jobApps, certs, interviewEvents, lastEvents] =
    await Promise.all([
      prisma.user.findMany({
        take: 1000,
        where: { id: { in: userIds } },
        include: {
          profile: {
            select: {
              address: true,
              city: true,
              state: true,
              zip: true,
              profilePhone: true,
              profileLinkedin: true,
              profileBio: true,
              resumeOriginalPath: true,
              resumeEnhancedPath: true,
            },
          },
        },
      }),
      prisma.goal.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.aIToolResult.findMany({ take: 1000, where: { userId: { in: userIds } }, select: { userId: true, toolType: true, createdAt: true } }),
      prisma.resourceProgress.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.learningProgress.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.pathwayStepProgress.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.jobApplication.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.userCertification.findMany({ take: 1000, where: { userId: { in: userIds } } }),
      prisma.memberEvent.findMany({
        take: 1000,
        where: {
          userId: { in: userIds },
          eventName: 'career_os.interview_practice_completed',
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: { userId: true, id: true },
      }),
      prisma.memberEvent.findMany({
        take: 1000,
        where: {
          userId: { in: userIds },
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, createdAt: true },
      }),
    ]);

  const goalsByUser = groupBy(goals, 'userId');
  const aiByUser = groupBy(aiResults, 'userId');
  const resourceByUser = groupBy(resourceProgress, 'userId');
  const learningByUser = groupBy(learningProgress, 'userId');
  const pathwayByUser = groupBy(pathwaySteps, 'userId');
  const appsByUser = groupBy(jobApps, 'userId');
  const certsByUser = groupBy(certs, 'userId');
  const interviewByUser = new Set(interviewEvents.map((e) => e.userId));

  // lastEvents is sorted desc globally, so first per user is the latest
  const lastEventByUser = new Map<string, { createdAt: Date }>();
  for (const e of lastEvents) {
    if (!lastEventByUser.has(e.userId)) {
      lastEventByUser.set(e.userId, e);
    }
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const result = new Map<string, ScoreBreakdown>();

  for (const userId of userIds) {
    const user = userById.get(userId) ?? null;
    result.set(
      userId,
      buildScoreBreakdownFromRelations(
        user,
        goalsByUser.get(userId) ?? [],
        aiByUser.get(userId) ?? [],
        resourceByUser.get(userId) ?? [],
        learningByUser.get(userId) ?? [],
        pathwayByUser.get(userId) ?? [],
        appsByUser.get(userId) ?? [],
        certsByUser.get(userId) ?? [],
        interviewByUser.has(userId),
        lastEventByUser.get(userId) ?? null
      )
    );
  }

  return result;
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
