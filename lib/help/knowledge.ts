/**
 * Curated knowledge map for the in-portal help assistant (`help_assistant_v1`).
 *
 * One entry per persona: what each portal surface is for and where it lives.
 * Routes are the checked-in audit manifest (`scripts/lib/portal-audit-paths.mjs`)
 * and the nav rails (`lib/nav/portalNav.ts`); a route may add a `#fragment` for
 * a section of an audited page (goals: `/dashboard/career-brief#goals`). The tour keys are
 * `lib/tours/registry.ts`. Nothing here is member data: it is product copy the
 * model is allowed to ground on, and the only routes it may point people to.
 *
 * Pure data + pure functions: safe to import from server components, API
 * routes, client components and `node --test`.
 */

export const HELP_PERSONAS = ['member', 'counselor', 'employer', 'partner', 'admin'] as const;
export type HelpPersona = (typeof HELP_PERSONAS)[number];

export interface HelpFeature {
  /** Short label as the nav shows it. */
  title: string;
  /** Route inside this persona's portal. */
  route: string;
  /** One or two sentences: what it is for and what the person does there. */
  summary: string;
  /** Lower-case words a question about this feature tends to contain. */
  keywords: readonly string[];
}

export interface PersonaKnowledge {
  persona: HelpPersona;
  /** Human label used in prompts ("a WorkforceAP member"). */
  label: string;
  /** Route prefix that identifies this portal in a pathname. */
  routePrefix: string;
  homeRoute: string;
  /** Static guide page for the portal, or null when it has none. */
  guideHref: string | null;
  /** Registry tour the Help menu reopens, or null when the wave has not landed. */
  tourKey: string | null;
  /** Where to turn when the assistant cannot help. */
  supportHint: string;
  features: readonly HelpFeature[];
}

const MEMBER: PersonaKnowledge = {
  persona: 'member',
  label: 'a WorkforceAP member (a job seeker in a training program)',
  routePrefix: '/dashboard',
  homeRoute: '/dashboard',
  guideHref: '/dashboard/guide',
  tourKey: 'member.home',
  supportHint: 'Message your counselor from the Messages page; they are your main point of contact.',
  features: [
    { title: 'Home', route: '/dashboard', summary: 'Your dashboard: next steps, progress, and recent activity in one place.', keywords: ['home', 'dashboard', 'start', 'next step'] },
    { title: 'My program', route: '/dashboard/program', summary: 'The training program you are enrolled in, its courses and how far along you are. Program changes go through your counselor.', keywords: ['program', 'course', 'coursera', 'enroll', 'class', 'certificate program', 'switch program', 'change program'] },
    { title: 'Path to certification', route: '/dashboard/program/start', summary: 'The step-by-step path from where you are to the certification your program leads to.', keywords: ['path', 'certification', 'roadmap', 'steps'] },
    { title: 'My progress', route: '/dashboard/readiness', summary: 'Job-readiness progress: which milestones are done, in progress, or recommended next.', keywords: ['progress', 'readiness', 'ready', 'milestone', 'status'] },
    { title: 'Job board', route: '/dashboard/jobs', summary: 'Open jobs from partner employers matched to your program and skills.', keywords: ['job', 'jobs', 'board', 'opening', 'apply', 'employer', 'match'] },
    { title: 'Job applications', route: '/dashboard/job-applications', summary: 'Track every application you have made, its stage, and follow-ups.', keywords: ['application', 'applications', 'applied', 'tracker', 'kanban', 'interview stage'] },
    { title: 'AI Career Tools', route: '/dashboard/ai-tools', summary: 'Resume Studio, cover letter, interview coach and practice, LinkedIn headline and about, job match scorer, salary negotiation, skill mapper, gap analyzer, benefits cliff, elevator pitch, and your tool history.', keywords: ['ai', 'tool', 'tools', 'resume', 'cover letter', 'interview', 'linkedin', 'salary', 'pitch', 'skill mapper', 'gap', 'benefits', 'history', 'coach'] },
    { title: 'Resume Studio', route: '/dashboard/ai-tools/resume-studio', summary: 'Upload or build a resume, get a score, coaching suggestions, and a rewrite you can download.', keywords: ['resume', 'cv', 'score', 'rewrite', 'upload resume'] },
    { title: 'Interview practice', route: '/dashboard/ai-tools/interview-practice', summary: 'Practice interview questions with an AI coach, by text or voice, and review feedback.', keywords: ['interview', 'practice', 'mock', 'voice', 'questions'] },
    { title: 'Skill missions', route: '/dashboard/missions', summary: 'Short skill-building missions and checkpoints tied to your program.', keywords: ['mission', 'missions', 'checkpoint', 'skill'] },
    { title: 'My certificates', route: '/dashboard/certifications', summary: 'Certificates you have earned or are working toward, with the reference roadmap.', keywords: ['certificate', 'certificates', 'certification', 'earned', 'vault'] },
    { title: 'My documents', route: '/dashboard/documents', summary: 'Files you have uploaded or generated, such as resumes and cover letters.', keywords: ['document', 'documents', 'file', 'download', 'upload'] },
    { title: 'My career plan', route: '/dashboard/career-brief', summary: 'Your career brief: training progress, skills score, resume and job-search status, and your goals.', keywords: ['career plan', 'brief', 'career brief'] },
    { title: 'Your goals', route: '/dashboard/career-brief#goals', summary: 'The goals section of My career plan: set up to three goals at a time, break each one into small steps, and check steps off as you finish them.', keywords: ['goal', 'goals', 'set goals', 'my goals', 'goal steps'] },
    { title: 'Career library', route: '/dashboard/career-library', summary: 'Explore careers, typical pay, and the skills they need.', keywords: ['career library', 'careers', 'explore', 'occupation', 'pay'] },
    { title: 'Find your career', route: '/dashboard/learning/find-your-career', summary: 'Interest profiler and career recommendations to help pick a direction, or skill mapping for a target role you already have in mind.', keywords: ['interest', 'profiler', 'find your career', 'recommend', 'quiz', 'target role'] },
    { title: 'Learning', route: '/dashboard/learning', summary: 'Learning hub: enrolled courses and the destinations they lead to.', keywords: ['learning', 'lesson', 'hub', 'enrolled'] },
    { title: 'Messages', route: '/dashboard/messages', summary: 'Message your counselor directly and read replies.', keywords: ['message', 'messages', 'counselor', 'contact', 'reply', 'inbox'] },
    { title: 'My counselor', route: '/dashboard/counselor', summary: 'Who your counselor is and how to reach them.', keywords: ['counselor', 'advisor', 'who is my'] },
    { title: 'Mentors', route: '/dashboard/mentors', summary: 'Mentors available to you and how to connect.', keywords: ['mentor', 'mentors', 'mentorship'] },
    { title: 'Resources', route: '/dashboard/resources', summary: 'Guides, links, and downloads curated for your program.', keywords: ['resource', 'resources', 'guide', 'link'] },
    { title: 'Points', route: '/dashboard/points', summary: 'Points you earn for completing tools, missions, and milestones.', keywords: ['points', 'reward', 'streak'] },
    { title: 'Weekly recap', route: '/dashboard/weekly-recap', summary: 'A weekly summary of what you did and what to do next.', keywords: ['weekly', 'recap', 'summary', 'week'] },
    { title: 'Referrals', route: '/dashboard/referrals', summary: 'Share your referral link with friends who might join a program.', keywords: ['referral', 'refer', 'invite friend', 'share link'] },
    { title: 'Profile', route: '/dashboard/profile', summary: 'Your name, photo, contact details, and background.', keywords: ['profile', 'photo', 'name', 'phone', 'address', 'background'] },
    { title: 'Account', route: '/dashboard/account', summary: 'Login email, password, language, privacy choices, download your data, or delete your account.', keywords: ['account', 'password', 'email', 'login', 'language', 'privacy', 'delete account', 'download my data', 'sign in'] },
    { title: 'Help', route: '/dashboard/help', summary: 'Help center: Coursera access, talking to your counselor, and AI tool basics.', keywords: ['help', 'support', 'faq', 'stuck'] },
  ],
};

const COUNSELOR: PersonaKnowledge = {
  persona: 'counselor',
  label: 'a WorkforceAP counselor (staff supporting a roster of members)',
  routePrefix: '/counselor',
  homeRoute: '/counselor/today',
  guideHref: '/counselor/guide',
  tourKey: 'counselor.home',
  supportHint: 'Ask a WorkforceAP admin, or use the Portal guide from the Help menu.',
  features: [
    { title: 'Today', route: '/counselor/today', summary: 'Your landing page: the members who need attention today, your queue, and your roster.', keywords: ['today', 'attention', 'landing', 'start', 'home'] },
    { title: 'Overview', route: '/counselor/overview', summary: 'Roster-level stats: members in a program, awaiting reply, and no program yet.', keywords: ['overview', 'stats', 'roster', 'summary'] },
    { title: 'Inbox zero', route: '/counselor/inbox', summary: 'Work through unread member messages and follow-ups until the inbox is clear; bulk follow-ups live here.', keywords: ['inbox', 'zero', 'unread', 'follow-up', 'follow up', 'bulk'] },
    { title: 'In-office sessions', route: '/counselor/sessions', summary: 'Run an AI tool with a member sitting beside you (walk-in sessions); the result lands in their history.', keywords: ['session', 'sessions', 'in-office', 'walk-in', 'walk in', 'on behalf'] },
    { title: 'My members', route: '/counselor/students', summary: 'Your assigned members. Open a member record to see progress, notes, program, and messages.', keywords: ['member', 'members', 'student', 'students', 'roster', 'record', 'notes', 'assigned'] },
    { title: 'Lab reviews', route: '/counselor/lab-reviews', summary: 'Review submitted lab work and mark it complete or send it back.', keywords: ['lab', 'labs', 'review', 'submission'] },
    { title: 'Messages', route: '/counselor/messages', summary: 'Two-way messaging with your members.', keywords: ['message', 'messages', 'reply', 'chat'] },
    { title: 'Work queue', route: '/counselor/queue', summary: 'Tasks and approvals waiting on you, ordered by urgency.', keywords: ['queue', 'task', 'tasks', 'approval', 'approve'] },
    { title: 'Triage queue', route: '/counselor/triage', summary: 'New or unassigned members to triage into a program or a counselor.', keywords: ['triage', 'unassigned', 'new member', 'assign'] },
    { title: 'At-risk members', route: '/counselor/at-risk', summary: 'Members whose activity or progress signals they may drop off, with the reasons.', keywords: ['at-risk', 'at risk', 'risk', 'drop', 'inactive', 'falling behind'] },
    { title: 'Inactive members', route: '/counselor/inactive-members', summary: 'Members with no recent login or progress.', keywords: ['inactive', 'no login', 'dormant'] },
    { title: 'Placements', route: '/counselor/placements', summary: 'Record and track job placements for your members.', keywords: ['placement', 'placements', 'hired', 'job outcome', 'retention'] },
    { title: 'Notifications', route: '/counselor/notifications', summary: 'Alerts about your members and the portal.', keywords: ['notification', 'notifications', 'alert', 'bell'] },
    { title: 'My profile', route: '/counselor/profile', summary: 'Your counselor profile and contact details.', keywords: ['profile', 'my profile', 'contact'] },
    { title: 'Resources', route: '/counselor/resources', summary: 'Counselor resources and templates.', keywords: ['resource', 'resources', 'template', 'templates'] },
    { title: 'Portal guide', route: '/counselor/guide', summary: 'The written guide to the counselor portal.', keywords: ['guide', 'help', 'manual', 'how do i'] },
  ],
};

const EMPLOYER: PersonaKnowledge = {
  persona: 'employer',
  label: 'a WorkforceAP employer partner (hiring from the talent pool)',
  routePrefix: '/employer',
  homeRoute: '/employer',
  guideHref: '/employer/guide',
  tourKey: 'employer.home',
  supportHint: 'Use Messages to reach the WorkforceAP team, or open the Portal guide.',
  features: [
    { title: 'Overview', route: '/employer', summary: 'Your hiring dashboard: open jobs, new applicants, and matches.', keywords: ['overview', 'dashboard', 'home', 'start'] },
    { title: 'Work queue', route: '/employer/work-queue', summary: 'Applicants and jobs waiting on an action from you.', keywords: ['queue', 'work queue', 'todo', 'action'] },
    { title: 'Jobs', route: '/employer/jobs', summary: 'Your job postings: drafts, in review, and live. Post a new job or import one from a URL.', keywords: ['job', 'jobs', 'post', 'posting', 'draft', 'import', 'review', 'live', 'new job'] },
    { title: 'Applications', route: '/employer/applications', summary: 'Candidates who applied to your jobs, with resumes and status.', keywords: ['application', 'applications', 'applicant', 'applicants', 'candidate', 'resume'] },
    { title: 'Pipeline', route: '/employer/pipeline', summary: 'Move candidates through your hiring stages.', keywords: ['pipeline', 'stage', 'stages', 'hiring', 'interview', 'offer'] },
    { title: 'Matches', route: '/employer/matches', summary: 'Program graduates and members matched to your jobs before they apply.', keywords: ['match', 'matches', 'talent', 'graduate', 'recommend'] },
    { title: 'Messages', route: '/employer/messages', summary: 'Message candidates and the WorkforceAP team.', keywords: ['message', 'messages', 'contact', 'chat'] },
    { title: 'Outcomes', route: '/employer/outcomes', summary: 'Hires and retention from WorkforceAP candidates.', keywords: ['outcome', 'outcomes', 'hire', 'hires', 'retention', 'report'] },
    { title: 'Letter of intent', route: '/employer/loi', summary: 'Your letter of intent to hire from the program.', keywords: ['loi', 'letter of intent', 'intent'] },
    { title: 'Billing', route: '/employer/billing', summary: 'Plan and billing details.', keywords: ['billing', 'invoice', 'plan', 'payment', 'subscription'] },
    { title: 'Settings', route: '/employer/settings', summary: 'Company profile, users, and notification settings.', keywords: ['setting', 'settings', 'company', 'profile', 'users', 'notification'] },
    { title: 'Portal guide', route: '/employer/guide', summary: 'The written guide to the employer portal.', keywords: ['guide', 'help', 'manual', 'how do i'] },
  ],
};

const PARTNER: PersonaKnowledge = {
  persona: 'partner',
  label: 'a WorkforceAP community partner (referring and following members)',
  routePrefix: '/partner',
  homeRoute: '/partner',
  guideHref: '/partner/guide',
  tourKey: 'partner.home',
  supportHint: 'Use Messages to reach the WorkforceAP team, or open the Portal guide.',
  features: [
    { title: 'Overview', route: '/partner', summary: 'Your dashboard: referred members, milestones, and what needs attention.', keywords: ['overview', 'dashboard', 'home', 'start'] },
    { title: 'Referred members', route: '/partner/referred-members', summary: 'Everyone you referred and where they are in their program.', keywords: ['referred', 'referral', 'referrals', 'member', 'members', 'roster'] },
    { title: 'Attention', route: '/partner/attention', summary: 'Referred members who have stalled or need a nudge.', keywords: ['attention', 'stalled', 'nudge', 'at risk', 'inactive'] },
    { title: 'Milestones', route: '/partner/milestones', summary: 'Milestones your members hit, such as enrollments, certificates, and placements.', keywords: ['milestone', 'milestones', 'certificate', 'enrolled', 'placement'] },
    { title: 'Outcomes', route: '/partner/outcomes', summary: 'Outcome reporting for your referrals.', keywords: ['outcome', 'outcomes', 'report', 'reporting', 'metrics'] },
    { title: 'Exports', route: '/partner/exports', summary: 'Download CSV exports of your referral data.', keywords: ['export', 'exports', 'csv', 'download', 'spreadsheet'] },
    { title: 'Messages', route: '/partner/messages', summary: 'Message the WorkforceAP team.', keywords: ['message', 'messages', 'contact'] },
    { title: 'Resources', route: '/partner/resources', summary: 'Partner resources and referral materials, including your referral link.', keywords: ['resource', 'resources', 'referral link', 'link', 'flyer', 'material'] },
    { title: 'Settings', route: '/partner/settings', summary: 'Organization profile, users, and notification settings.', keywords: ['setting', 'settings', 'organization', 'users', 'notification'] },
    { title: 'Portal guide', route: '/partner/guide', summary: 'The written guide to the partner portal.', keywords: ['guide', 'help', 'manual', 'how do i'] },
  ],
};

const ADMIN: PersonaKnowledge = {
  persona: 'admin',
  label: 'a WorkforceAP admin (staff running the platform)',
  routePrefix: '/admin',
  homeRoute: '/admin',
  guideHref: '/admin/what-workforceap-does',
  tourKey: null,
  supportHint: 'Check the diagnostics and health pages, or ask the engineering channel.',
  features: [
    { title: 'Command center', route: '/admin/command-center', summary: 'Applicants and members needing a decision, with one-click actions.', keywords: ['command center', 'applicant', 'applicants', 'decision', 'approve', 'queue'] },
    { title: 'Members', route: '/admin/members', summary: 'Every member: search, edit, assign counselors and programs, merge duplicates, review job-ready and interview-ready lists.', keywords: ['member', 'members', 'assign', 'duplicate', 'merge', 'job-ready', 'interview-ready', 'edit member'] },
    { title: 'Counselors', route: '/admin/counselors', summary: 'Manage counselors and their rosters.', keywords: ['counselor', 'counselors', 'roster', 'caseload'] },
    { title: 'Employers', route: '/admin/employers', summary: 'Employer accounts and approvals.', keywords: ['employer', 'employers', 'approve employer'] },
    { title: 'Partners', route: '/admin/partners', summary: 'Community partner organizations and their users.', keywords: ['partner', 'partners', 'organization'] },
    { title: 'Jobs', route: '/admin/jobs', summary: 'Review and publish employer job postings.', keywords: ['job', 'jobs', 'review job', 'publish'] },
    { title: 'Programs', route: '/admin/programs', summary: 'Training programs, subgroups, and career mappings.', keywords: ['program', 'programs', 'subgroup', 'mapping', 'catalog'] },
    { title: 'Coursera', route: '/admin/coursera', summary: 'Coursera provisioning, enrollment, CSV import, catalog health, and learner mappings.', keywords: ['coursera', 'provision', 'enrollment', 'csv', 'import', 'catalog', 'learner'] },
    { title: 'Invites', route: '/admin/invites', summary: 'Invite members, counselors, and staff.', keywords: ['invite', 'invites', 'invitation', 'onboard'] },
    { title: 'Messages', route: '/admin/messages', summary: 'Platform-wide message threads.', keywords: ['message', 'messages'] },
    { title: 'Analytics', route: '/admin/analytics', summary: 'Cohort analytics, AI efficacy, metrics, and outcomes reports.', keywords: ['analytics', 'metrics', 'report', 'reports', 'cohort', 'efficacy', 'outcomes', 'quarterly'] },
    { title: 'Placements', route: '/admin/placements', summary: 'Record placements and track retention.', keywords: ['placement', 'placements', 'retention', 'hired'] },
    { title: 'Feature flags', route: '/admin/feature-flags', summary: 'Turn features on per role and rollout percentage (guided tours, help assistant, and others).', keywords: ['flag', 'flags', 'feature flag', 'rollout', 'enable', 'toggle'] },
    { title: 'Email templates and crons', route: '/admin/email-templates', summary: 'Edit outgoing email templates and review scheduled email jobs.', keywords: ['email', 'template', 'templates', 'cron', 'crons', 'schedule'] },
    { title: 'Health and diagnostics', route: '/admin/health', summary: 'System health, diagnostics, webhook events, and audit logs.', keywords: ['health', 'diagnostic', 'diagnostics', 'webhook', 'audit log', 'audit', 'status'] },
    { title: 'Exports', route: '/admin/exports', summary: 'Data exports for funders and reporting.', keywords: ['export', 'exports', 'csv', 'download', 'funder'] },
    { title: 'Settings', route: '/admin/settings', summary: 'Organization branding and platform settings.', keywords: ['setting', 'settings', 'branding', 'org'] },
    { title: 'What WorkforceAP does', route: '/admin/what-workforceap-does', summary: 'The written overview of the platform for staff.', keywords: ['guide', 'help', 'overview', 'what does'] },
  ],
};

export const HELP_KNOWLEDGE: Readonly<Record<HelpPersona, PersonaKnowledge>> = {
  member: MEMBER,
  counselor: COUNSELOR,
  employer: EMPLOYER,
  partner: PARTNER,
  admin: ADMIN,
};

export function isHelpPersona(value: unknown): value is HelpPersona {
  return typeof value === 'string' && (HELP_PERSONAS as readonly string[]).includes(value);
}

export function getPersonaKnowledge(persona: HelpPersona): PersonaKnowledge {
  return HELP_KNOWLEDGE[persona];
}

/**
 * Persona whose portal a pathname belongs to, or null for routes outside the
 * five portals (marketing, auth, `/help`). `/dashboard/*` is the member portal.
 */
export function personaForPathname(pathname: string | null | undefined): HelpPersona | null {
  if (!pathname) return null;
  const path = pathname.split('?')[0] ?? '';
  for (const persona of HELP_PERSONAS) {
    const prefix = HELP_KNOWLEDGE[persona].routePrefix;
    if (path === prefix || path.startsWith(`${prefix}/`)) return persona;
  }
  return null;
}

const TOKEN_PATTERN = /[a-z0-9][a-z0-9-]*/g;

/** Lower-case word tokens of a question; hyphenated words stay whole. */
export function tokenizeQuestion(question: string): string[] {
  return (question.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((t) => t.length > 1);
}

function keywordHits(text: string, tokens: readonly string[], keywords: readonly string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (text.includes(kw)) hits += 2;
    } else if (tokens.includes(kw)) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Features of the persona a question is most likely about, best first, plus
 * the feature for the current route so "this page" questions ground on it.
 */
export function findRelevantFeatures(
  persona: HelpPersona,
  question: string,
  currentRoute?: string | null,
  limit = 4,
): HelpFeature[] {
  const knowledge = HELP_KNOWLEDGE[persona];
  const text = question.toLowerCase();
  const tokens = tokenizeQuestion(question);
  const current = currentRoute ? currentFeature(persona, currentRoute) : null;

  const scored = knowledge.features
    .map((feature) => ({ feature, score: keywordHits(text, tokens, feature.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.feature);

  const out: HelpFeature[] = [];
  if (current) out.push(current);
  for (const feature of scored) {
    if (out.length >= limit) break;
    if (!out.includes(feature)) out.push(feature);
  }
  return out;
}

/** The persona feature whose route is the longest prefix of the current pathname. */
export function currentFeature(persona: HelpPersona, pathname: string): HelpFeature | null {
  const path = pathname.split('?')[0] ?? '';
  let best: HelpFeature | null = null;
  for (const feature of HELP_KNOWLEDGE[persona].features) {
    if (path === feature.route || path.startsWith(`${feature.route}/`)) {
      if (!best || feature.route.length > best.route.length) best = feature;
    }
  }
  return best;
}

/**
 * Personas other than `persona` whose vocabulary the question leans on. Used
 * to redirect a member asking how to approve applicants (admin work) without
 * spending a model call. Words shared across portals ("messages", "profile")
 * are ignored; only route prefixes and persona names count.
 */
export function detectOtherPersonas(persona: HelpPersona, question: string): HelpPersona[] {
  const text = question.toLowerCase();
  const tokens = tokenizeQuestion(question);
  const hits = new Set<HelpPersona>();
  for (const other of HELP_PERSONAS) {
    if (other === persona) continue;
    const knowledge = HELP_KNOWLEDGE[other];
    if (text.includes(knowledge.routePrefix)) hits.add(other);
    const names = PERSONA_WORDS[other];
    if (names.some((w) => tokens.includes(w))) hits.add(other);
  }
  return Array.from(hits);
}

/** Words that name a persona or its portal; shared nouns are deliberately absent. */
const PERSONA_WORDS: Readonly<Record<HelpPersona, readonly string[]>> = {
  member: ['member-portal'],
  counselor: ['counselor-portal', 'caseload'],
  employer: ['employer-portal', 'employers'],
  partner: ['partner-portal', 'partners'],
  admin: ['admin', 'admins', 'administrator', 'superadmin', 'super-admin', 'staff'],
};
