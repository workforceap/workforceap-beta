/**
 * Direction-C member safety-net registry.
 *
 * One slug per inventory core view. Numbers come from `devMemberFixtures` so
 * later batches keep Home / Jobs / Program / AI Tools aligned. This module is
 * client-safe (no server-only imports) so the shell, pages, and tests share it.
 */

export const DEV_MEMBER_STATES = ['full', 'empty', 'loading', 'error', 'first-time'] as const;
export type DevMemberState = (typeof DEV_MEMBER_STATES)[number];

export type DevMemberViewKind = 'c-kit' | 'tool-kit' | 'current-ui';

export type DevMemberView = {
  slug: string;
  title: string;
  kicker: string;
  lede: string;
  livePath: string;
  kind: DevMemberViewKind;
};

export const DEV_MEMBER_VIEWS: readonly DevMemberView[] = [
  { slug: 'home', title: 'Home', kicker: 'Today', lede: 'Your next module, applications, and advisor check-in.', livePath: '/dashboard', kind: 'c-kit' },
  { slug: 'jobs', title: 'Jobs', kicker: 'Job search', lede: 'Tracked applications and open roles that match your path.', livePath: '/dashboard/jobs', kind: 'c-kit' },
  { slug: 'program', title: 'My program', kicker: 'Program', lede: 'Modules, live session, and the next lesson on your path.', livePath: '/dashboard/program', kind: 'c-kit' },
  { slug: 'resume-studio', title: 'Resume studio', kicker: 'AI Career Tools', lede: 'Score, rewrite, and coach the resume on file.', livePath: '/dashboard/ai-tools/resume-studio', kind: 'c-kit' },
  { slug: 'ai-tools', title: 'AI Career Tools', kicker: 'Toolkit', lede: 'Drafts, weekly plan, and the tools that feed your applications.', livePath: '/dashboard/ai-tools', kind: 'c-kit' },
  { slug: 'interview-practice', title: 'Interview practice', kicker: 'AI Career Tools', lede: 'Role-specific questions with STAR answer frames.', livePath: '/dashboard/ai-tools/interview-practice', kind: 'tool-kit' },
  { slug: 'cover-letter', title: 'Cover letter', kicker: 'AI Career Tools', lede: 'Write a letter for a posting.', livePath: '/dashboard/ai-tools/cover-letter', kind: 'tool-kit' },
  { slug: 'job-match-scorer', title: 'Job match scorer', kicker: 'AI Career Tools', lede: 'See how a posting lines up with the resume on file.', livePath: '/dashboard/ai-tools/job-match-scorer', kind: 'tool-kit' },
  { slug: 'interview-coach', title: 'Interview coach', kicker: 'AI Career Tools', lede: 'Practice answers and get feedback on this session.', livePath: '/dashboard/ai-tools/interview-coach', kind: 'tool-kit' },
  { slug: 'elevator-pitch', title: 'Elevator pitch', kicker: 'AI Career Tools', lede: 'A 90-second intro for a named employer.', livePath: '/dashboard/ai-tools/elevator-pitch', kind: 'tool-kit' },
  { slug: 'gap-analyzer', title: 'Gap analyzer', kicker: 'AI Career Tools', lede: 'Skills the posting names that the resume still needs.', livePath: '/dashboard/ai-tools/gap-analyzer', kind: 'tool-kit' },
  { slug: 'linkedin-headline', title: 'LinkedIn headline', kicker: 'AI Career Tools', lede: 'A headline that names the role you want.', livePath: '/dashboard/ai-tools/linkedin-headline', kind: 'tool-kit' },
  { slug: 'linkedin-about', title: 'LinkedIn about', kicker: 'AI Career Tools', lede: 'An About section that matches the target role.', livePath: '/dashboard/ai-tools/linkedin-about', kind: 'tool-kit' },
  { slug: 'salary-negotiation', title: 'Salary negotiation', kicker: 'AI Career Tools', lede: 'Talking points for a named offer range.', livePath: '/dashboard/ai-tools/salary-negotiation', kind: 'tool-kit' },
  { slug: 'interview-prep', title: 'Interview prep', kicker: 'AI Career Tools', lede: 'A prep sheet for the next screen.', livePath: '/dashboard/ai-tools/interview-prep', kind: 'tool-kit' },
  { slug: 'career-business-coach', title: 'Career business coach', kicker: 'AI Career Tools', lede: 'A plan for the next conversation with your advisor.', livePath: '/dashboard/ai-tools/career-business-coach', kind: 'tool-kit' },
  { slug: 'benefits-cliff', title: 'Benefits cliff', kicker: 'AI Career Tools', lede: 'How a wage change can affect benefits you already have.', livePath: '/dashboard/ai-tools/benefits-cliff', kind: 'tool-kit' },
  { slug: 'voice-interview', title: 'Voice interview', kicker: 'AI Career Tools', lede: 'A spoken practice session for the next screen.', livePath: '/dashboard/ai-tools/voice-interview', kind: 'current-ui' },
  { slug: 'job-detail', title: 'Cloud Support Associate', kicker: 'Job search', lede: 'Brightline Credit Union · Austin, TX · Hybrid.', livePath: '/dashboard/jobs/[id]', kind: 'current-ui' },
  { slug: 'job-applications', title: 'Applications', kicker: 'Job search', lede: 'Every filing on this path, by stage.', livePath: '/dashboard/job-applications', kind: 'current-ui' },
  { slug: 'resume', title: 'Resume', kicker: 'Documents', lede: 'The resume on file for applications and AI tools.', livePath: '/dashboard/resume', kind: 'current-ui' },
  { slug: 'readiness', title: 'Readiness', kicker: 'Progress', lede: 'Scores and milestones on the job-readiness plan.', livePath: '/dashboard/readiness', kind: 'tool-kit' },
  { slug: 'ai-history', title: 'AI history', kicker: 'AI Career Tools', lede: 'Drafts and scored runs saved from this workspace.', livePath: '/dashboard/ai-tools/history', kind: 'current-ui' },
  { slug: 'skill-mapper', title: 'Skill mapper', kicker: 'AI Career Tools', lede: 'Skills on file mapped to the target role.', livePath: '/dashboard/ai-tools/skill-mapper', kind: 'current-ui' },
  { slug: 'coach', title: 'AI career coach', kicker: 'Coach', lede: 'A chat that remembers the last topic and next step.', livePath: '/coach', kind: 'current-ui' },
  { slug: 'messages', title: 'Messages', kicker: 'Inbox', lede: 'Threads with your counselor and the WorkforceAP team.', livePath: '/dashboard/messages', kind: 'tool-kit' },
  { slug: 'counselor', title: 'Counselor', kicker: 'People', lede: 'Your assigned advisor and how to reach them.', livePath: '/dashboard/counselor', kind: 'current-ui' },
  { slug: 'learning', title: 'Learning hub', kicker: 'Learning', lede: 'Pathways, modules, and labs on the enrolled program.', livePath: '/dashboard/learning', kind: 'current-ui' },
  { slug: 'learning-module', title: 'Shared Responsibility Model', kicker: 'Learning', lede: 'Module 8 of the AWS Cloud Practitioner path.', livePath: '/dashboard/learning/modules/[courseSlug]', kind: 'current-ui' },
  { slug: 'certifications', title: 'Certificates', kicker: 'Credentials', lede: 'Verified credentials and what is still in progress.', livePath: '/dashboard/certifications', kind: 'tool-kit' },
  { slug: 'missions', title: 'Missions', kicker: 'Practice', lede: 'Short skill checks tied to the enrolled program.', livePath: '/dashboard/missions', kind: 'current-ui' },
  { slug: 'profile', title: 'Profile', kicker: 'Account', lede: 'Name, contact details, and notification preferences.', livePath: '/dashboard/profile', kind: 'tool-kit' },
  { slug: 'lab', title: 'Lab workspace', kicker: 'Learning', lede: 'A hands-on lab on the enrolled program.', livePath: '/dashboard/learning/labs/[labId]', kind: 'current-ui' },
  { slug: 'find-your-career', title: 'Find your career', kicker: 'Learning', lede: 'A short path-finder before you enroll.', livePath: '/dashboard/learning/find-your-career', kind: 'current-ui' },
  { slug: 'interest-profiler', title: 'Interest profiler', kicker: 'Learning', lede: 'Interests mapped to roles this program trains for.', livePath: '/dashboard/learning/interest-profiler', kind: 'current-ui' },
  { slug: 'wioa-qualification', title: 'WIOA qualification', kicker: 'Learning', lede: 'Eligibility questions for funded training.', livePath: '/dashboard/learning/wioa-qualification', kind: 'current-ui' },
  { slug: 'program-start', title: 'Start program', kicker: 'Program', lede: 'Enrollment steps before the first module unlocks.', livePath: '/dashboard/program/start', kind: 'current-ui' },
  { slug: 'coursera-enrollment', title: 'Course enrollment', kicker: 'Program', lede: 'Open the assigned Coursera course for this path.', livePath: '/dashboard/program/coursera-enrollment', kind: 'current-ui' },
  { slug: 'employer-screening', title: 'Employer screening', kicker: 'Program', lede: 'A screening pack for a named employer.', livePath: '/dashboard/program/employer-screening', kind: 'current-ui' },
  { slug: 'counselor-detail', title: 'Dana Reyes', kicker: 'People', lede: 'Career advisor · next check-in Thursday.', livePath: '/dashboard/counselor/[id]', kind: 'current-ui' },
  { slug: 'mentors', title: 'Mentors', kicker: 'People', lede: 'Mentors available on this path.', livePath: '/dashboard/mentors', kind: 'current-ui' },
  { slug: 'mentor-profile', title: 'Mentor profile', kicker: 'People', lede: 'Request a session with a named mentor.', livePath: '/dashboard/mentors/[mentorId]', kind: 'current-ui' },
  { slug: 'mentor', title: 'My mentor sessions', kicker: 'People', lede: 'Sessions you have requested or completed.', livePath: '/dashboard/mentor', kind: 'current-ui' },
  { slug: 'help', title: 'Help', kicker: 'Support', lede: 'How to reach a person on this workspace.', livePath: '/dashboard/help', kind: 'current-ui' },
  { slug: 'skill-checkpoints', title: 'Skill checkpoints', kicker: 'AI Career Tools', lede: 'Checkpoints that unlock the next module.', livePath: '/dashboard/ai-tools/skill-checkpoints', kind: 'current-ui' },
  { slug: 'training-bridge', title: 'Training bridge', kicker: 'AI Career Tools', lede: 'Skills from training mapped onto open roles.', livePath: '/dashboard/ai-tools/training-bridge', kind: 'current-ui' },
  { slug: 'account', title: 'Account', kicker: 'Account', lede: 'Sign-in email and the workspace this member belongs to.', livePath: '/dashboard/account', kind: 'current-ui' },
  { slug: 'privacy', title: 'Privacy', kicker: 'Account', lede: 'Consent and the option to delete this account.', livePath: '/account/privacy', kind: 'current-ui' },
  { slug: 'documents', title: 'Documents', kicker: 'Account', lede: 'Enrollment agreement and billing packets on file.', livePath: '/dashboard/documents', kind: 'current-ui' },
  { slug: 'eligibility', title: 'Eligibility', kicker: 'Onboarding', lede: 'Saved answers for funded-training screening.', livePath: '/dashboard/eligibility', kind: 'current-ui' },
  { slug: 'assessment', title: 'Assessment', kicker: 'Onboarding', lede: 'The skills assessment and any retake notice.', livePath: '/dashboard/assessment', kind: 'current-ui' },
  { slug: 'survey', title: 'Survey', kicker: 'Onboarding', lede: 'A short survey about this week on the path.', livePath: '/dashboard/survey', kind: 'current-ui' },
  { slug: 'career-brief', title: 'Career brief', kicker: 'Guidance', lede: 'A brief for the target role and enrolled program.', livePath: '/dashboard/career-brief', kind: 'current-ui' },
  { slug: 'career-brief-detail', title: 'Cloud support brief', kicker: 'Guidance', lede: 'A personalized brief for Cloud Support Associate.', livePath: '/dashboard/career-brief/[slug]', kind: 'current-ui' },
  { slug: 'points', title: 'Points', kicker: 'Progress', lede: 'The points ledger for modules, applications, and streaks.', livePath: '/dashboard/points', kind: 'current-ui' },
  { slug: 'referrals', title: 'Referrals', kicker: 'Progress', lede: 'Share a link so someone else can start this path.', livePath: '/dashboard/referrals', kind: 'current-ui' },
  { slug: 'weekly-recap', title: 'Weekly recap', kicker: 'Progress', lede: 'What moved this week on training and applications.', livePath: '/dashboard/weekly-recap', kind: 'current-ui' },
  { slug: 'resources', title: 'Resources', kicker: 'Library', lede: 'Program resources tied to the enrolled path.', livePath: '/dashboard/resources', kind: 'current-ui' },
  { slug: 'career-library', title: 'Career library', kicker: 'Library', lede: 'Guides and worksheets for this program.', livePath: '/dashboard/career-library', kind: 'current-ui' },
  { slug: 'career-library-detail', title: 'Cloud support worksheet', kicker: 'Library', lede: 'A worksheet for the Cloud Support Associate role.', livePath: '/dashboard/career-library/[id]', kind: 'current-ui' },
  { slug: 'guide', title: 'Member guide', kicker: 'Guidance', lede: 'How this workspace is organized for the enrolled program.', livePath: '/dashboard/guide', kind: 'current-ui' },
] as const;

export const DEV_MEMBER_VIEW_BY_SLUG: Readonly<Record<string, DevMemberView>> = Object.fromEntries(
  DEV_MEMBER_VIEWS.map((view) => [view.slug, view]),
);

export function isDevMemberState(value: string | undefined): value is DevMemberState {
  return value !== undefined && (DEV_MEMBER_STATES as readonly string[]).includes(value);
}

export function parseDevMemberState(value: string | undefined): DevMemberState {
  return isDevMemberState(value) ? value : 'full';
}

export function harnessPath(slug: string, state: DevMemberState = 'full'): string {
  return state === 'full' ? `/dev/member/v/${slug}` : `/dev/member/v/${slug}?state=${state}`;
}

/** Real member routes that must bounce logged-out visitors to login. */
export const DEV_MEMBER_AUTH_PATHS = [
  ...DEV_MEMBER_VIEWS.map((view) => view.livePath.replace(/\[.*?\]/g, 'dev-placeholder')),
] as const;

/**
 * Inventory aliases. `authFirst` means the dashboard layout (or the page's own
 * getUser) redirects to login before the alias target can run for a logged-out
 * visitor. The source lock still asserts the page/config target.
 */
export type DevMemberAlias = {
  path: string;
  target: string;
  authFirst?: boolean;
};

export const DEV_MEMBER_ALIASES: readonly DevMemberAlias[] = [
  { path: '/dashboard/assessments', target: '/dashboard/assessment', authFirst: true },
  { path: '/dashboard/skills-assessment', target: '/dashboard/assessment', authFirst: true },
  { path: '/dashboard/ai-tools/application-tracker', target: '/dashboard/job-applications', authFirst: true },
  { path: '/dashboard/ai-tools/resume-analysis', target: '/dashboard/ai-tools/resume-studio?view=score', authFirst: true },
  { path: '/dashboard/ai-tools/resume-coach', target: '/dashboard/ai-tools/resume-studio?view=coach', authFirst: true },
  { path: '/dashboard/ai-tools/resume-rewriter', target: '/dashboard/ai-tools/resume-studio?view=rewrite', authFirst: true },
  { path: '/dashboard/ai-tools/studio', target: '/dashboard/ai-tools', authFirst: true },
  { path: '/dashboard/ai-tools/readiness-coach', target: '/dashboard/ai-tools/studio?tab=session&agent=readiness', authFirst: true },
  { path: '/dashboard/toolkit', target: '/dashboard/ai-tools?tab=toolkit', authFirst: true },
  { path: '/dashboard/settings', target: '/dashboard/profile#settings', authFirst: true },
  { path: '/dashboard/program/change', target: '/dashboard/program', authFirst: true },
  { path: '/dashboard/coursera', target: '/dashboard/program', authFirst: true },
  { path: '/dashboard/training', target: '/dashboard/program', authFirst: true },
  { path: '/account', target: '/dashboard/account' },
  { path: '/applications', target: '/dashboard/job-applications', authFirst: true },
  { path: '/certifications', target: '/dashboard/certifications' },
  { path: '/pwa-start', target: '/login?redirectTo=/pwa-start', authFirst: true },
] as const;

/** Closest live nav href for a harness slug (rail highlighting only). */
export function harnessNavLivePath(slug: string): string {
  const view = DEV_MEMBER_VIEW_BY_SLUG[slug];
  if (!view) return '/dashboard';
  const path = view.livePath.split('?')[0] ?? view.livePath;
  if (path === '/dashboard' || path === '/coach' || path === '/account/privacy') {
    return path === '/account/privacy' ? '/dashboard/profile' : '/dashboard';
  }
  if (path.startsWith('/dashboard/jobs') || path === '/dashboard/job-applications' || path === '/dashboard/resume') {
    return '/dashboard/jobs';
  }
  if (path.startsWith('/dashboard/ai-tools') || path === '/dashboard/toolkit') {
    return '/dashboard/ai-tools';
  }
  if (path.startsWith('/dashboard/program') || path.startsWith('/dashboard/learning') || path === '/dashboard/missions') {
    return '/dashboard/program';
  }
  if (path === '/dashboard/certifications') return '/dashboard/certifications';
  if (path === '/dashboard/readiness') return '/dashboard/readiness';
  if (
    path.startsWith('/dashboard/messages') ||
    path.startsWith('/dashboard/counselor') ||
    path.startsWith('/dashboard/mentor') ||
    path === '/dashboard/help'
  ) {
    return '/dashboard/messages';
  }
  if (path === '/dashboard/assessment') return '/dashboard/assessment';
  if (path === '/dashboard/profile' || path === '/dashboard/account' || path === '/dashboard/settings') {
    return '/dashboard/profile';
  }
  return '/dashboard';
}
