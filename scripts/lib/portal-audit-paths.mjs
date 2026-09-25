/**
 * Checked-in manifest for the five authenticated portal surfaces.
 *
 * Static paths are visited at desktop and mobile viewports. Dynamic paths are
 * exercised only through visible same-origin fixtures; patterns listed in
 * REQUIRED_DYNAMIC_PATHS fail the audit when no fixture is discoverable.
 *
 * Redirect-only pages are inventoried separately so route discovery remains
 * complete without pretending a legacy alias is an independently rendered UI.
 */

export const STATIC_PATHS = {
  member: [
    '/dashboard',
    '/dashboard/account',
    '/dashboard/ai-tools',
    '/dashboard/ai-tools?tab=session&agent=readiness',
    '/dashboard/ai-tools/benefits-cliff',
    '/dashboard/ai-tools/career-business-coach',
    '/dashboard/ai-tools/cover-letter',
    '/dashboard/ai-tools/elevator-pitch',
    '/dashboard/ai-tools/gap-analyzer',
    '/dashboard/ai-tools/history',
    '/dashboard/ai-tools/interview-coach',
    '/dashboard/ai-tools/interview-practice',
    '/dashboard/ai-tools/interview-prep',
    '/dashboard/ai-tools/job-match-scorer',
    '/dashboard/ai-tools/linkedin-about',
    '/dashboard/ai-tools/linkedin-headline',
    '/dashboard/ai-tools/resume-studio',
    '/dashboard/ai-tools/resume-studio?view=score',
    '/dashboard/ai-tools/resume-studio?view=coach',
    '/dashboard/ai-tools/resume-studio?view=rewrite',
    '/dashboard/ai-tools/salary-negotiation',
    '/dashboard/ai-tools/skill-checkpoints',
    '/dashboard/ai-tools/skill-mapper',
    '/dashboard/ai-tools/training-bridge',
    '/dashboard/ai-tools/voice-interview',
    '/dashboard/assessment',
    '/dashboard/career-brief',
    '/dashboard/career-library',
    '/dashboard/certifications',
    '/dashboard/documents',
    '/dashboard/counselor',
    '/dashboard/eligibility',
    '/dashboard/guide',
    '/dashboard/help',
    '/dashboard/job-applications',
    '/dashboard/jobs',
    '/dashboard/learning',
    '/dashboard/learning/find-your-career',
    '/dashboard/learning/interest-profiler',
    '/dashboard/learning/wioa-qualification',
    '/dashboard/mentors',
    '/dashboard/messages',
    '/dashboard/missions',
    '/dashboard/points',
    '/dashboard/referrals',
    '/dashboard/profile',
    '/dashboard/program',
    '/dashboard/readiness',
    '/dashboard/resources',
    '/dashboard/resume',
    '/dashboard/survey',
    '/dashboard/weekly-recap',
  ],

  admin: [
    '/admin',
    '/admin/agent-inbox',
    '/admin/ai-tools',
    '/admin/analytics/ai-efficacy',
    '/admin/assessments',
    '/admin/blog',
    '/admin/blog/ai',
    '/admin/blog/new',
    '/admin/board/print',
    '/admin/career-mappings',
    '/admin/certifications',
    '/admin/chapters',
    '/admin/command-center',
    '/admin/counselors',
    '/admin/coursera/csv-import',
    '/admin/coursera/enrollment',
    '/admin/coursera/health',
    '/admin/coursera/provisioning',
    '/admin/crons',
    '/admin/dashboard',
    '/admin/diagnostics',
    '/admin/email-crons',
    '/admin/email-templates',
    '/admin/employer-screening-packs',
    '/admin/employers',
    '/admin/feature-flags',
    '/admin/feedback',
    '/admin/guide',
    '/admin/growth',
    '/admin/health',
    '/admin/invites',
    '/admin/invites/new',
    '/admin/jobs',
    '/admin/members',
    '/admin/members/duplicates',
    '/admin/members/interview-ready',
    '/admin/members/job-ready',
    '/admin/members/merge',
    '/admin/members/new',
    '/admin/mentors',
    '/admin/outcomes/methodology',
    '/admin/overview',
    '/admin/partners',
    '/admin/partners/new',
    '/admin/pipeline',
    '/admin/placement-surveys',
    '/admin/placements',
    '/admin/placements/new',
    '/admin/placements/retention',
    '/admin/program-change-requests',
    '/admin/programs',
    // The reporting hub: one page, server-driven tabs (admin audit 2026-09-19, §6.1).
    '/admin/reporting',
    '/admin/reporting?tab=outcomes',
    '/admin/reporting?tab=training',
    '/admin/reporting?tab=coursera',
    '/admin/reporting?tab=exports',
    '/admin/reports/quarterly-outcomes',
    '/admin/sessions',
    '/admin/sessions/walk-in',
    '/admin/settings',
    '/admin/students',
    '/admin/subgroups',
    '/admin/subgroups/new',
    '/admin/testimonials',
    '/admin/users',
    '/admin/users/deleted',
    '/admin/weekly-recap',
    '/admin/what-workforceap-does',
    '/admin/wioa-screening',
  ],

  employer: [
    '/employer',
    '/employer/applications',
    '/employer/billing',
    '/employer/guide',
    '/employer/jobs',
    '/employer/jobs/import',
    '/employer/jobs/new',
    '/employer/jobs/post',
    '/employer/loi',
    '/employer/matches',
    '/employer/messages',
    '/employer/outcomes',
    '/employer/pipeline',
    '/employer/settings',
    '/employer/thank-you',
    '/employer/work-queue',
  ],

  partner: [
    '/partner',
    '/partner/attention',
    '/partner/exports',
    '/partner/guide',
    '/partner/messages',
    '/partner/milestones',
    '/partner/outcomes',
    '/partner/referred-members',
    '/partner/resources',
    '/partner/settings',
  ],

  counselor: [
    '/counselor/lab-reviews',
    '/counselor/today',
    '/counselor/overview',
    '/counselor/overview?ui=legacy',
    '/counselor/at-risk',
    '/counselor/guide',
    '/counselor/inactive-members',
    '/counselor/inbox',
    '/counselor/messages',
    '/counselor/notifications',
    '/counselor/placements',
    '/counselor/profile',
    '/counselor/queue',
    '/counselor/resources',
    '/counselor/sessions',
    '/counselor/sessions/walk-in',
    '/counselor/students',
    '/counselor/triage',
  ],
};

export const DYNAMIC_PATHS = {
  member: [
    '/dashboard/[...slug]',
    '/dashboard/career-brief/[slug]',
    '/dashboard/career-library/[id]',
    '/dashboard/counselor/[id]',
    '/dashboard/jobs/[id]',
    '/dashboard/learning/modules/[courseSlug]',
    '/dashboard/learning/labs/[labId]',
    '/dashboard/mentors/[mentorId]',
  ],
  admin: [
    '/admin/blog/[id]/edit',
    '/admin/blog/preview/[slug]',
    '/admin/coursera/learners/[userId]',
    '/admin/coursera/learners/unmatched/[externalEmail]',
    '/admin/coursera/learners/unmatched/[externalEmail]/events',
    '/admin/employers/[id]',
    '/admin/jobs/[id]',
    '/admin/members/[id]',
    '/admin/members/[id]/billing',
    '/admin/members/[id]/lifecycle',
    '/admin/members/[id]/readiness',
    '/admin/members/[id]/stakeholder',
    '/admin/partners/[id]',
    '/admin/partners/[id]/quarterly-outcomes',
    '/admin/sessions/[memberId]/run',
    '/admin/subgroups/[id]',
    '/admin/subgroups/[id]/edit',
  ],
  employer: [
    '/employer/applications/[id]',
    '/employer/candidates/[studentId]',
    '/employer/jobs/[id]',
    '/employer/jobs/[id]/applicants',
    '/employer/jobs/[id]/edit',
  ],
  partner: ['/partner/referred-members/[memberId]'],
  counselor: ['/counselor/sessions/[memberId]/run', '/counselor/students/[memberId]', '/counselor/lab-reviews/[submissionId]'],
};

/** Checked-in fixtures make these dynamic routes mandatory on isolated targets. */
export const REQUIRED_DYNAMIC_PATHS = {
  member: ['/dashboard/career-library/[id]'],
  admin: [],
  employer: [],
  partner: [],
  counselor: [],
};

/**
 * Safe click-level coverage. The runner only accepts internal anchors and GET
 * navigation; buttons, forms, downloads, voice sessions, and write APIs are
 * structurally outside this manifest.
 */
export const SAFE_ACTION_CONTRACTS = {
  member: [
    {
      id: 'member-open-program',
      kind: 'read_only_navigation',
      sourcePath: '/dashboard',
      targetPath: '/dashboard/program',
      required: true,
    },
    {
      id: 'member-open-resume',
      kind: 'read_only_navigation',
      sourcePath: '/dashboard',
      targetPath: '/dashboard/resume',
      required: true,
    },
    {
      id: 'member-open-career-library-resource',
      kind: 'read_only_discovered_navigation',
      sourcePath: '/dashboard/career-library',
      targetPattern: '/dashboard/career-library/[id]',
      required: true,
    },
  ],
  admin: [
    {
      id: 'admin-open-student-roster',
      kind: 'read_only_navigation',
      sourcePath: '/admin',
      targetPath: '/admin/students',
      required: true,
    },
    {
      id: 'admin-open-student-record',
      kind: 'read_only_discovered_navigation',
      sourcePath: '/admin/members',
      targetPattern: '/admin/members/[id]',
      requiredWhenApplicable: true,
      emptyStateText: 'No members yet',
    },
  ],
  employer: [
    {
      id: 'employer-open-jobs',
      kind: 'read_only_navigation',
      sourcePath: '/employer',
      targetPath: '/employer/jobs',
      required: true,
    },
    {
      id: 'employer-open-job-record',
      kind: 'read_only_discovered_navigation',
      sourcePath: '/employer/jobs',
      targetPattern: '/employer/jobs/[id]',
      requiredWhenApplicable: true,
      emptyStateText: 'No jobs yet',
    },
  ],
  partner: [
    {
      id: 'partner-open-referred-members',
      kind: 'read_only_navigation',
      sourcePath: '/partner',
      targetPath: '/partner/referred-members',
      required: true,
    },
    {
      id: 'partner-open-referred-member-record',
      kind: 'read_only_discovered_navigation',
      sourcePath: '/partner/referred-members',
      targetPattern: '/partner/referred-members/[memberId]',
      requiredWhenApplicable: true,
      emptyStateText: "You haven't referred any members yet",
    },
  ],
  counselor: [
    {
      id: 'counselor-open-students',
      kind: 'read_only_navigation',
      sourcePath: '/counselor/today',
      targetPath: '/counselor/students',
      required: true,
    },
    {
      id: 'counselor-open-student-record',
      kind: 'read_only_discovered_navigation',
      sourcePath: '/counselor/overview?ui=legacy',
      targetPattern: '/counselor/students/[memberId]',
      requiredWhenApplicable: true,
      emptyStateText: 'No members assigned yet',
    },
  ],
};

/** Honest exclusions: these need an attended or mutating test and never count green here. */
export const ATTENDED_ACTION_GATES = {
  member: [
    { id: 'member-resume-upload', reason: 'mutates_member_resume_fixture' },
    { id: 'member-lilley-spoken-session', reason: 'requires_microphone_and_audio' },
    { id: 'member-submit-job-application', reason: 'submits_external_application' },
  ],
  admin: [
    { id: 'admin-production-authentication', reason: 'requires_staff_mfa' },
    { id: 'admin-change-program-enrollment', reason: 'mutates_enrollment' },
    { id: 'admin-send-member-email', reason: 'sends_email' },
  ],
  employer: [
    { id: 'employer-post-or-edit-job', reason: 'mutates_job_record' },
    { id: 'employer-change-applicant-status', reason: 'mutates_application' },
  ],
  partner: [
    { id: 'partner-invite-member', reason: 'sends_invitation' },
  ],
  counselor: [
    { id: 'counselor-production-authentication', reason: 'requires_staff_mfa' },
    { id: 'counselor-send-message-or-nudge', reason: 'sends_member_message' },
    { id: 'counselor-run-session', reason: 'mutates_session_record' },
  ],
};

/**
 * App Router pages that redirect for the audited fixture (including permanent
 * aliases and explicit role/data gates). These are checked as exact redirects,
 * not counted as independently rendered static pages. A fixtureCondition is
 * verified against the authenticated role before its redirect can pass.
 */
export const REDIRECT_ONLY_PATHS = {
  member: [
    {
      path: '/dashboard/mentor',
      target: '/mentor/apply',
      reason: 'member_without_mentor_record',
      fixtureCondition: 'member_without_mentor',
    },
    ...['/dashboard/program/start', '/dashboard/program/employer-screening'].map((path) => ({
      path,
      target: '/dashboard/program',
      reason: 'member_without_active_program_slug',
      fixtureCondition: 'member_without_active_program_slug',
    })),
    {
      path: '/dashboard/ai-tools/application-tracker',
      target: '/dashboard/job-applications',
      reason: 'legacy_alias',
    },
    {
      path: '/dashboard/ai-tools/readiness-coach',
      // The legacy page redirects through /dashboard/ai-tools/studio, whose
      // server page immediately canonicalizes to the consolidated AI tools
      // surface. Playwright follows both hops, so assert the final URL.
      target: '/dashboard/ai-tools?tab=session&agent=readiness',
      reason: 'legacy_alias',
    },
    {
      path: '/dashboard/ai-tools/resume-analysis',
      target: '/dashboard/ai-tools/resume-studio?view=score',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/ai-tools/resume-coach',
      target: '/dashboard/ai-tools/resume-studio?view=coach',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/ai-tools/resume-rewriter',
      target: '/dashboard/ai-tools/resume-studio?view=rewrite',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/ai-tools/studio',
      target: '/dashboard/ai-tools',
      reason: 'legacy_alias',
    },
    {
      path: '/dashboard/assessments',
      target: '/dashboard/assessment',
      reason: 'legacy_plural_alias',
    },
    {
      path: '/dashboard/coursera',
      target: '/dashboard/program',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/program/change',
      target: '/dashboard/program',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/settings',
      target: '/dashboard/profile#settings',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/skills-assessment',
      target: '/dashboard/assessment',
      reason: 'legacy_alias',
    },
    {
      path: '/dashboard/toolkit',
      target: '/dashboard/ai-tools?tab=toolkit',
      reason: 'consolidated_experience',
    },
    {
      path: '/dashboard/training',
      target: '/dashboard/program',
      reason: 'consolidated_experience',
    },
  ],
  admin: [
    ...[
      '/admin/audit-logs',
      '/admin/csp-report',
      '/admin/data-retention',
      '/admin/messages',
      '/admin/webhook-events',
    ].map((path) => ({
      path,
      target: '/admin',
      reason: 'super_admin_only_for_regular_admin_fixture',
      fixtureCondition: 'regular_admin',
    })),
    {
      // Members → Training progress listed the same members a fourth time.
      // The training preset of the one admin roster owns that view now
      // (admin audit 2026-09-20, §7 item 2); the legacy dashboard table stays
      // behind /admin/members/training?ui=legacy. It hops through
      // /admin/training-progress, which itself forwards to the reporting
      // hub's Training tab; Playwright follows both hops, so assert the final URL.
      path: '/admin/members/training',
      target: '/admin/reporting?tab=training',
      reason: 'consolidated_experience',
    },
      // The admin reporting cluster (analytics, metrics, board, outcomes,
      // training progress, Coursera, exports) is one hub with server-driven
      // tabs (admin audit 2026-09-19, §6.1). Each legacy route forwards to its
      // tab; the pre-kit view of each stays behind `?ui=legacy` only.
    {
      path: '/admin/analytics',
      target: '/admin/reporting',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/metrics',
      target: '/admin/reporting',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/board',
      target: '/admin/reporting?tab=outcomes',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/outcomes',
      target: '/admin/reporting?tab=outcomes',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/training-progress',
      target: '/admin/reporting?tab=training',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/coursera',
      target: '/admin/reporting?tab=coursera',
      reason: 'consolidated_experience',
    },
    {
      path: '/admin/exports',
      target: '/admin/reporting?tab=exports',
      reason: 'consolidated_experience',
    },
  ],
  employer: [],
  partner: [
    {
      path: '/partner/members',
      target: '/partner/referred-members',
      reason: 'renamed_route_alias',
    },
    {
      path: '/partner/members/[id]',
      target: '/partner/referred-members/[memberId]',
      reason: 'renamed_route_alias',
    },
    {
      // Next redirects this legacy URL before the protected partner layout.
      // The public Astro page owns the actual registration form.
      path: '/partner/signup',
      target: '/partners#partner-signup',
      reason: 'legacy_alias',
    },
  ],
  counselor: [
    {
      path: '/counselor',
      // The counselor root lands on Today (one attention list, audit 2026-09-20 §6.1);
      // the Caseload overview is audited at /counselor/overview.
      target: '/counselor/today',
      reason: 'landing_page',
    },
  ],
};

/**
 * Small, read-only production coverage for roles that do not require an
 * attended MFA ceremony. Staff coverage remains an explicit attended gate in
 * production; exhaustive five-role evidence belongs on the isolated preview.
 */
export const PRODUCTION_CANARY_PATHS = {
  member: ['/dashboard'],
  employer: ['/employer'],
  partner: ['/partner'],
};

export const PRODUCTION_CANARY_ROLES = Object.freeze(
  Object.keys(PRODUCTION_CANARY_PATHS)
);

export const SECTION_LOGIN_REDIRECT = {
  member: '/dashboard',
  admin: '/admin',
  employer: '/employer',
  partner: '/partner',
  counselor: '/counselor',
};

/** Access probes use the rendered counselor landing, not its redirect-only root. */
export const ROLE_ACCESS_ROOTS = {
  ...SECTION_LOGIN_REDIRECT,
  counselor: '/counselor/today',
};

/**
 * Explicit portal isolation contract. Admins may intentionally open the
 * counselor workspace; every other cross-portal root must deny or redirect.
 */
export const ROLE_ACCESS_MATRIX = {
  member: {
    allowed: ['member'],
    denied: ['admin', 'employer', 'partner', 'counselor'],
  },
  admin: {
    allowed: ['admin', 'counselor'],
    denied: ['member', 'employer', 'partner'],
  },
  employer: {
    allowed: ['employer'],
    denied: ['member', 'admin', 'partner', 'counselor'],
  },
  partner: {
    allowed: ['partner'],
    denied: ['member', 'admin', 'employer', 'counselor'],
  },
  counselor: {
    allowed: ['counselor'],
    denied: ['member', 'admin', 'employer', 'partner'],
  },
};
