/**
 * Student "health score" indicator for the admin members list.
 * Red/Yellow/Green based on login recency and activity levels.
 */

export type HealthStatus = 'green' | 'yellow' | 'red';

/**
 * `member_events` rows the platform writes *to* a member — nudge emails, the
 * weekly recap digest, staff follow-up flags. They are evidence that we
 * contacted the member, never that the member did anything, so Health must not
 * read them as activity (admin number audit 2026-09-20, S1: counting them
 * printed "Active" for 114 members with no sign-in in 30+ days).
 *
 * Both spellings of the reminder event are listed: historic rows were written
 * with the upper-case constant name, newer ones with the slug, and Prisma's
 * `notIn` is case-sensitive.
 */
export const SYSTEM_GENERATED_MEMBER_EVENTS = [
  // Cron / platform mail and digests.
  'inactive_nudge_sent',
  'weekly_recap_generated',
  'course_accountability_sent',
  'certification_celebration_sent',
  'counselor_followup_needed',
  'application_reminder_sent',
  'APPLICATION_REMINDER_SENT',
  'course_kickoff_email_sent',
  // Staff actions recorded under the member's userId: a counselor nudging or
  // an admin approving something is the staff member acting, not the member.
  'application_approved',
  'application_denied',
  'counselor_nudge_sent',
  'counselor_bulk_followup_sent',
  'counselor_inbox_zero_follow_up_sent',
  'milestone_cascade_sent',
  'program_change_approved',
  'employer_intro_created',
] as const;

/**
 * Spread into any `member_events` where-clause that feeds
 * `calculateHealthStatus`, so every Health reader counts the same rows.
 * Deliberately structural (not `Prisma.MemberEventWhereInput`) so this module
 * stays importable from client components.
 */
export const MEMBER_ACTIVITY_EVENT_WHERE: { eventName: { notIn: string[] } } = {
  eventName: { notIn: [...SYSTEM_GENERATED_MEMBER_EVENTS] },
};

const DAY_MS = 1000 * 60 * 60 * 24;
const RECENT_WINDOW_DAYS = 30;

/**
 * What counts as member activity, per Mike (2026-09-20): a login, any
 * Coursera / course action, and any use of the AI tools and skills features.
 * Emails and notifications the platform sends *to* the member do not count —
 * see `SYSTEM_GENERATED_MEMBER_EVENTS`.
 *
 * The three signals arrive separately because they live in three tables:
 *   - `lastEventAt` / `recentEventCount`: member-driven `member_events` rows
 *     (AI tool runs, skills, portal actions), already filtered with
 *     `MEMBER_ACTIVITY_EVENT_WHERE`.
 *   - `lastLoginAt`: `users.last_login_at`.
 *   - `lastCourseActivityAt`: the newest `course_progress.last_activity_at`
 *     (Coursera and course work never writes a `member_events` row, so a
 *     learner who only studies used to score red).
 *
 * The two course/login fields are optional so existing callers keep their
 * current behaviour until they pass them.
 */
export interface HealthScoreInput {
  lastEventAt: Date | null;
  recentEventCount: number; // member-driven events in last 30 days
  enrolledAt: Date | null;
  lastLoginAt?: Date | null;
  lastCourseActivityAt?: Date | null;
}

function mostRecent(...dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

function isWithinRecentWindow(date: Date | null | undefined, now: number): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return (now - date.getTime()) / DAY_MS <= RECENT_WINDOW_DAYS;
}

export function calculateHealthStatus(input: HealthScoreInput): HealthStatus {
  const now = Date.now();
  const lastActivityAt = mostRecent(input.lastEventAt, input.lastLoginAt, input.lastCourseActivityAt);
  const daysSinceLastActivity = lastActivityAt
    ? Math.floor((now - lastActivityAt.getTime()) / DAY_MS)
    : Infinity;

  // One "did something in the last 30 days" tally across all three signals.
  const recentActivityCount =
    input.recentEventCount +
    (isWithinRecentWindow(input.lastLoginAt, now) ? 1 : 0) +
    (isWithinRecentWindow(input.lastCourseActivityAt, now) ? 1 : 0);
  const hasActivity = recentActivityCount > 0;

  // Red: nothing at all for 14+ days
  if (daysSinceLastActivity >= 14 && !hasActivity) return 'red';

  // Yellow: quiet for 7+ days, or barely any activity while enrolled
  if (daysSinceLastActivity >= 7 || (input.enrolledAt && recentActivityCount <= 1)) return 'yellow';

  // Green: active in last 7 days
  return 'green';
}

export function getHealthColor(status: HealthStatus): string {
  switch (status) {
    case 'green': return '#16a34a';
    case 'yellow': return '#d97706';
    case 'red': return '#dc2626';
  }
}

export function getHealthLabel(status: HealthStatus): string {
  switch (status) {
    case 'green': return 'Active';
    // Not "At Risk": that name collides with the org-wide at-risk alert queue
    // (/admin "Risk alerts"), which is a different rule over different rows.
    // This dot only means "little or no activity" (audit 2026-09-20, S25).
    case 'yellow': return 'Low activity';
    case 'red': return 'Inactive';
  }
}
