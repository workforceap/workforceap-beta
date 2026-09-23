/**
 * One AI Career Tools pick for the member home, chosen from where the member
 * is in the journey. Pure function — no DB, no Redis.
 *
 * Every tool stays reachable from the rail and the `/dashboard/ai-tools` hub;
 * this only decides which single tool the home names as the one that helps
 * *now*. Candidates are listed most-specific first (an offer beats an
 * interview beats generic prep), and the first one the home is not already
 * showing wins, so the card never repeats the hero or an "Up next" row.
 */

export type MemberToolRecommendation = {
  /** Tool slug under `/dashboard/ai-tools/` (matches `MEMBER_TOOL_LABELS`). */
  slug: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

export type MemberToolStageFacts = {
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  hasResume: boolean;
  hasCompletedInterviewPractice: boolean;
  /** Statuses of the member's open job applications (SAVED, APPLIED, PHONE_SCREEN, INTERVIEWING, OFFER). */
  openApplicationStatuses: string[];
  placed: boolean;
  placementSeparated: boolean;
};

const TOOLS = {
  salaryNegotiation: {
    slug: 'salary-negotiation',
    title: 'Prepare for your offer conversation',
    body: 'You have an offer in your tracker. Practice how to ask about pay, schedule and benefits before you accept.',
    href: '/dashboard/ai-tools/salary-negotiation',
    cta: 'Open salary negotiation',
  },
  interviewPrep: {
    slug: 'interview-prep',
    title: 'Get ready for your interview',
    body: 'You have an interview or screening in your tracker. Pull your resume, pitch and practice answers into one page to review before it.',
    href: '/dashboard/ai-tools/interview-prep',
    cta: 'Open interview prep',
  },
  jobMatchAfterSeparation: {
    slug: 'job-match-scorer',
    title: 'Check your fit for new openings',
    body: 'Paste a job posting to see how your training and certifications line up with it.',
    href: '/dashboard/ai-tools/job-match-scorer',
    cta: 'Open job match scorer',
  },
  benefitsCliff: {
    slug: 'benefits-cliff',
    title: 'See how a new job affects your benefits',
    body: 'Before you pick a program, check how a higher paycheck could change SNAP, Medicaid or TANF.',
    href: '/dashboard/ai-tools/benefits-cliff',
    cta: 'Open benefits cliff',
  },
  resumeStudio: {
    slug: 'resume-studio',
    title: 'Start your resume',
    body: 'Paste or upload what you have. The resume studio rewrites it around the program you are training for.',
    href: '/dashboard/ai-tools/resume-studio?view=rewrite',
    cta: 'Open resume studio',
  },
  interviewPractice: {
    slug: 'interview-practice',
    title: 'Practice a mock interview',
    body: 'Answer common interview questions and get feedback on each answer.',
    href: '/dashboard/ai-tools/interview-practice?prefill=true',
    cta: 'Open interview practice',
  },
  jobMatch: {
    slug: 'job-match-scorer',
    title: 'Score a job posting against your resume',
    body: 'Paste a posting you are thinking about and see which skills match and which to build.',
    href: '/dashboard/ai-tools/job-match-scorer',
    cta: 'Open job match scorer',
  },
} satisfies Record<string, MemberToolRecommendation>;

function candidatesFor(facts: MemberToolStageFacts): MemberToolRecommendation[] {
  if (facts.placementSeparated) return [TOOLS.jobMatchAfterSeparation, TOOLS.interviewPrep];
  // Placed and still working: the job is the point, not another tool.
  if (facts.placed) return [];

  const out: MemberToolRecommendation[] = [];
  const statuses = new Set(facts.openApplicationStatuses);
  if (statuses.has('OFFER')) out.push(TOOLS.salaryNegotiation);
  if (statuses.has('INTERVIEWING') || statuses.has('PHONE_SCREEN')) out.push(TOOLS.interviewPrep);

  if (!facts.enrolledProgram) {
    out.push(TOOLS.benefitsCliff);
    return out;
  }
  if (!facts.hasResume) out.push(TOOLS.resumeStudio);
  if (facts.assessmentCompleted && !facts.hasCompletedInterviewPractice) out.push(TOOLS.interviewPractice);
  if (facts.hasResume) out.push(TOOLS.jobMatch);
  return out;
}

/** `/a/b?x=1#y` → `/a/b`, so a tool is "already shown" whatever its query string. */
function hrefPath(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

export function recommendMemberTool(
  facts: MemberToolStageFacts,
  /** Hrefs the home already shows (hero + "Up next"); matched by path. */
  alreadyShownHrefs: string[] = [],
): MemberToolRecommendation | null {
  const shown = new Set(alreadyShownHrefs.map(hrefPath));
  return candidatesFor(facts).find((tool) => !shown.has(hrefPath(tool.href))) ?? null;
}
