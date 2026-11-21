/** Pure constants and helpers — safe for both server and client components. */

export const POINT_VALUES: Record<string, number> = {
  assessment_completed:    100,
  program_enrolled:        150,
  resume_uploaded:          50,
  course_completed:         75,
  pathway_step_completed:   15,
  certification_earned:    200,
  interview_requested:     100,
  counselor_session:        50,
  job_application:          25,
  placement_recorded:      500,
  counselor_bonus:           0,
  // Member-to-member referral. Both sides rewarded, but only once the referee
  // actually enrolls in a program (not at signup) — see lib/member/referrals.ts.
  referral_referrer_reward: 150,
  referral_referee_reward:  100,
  // Daily-activity streak driver — awarded at most once per UTC calendar day
  // per member (see lib/xapi/inboundStatementPipeline.ts). entityId is the
  // UTC date string, so PointsTransaction's (userId, event, entityId) unique
  // constraint enforces the once-per-day cap.
  daily_study:               5,
};

export const LEVELS = [
  { name: 'starter',  min: 0,    max: 199,      label: 'Starter',  color: '#6b7280' },
  { name: 'builder',  min: 200,  max: 499,      label: 'Builder',  color: '#2563eb' },
  { name: 'achiever', min: 500,  max: 999,      label: 'Achiever', color: '#7c3aed' },
  { name: 'champion', min: 1000, max: Infinity, label: 'Champion', color: '#d97706' },
] as const;

export type LevelName = 'starter' | 'builder' | 'achiever' | 'champion';

export function getLevelForPoints(points: number) {
  return LEVELS.find((l) => points >= l.min && points <= l.max) ?? LEVELS[0];
}

export function getNextLevel(current: LevelName) {
  const idx = LEVELS.findIndex((l) => l.name === current);
  return idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

export const EVENT_LABELS: Record<string, string> = {
  assessment_completed:   'Completed Training Preassessment',
  program_enrolled:       'Enrolled in program',
  resume_uploaded:        'Uploaded resume',
  course_completed:       'Completed a course',
  pathway_step_completed: 'Completed a learning step',
  certification_earned:   'Earned a certification',
  interview_requested:    'Requested interview',
  counselor_session:      'AI Counselor session',
  job_application:        'Added a job application',
  placement_recorded:     'Job placement confirmed',
  counselor_bonus:        'Bonus from counselor',
  referral_referrer_reward: 'A friend you referred enrolled',
  referral_referee_reward:  'Joined through a friend’s referral',
  daily_study:              'Studied today',
};

/**
 * Events production code actually awards through `awardPoints()`. Keep this in
 * sync with those call sites — grep for `awardPoints(` before adding one.
 * Anything outside this set must not be promised to a member.
 *
 *   - assessment_completed   → app/api/member/assessment/submit/route.ts
 *   - program_enrolled       → app/api/member/enroll/route.ts
 *   - course_completed       → lib/member/courseCompletion.ts
 *   - counselor_session      → app/api/counselor/feedback/route.ts
 *   - placement_recorded     → app/api/admin/placements/route.ts
 *   - certification_earned   → lib/certifications/certificationApproved.ts
 *   - interview_requested    → app/api/member/interview-request/route.ts
 *   - resume_uploaded        → app/api/member/resume/upload/route.ts
 *   - job_application        → app/api/(portal)/dashboard/jobs/[id]/apply/route.ts
 *                              + app/api/member/job-applications/route.ts
 *                              + app/api/member/job-applications/log-external/route.ts
 *                              + app/api/member/applications/route.ts
 *                              + app/api/member/applications/[id]/route.ts
 *   - pathway_step_completed → app/api/member/pathway-steps/[pathwayId]/[stepIndex]/complete/route.ts
 *   - daily_study            → lib/xapi/inboundStatementPipeline.ts
 *
 * `counselor_bonus` is staff-awarded with a custom amount, and the referral
 * rewards go through `createMany`, so neither is member-earnable here.
 */
export const WIRED_EVENTS = new Set<string>([
  'assessment_completed',
  'program_enrolled',
  'course_completed',
  'counselor_session',
  'placement_recorded',
  'certification_earned',
  'interview_requested',
  'resume_uploaded',
  'job_application',
  'pathway_step_completed',
  'daily_study',
]);
