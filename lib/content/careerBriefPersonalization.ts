import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildScoreBreakdownFromRelations, type ScoreBreakdown } from '@/lib/readiness/score';

const memberCareerBriefInclude = {
  profile: true,
  applications: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  jobApplications: true,
  aiToolResults: { select: { toolType: true } },
} satisfies Prisma.UserInclude;

export type MemberCareerBriefUser = Prisma.UserGetPayload<{ include: typeof memberCareerBriefInclude }>;

export type CareerSearchEngine = {
  label: string;
  href: string;
  note: string;
};

export type CareerSearchPreset = {
  label: string;
  href: string;
};

export type CareerBriefContext = {
  location: string | null;
  programInterest: string | null;
  programShortLabel: string | null;
  applicationsCount: number;
  toolsUsed: string[];
  recommendedActions: Array<{ label: string; href: string }>;
  jobSearchUrl: string | null;
  jobSearchEngines: CareerSearchEngine[];
  bestBoardsForProgram: string[];
  suburbPresets: CareerSearchPreset[];
};

/** Map program interest to a short label for display */
function getProgramShortLabel(programInterest: string | null): string | null {
  if (!programInterest) return null;
  if (
    programInterest.includes('IT Support') ||
    programInterest.includes('CompTIA') ||
    programInterest.includes('Cybersecurity') ||
    programInterest.includes('AWS') ||
    programInterest.includes('IBM')
  ) {
    return 'IT & Tech';
  }
  if (programInterest.includes('Medical') || programInterest.includes('Health')) {
    return 'Healthcare';
  }
  if (
    programInterest.includes('Construction') ||
    programInterest.includes('Logistics') ||
    programInterest.includes('CPT') ||
    programInterest.includes('CLT')
  ) {
    return 'Trades & Logistics';
  }
  if (
    programInterest.includes('Data') ||
    programInterest.includes('UX') ||
    programInterest.includes('Digital Marketing') ||
    programInterest.includes('Project Management')
  ) {
    return 'Data & Design';
  }
  return programInterest.length > 30 ? programInterest.slice(0, 30) + '…' : programInterest;
}

function getProgramBoardPriority(programShortLabel: string | null): string[] {
  switch (programShortLabel) {
    case 'IT & Tech':
    case 'Data & Design':
      return ['LinkedIn', 'Indeed', 'Glassdoor', 'ZipRecruiter', 'WorkInTexas / AustinJobs'];
    case 'Healthcare':
      return ['Indeed', 'LinkedIn', 'ZipRecruiter', 'Glassdoor', 'WorkInTexas / AustinJobs'];
    case 'Trades & Logistics':
      return ['Indeed', 'ZipRecruiter', 'WorkInTexas / AustinJobs', 'LinkedIn', 'Glassdoor'];
    default:
      return ['Indeed', 'LinkedIn', 'Glassdoor', 'ZipRecruiter', 'WorkInTexas / AustinJobs'];
  }
}

function buildCareerSearchEngines(programShortLabel: string | null, city: string | null, state: string | null): CareerSearchEngine[] {
  const loc = [city, state].filter(Boolean).join(', ').trim() || 'Austin, TX';
  const query = (programShortLabel?.replace(/&/g, ' ') ?? 'jobs').trim();
  const queryPlusLocation = `${query} ${loc}`.trim();

  const engines: CareerSearchEngine[] = [
    {
      label: 'Indeed',
      href: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: loc }).toString()}`,
      note: 'Largest Austin-area job search coverage across industries.',
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location: loc }).toString()}`,
      note: 'Strong for tech, professional, and corporate roles.',
    },
    {
      label: 'Glassdoor',
      href: `https://www.google.com/search?${new URLSearchParams({ q: `site:glassdoor.com/Job ${queryPlusLocation}` }).toString()}`,
      note: 'Useful when members want salary data and company reviews too.',
    },
    {
      label: 'ZipRecruiter',
      href: `https://www.ziprecruiter.com/jobs-search?${new URLSearchParams({ search: query, location: loc }).toString()}`,
      note: 'Broad search with solid Austin + suburb coverage.',
    },
    {
      label: 'WorkInTexas / AustinJobs',
      href: 'https://www.workintexas.com/vosnet/Default.aspx',
      note: 'Texas workforce portal for statewide, public-sector, and local openings.',
    },
  ];

  const order = getProgramBoardPriority(programShortLabel);
  return engines.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

function buildSuburbPresets(programShortLabel: string | null): CareerSearchPreset[] {
  const query = (programShortLabel?.replace(/&/g, ' ') ?? 'jobs').trim();
  const suburbs = ['Austin, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Pflugerville, TX'];
  return suburbs.map((location) => ({
    label: location.replace(', TX', ''),
    href: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: location }).toString()}`,
  }));
}

export async function fetchCareerBriefRelations(userId: string, options?: { activeMemberOnly?: boolean }) {
  const where = options?.activeMemberOnly ? { id: userId, deletedAt: null } : { id: userId };

  const [user, goals, resourceProgress, learningProgress, pathwaySteps, certs, interviewPracticeCompletion, lastEvent] = await prisma.$transaction(async (tx) =>
    Promise.all([
      tx.user.findUnique({
        where,
        include: memberCareerBriefInclude,
      }),
      tx.goal.findMany({ take: 100, where: { userId } }),
      tx.resourceProgress.findMany({ take: 100, where: { userId } }),
      tx.learningProgress.findMany({ take: 100, where: { userId } }),
      tx.pathwayStepProgress.findMany({ take: 100, where: { userId } }),
      tx.userCertification.findMany({ take: 100, where: { userId } }),
      tx.memberEvent.findFirst({
        where: { userId, eventName: 'career_os.interview_practice_completed' },
        select: { id: true },
      }),
      tx.memberEvent.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ])
  );

  const aiResults = user?.aiToolResults ?? [];
  const jobApps = user?.jobApplications ?? [];

  return {
    user,
    goals,
    aiResults,
    resourceProgress,
    learningProgress,
    pathwaySteps,
    jobApps,
    certs,
    hasInterviewPracticeCompletion: !!interviewPracticeCompletion,
    lastEvent,
  };
}

export function assembleCareerBriefContext(
  dbUser: MemberCareerBriefUser | null,
  scoreBreakdown: ScoreBreakdown
): CareerBriefContext {
  const profile = dbUser?.profile;
  const application = dbUser?.applications?.[0];
  const programInterest = application?.programInterest ?? null;
  const programShortLabel = getProgramShortLabel(programInterest);
  const city = profile?.city?.trim() || null;
  const state = profile?.state?.trim() || null;
  const location = [city, state].filter(Boolean).join(', ') || null;

  const applicationsCount = dbUser?.jobApplications?.filter((a) => a.status !== 'SAVED').length ?? 0;
  const toolsUsed = [...new Set((dbUser?.aiToolResults ?? []).map((r) => r.toolType))];

  const recommendedActions: Array<{ label: string; href: string }> = [];

  if (!scoreBreakdown.buildResume.done) {
    recommendedActions.push({ label: 'Build your resume', href: '/dashboard/ai-tools/resume-studio?view=rewrite' });
  }
  if (!scoreBreakdown.practiceInterview.done) {
    recommendedActions.push({ label: 'Practice interview questions', href: '/dashboard/ai-tools/interview-practice' });
  }
  if (applicationsCount === 0) {
    recommendedActions.push({ label: 'Log your first application', href: '/dashboard/job-applications' });
  }
  if (!scoreBreakdown.complete2Resources.done) {
    recommendedActions.push({ label: 'Complete 2 resources', href: '/dashboard/career-library' });
  }
  if (!scoreBreakdown.setGoals.done) {
    // Goals live on the career plan page (WAP-188), not the home dashboard.
    recommendedActions.push({ label: 'Set your goals', href: '/dashboard/career-brief#goals' });
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push({ label: 'Add another application', href: '/dashboard/job-applications' });
  }

  const jobSearchEngines = buildCareerSearchEngines(programShortLabel, city, state);
  const jobSearchUrl = jobSearchEngines[0]?.href ?? null;
  const bestBoardsForProgram = getProgramBoardPriority(programShortLabel).slice(0, 3);
  const suburbPresets = buildSuburbPresets(programShortLabel);

  return {
    location,
    programInterest,
    programShortLabel,
    applicationsCount,
    toolsUsed,
    recommendedActions: recommendedActions.slice(0, 3),
    jobSearchUrl,
    jobSearchEngines,
    bestBoardsForProgram,
    suburbPresets,
  };
}

/** One merged DB round-trip for readiness breakdown + career brief (used by dashboard). */
export async function loadMemberCareerBriefBundle(userId: string, options?: { activeMemberOnly?: boolean }) {
  const rows = await fetchCareerBriefRelations(userId, options);
  const scoreBreakdown = buildScoreBreakdownFromRelations(
    rows.user,
    rows.goals,
    rows.aiResults,
    rows.resourceProgress,
    rows.learningProgress,
    rows.pathwaySteps,
    rows.jobApps,
    rows.certs,
    rows.hasInterviewPracticeCompletion,
    rows.lastEvent
  );
  const careerBrief = assembleCareerBriefContext(rows.user, scoreBreakdown);
  return { user: rows.user, careerBrief };
}

const emptyScoreBreakdown = (): ScoreBreakdown =>
  buildScoreBreakdownFromRelations(null, [], [], [], [], [], [], [], false, null);

/**
 * Same as loadMemberCareerBriefBundle but survives transient DB errors: retries with a single
 * user query + empty satellite rows so the dashboard still renders.
 */
export async function loadMemberCareerBriefBundleSafe(
  userId: string,
  options?: { activeMemberOnly?: boolean }
): Promise<{ user: MemberCareerBriefUser | null; careerBrief: CareerBriefContext }> {
  try {
    return await loadMemberCareerBriefBundle(userId, options);
  } catch (firstErr) {
    console.error('[loadMemberCareerBriefBundleSafe] primary load failed', firstErr);
    try {
      const where = options?.activeMemberOnly ? { id: userId, deletedAt: null } : { id: userId };
      const user = await prisma.$transaction((tx) =>
        tx.user.findUnique({
          where,
          include: memberCareerBriefInclude,
        })
      );
      if (!user) {
        return { user: null, careerBrief: assembleCareerBriefContext(null, emptyScoreBreakdown()) };
      }
      const scoreBreakdown = buildScoreBreakdownFromRelations(
        user,
        [],
        user.aiToolResults ?? [],
        [],
        [],
        [],
        user.jobApplications ?? [],
        [],
        false,
        null
      );
      return { user, careerBrief: assembleCareerBriefContext(user, scoreBreakdown) };
    } catch (secondErr) {
      console.error('[loadMemberCareerBriefBundleSafe] include-based fallback failed', secondErr);
      try {
        const user = await prisma.$transaction((tx) =>
          tx.user.findUnique({
            where: options?.activeMemberOnly ? { id: userId, deletedAt: null } : { id: userId },
            select: {
              id: true,
              fullName: true,
              email: true,
              enrolledProgram: true,
              enrolledAt: true,
              assessmentCompleted: true,
              assessmentCompletedAt: true,
              assessmentScorePct: true,
              profile: true,
              applications: { orderBy: { createdAt: 'desc' }, take: 1 },
              jobApplications: true,
              aiToolResults: { select: { toolType: true } },
            },
          })
        );
        if (!user) {
          return { user: null, careerBrief: assembleCareerBriefContext(null, emptyScoreBreakdown()) };
        }
        const scoreBreakdown = buildScoreBreakdownFromRelations(
          user,
          [],
          user.aiToolResults ?? [],
          [],
          [],
          [],
          user.jobApplications ?? [],
          [],
          false,
          null
        );
        return {
          user: user as unknown as MemberCareerBriefUser,
          careerBrief: assembleCareerBriefContext(user as unknown as MemberCareerBriefUser, scoreBreakdown),
        };
      } catch (thirdErr) {
        console.error('[loadMemberCareerBriefBundleSafe] minimal select failed', thirdErr);
        throw firstErr;
      }
    }
  }
}

export async function getCareerBriefContext(userId: string): Promise<CareerBriefContext> {
  try {
    const { careerBrief } = await loadMemberCareerBriefBundleSafe(userId);
    return careerBrief;
  } catch (e) {
    console.error('[getCareerBriefContext]', e);
    return assembleCareerBriefContext(null, emptyScoreBreakdown());
  }
}
