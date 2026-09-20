/**
 * Pure attention predicates. Each one implements exactly one row of the rule
 * table in `reasons.ts`; `evaluate.ts` composes them per member.
 *
 * Every predicate takes `now` so the rules are deterministic under test.
 * Nothing here touches the database.
 */

import { ATTENTION_THRESHOLDS as T } from './reasons';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor(Math.max(0, to.getTime() - from.getTime()) / DAY_MS);
}

export function hoursBetween(from: Date, to: Date): number {
  return Math.floor(Math.max(0, to.getTime() - from.getTime()) / HOUR_MS);
}

/**
 * Whole days a member has been quiet, or `null` when we cannot tell.
 *
 * With no activity event ever recorded the anchor is the enrollment date
 * (falling back to account creation): a member who enrolled this morning has
 * not "gone quiet", they have not started yet. The returned count is then the
 * anchor's age; `measured` says whether a real event backs it.
 */
export function quietDays(
  lastActivityAt: Date | null,
  anchorAt: Date | null,
  now: Date,
): { days: number | null; measured: boolean } {
  if (lastActivityAt) return { days: daysBetween(lastActivityAt, now), measured: true };
  if (!anchorAt) return { days: null, measured: false };
  return { days: daysBetween(anchorAt, now), measured: false };
}

/**
 * Enrolled and quiet for at least `thresholdDays`. A member with no activity
 * ever and no anchor date is treated as quiet (nothing says otherwise).
 */
export function isQuietFor(
  thresholdDays: number,
  lastActivityAt: Date | null,
  isEnrolled: boolean,
  anchorAt: Date | null,
  now: Date,
): boolean {
  if (!isEnrolled) return false;
  const { days } = quietDays(lastActivityAt, anchorAt, now);
  if (days == null) return true;
  return days >= thresholdDays;
}

export function isNoActivityCritical(
  lastActivityAt: Date | null,
  isEnrolled: boolean,
  anchorAt: Date | null,
  now: Date,
): boolean {
  return isQuietFor(T.NO_ACTIVITY_CRITICAL_DAYS, lastActivityAt, isEnrolled, anchorAt, now);
}

/** Warning band: quiet 10–29 days. The critical rule owns 30+. */
export function isNoActivityWarning(
  lastActivityAt: Date | null,
  isEnrolled: boolean,
  anchorAt: Date | null,
  now: Date,
): boolean {
  if (!isEnrolled) return false;
  const { days } = quietDays(lastActivityAt, anchorAt, now);
  if (days == null) return false;
  return days >= T.NO_ACTIVITY_WARNING_DAYS && days < T.NO_ACTIVITY_CRITICAL_DAYS;
}

/**
 * Reply SLA. `lastMemberMessageAt` is the timestamp of the member's message
 * ONLY when it is the latest message in the thread (i.e. unanswered).
 */
export function replyOverdue(
  lastMemberMessageAt: Date | null,
  now: Date,
): 'sla_breach_48h' | 'sla_warning_24h' | null {
  if (!lastMemberMessageAt) return null;
  const ageMs = now.getTime() - lastMemberMessageAt.getTime();
  if (ageMs >= T.REPLY_BREACH_HOURS * HOUR_MS) return 'sla_breach_48h';
  if (ageMs >= T.REPLY_WARNING_HOURS * HOUR_MS) return 'sla_warning_24h';
  return null;
}

/**
 * The assigned counselor has not written in 7+ days (or never). Members
 * without an active assignment are out of scope — nobody owes them contact
 * yet; `new_no_counselor` covers them.
 */
export function isCounselorContactOverdue(
  assignedAt: Date | null,
  lastStaffMessageAt: Date | null,
  now: Date,
): boolean {
  if (!assignedAt) return false;
  if (!lastStaffMessageAt) return true;
  return now.getTime() - lastStaffMessageAt.getTime() > T.COUNSELOR_CONTACT_DAYS * DAY_MS;
}

/** No resume 3+ days after the anchor (assignment date, else account creation). */
export function isResumeMissing(hasResume: boolean, anchorAt: Date | null, now: Date): boolean {
  if (hasResume) return false;
  if (!anchorAt) return false;
  return now.getTime() - anchorAt.getTime() > T.RESUME_MISSING_DAYS * DAY_MS;
}

const OPEN_APPLICATION_STATUSES = new Set(['PENDING', 'NEEDS_INFO']);

export function applicationReason(
  status: string | null,
): 'pending_application' | 'missing_info' | null {
  if (status === 'PENDING') return 'pending_application';
  if (status === 'NEEDS_INFO') return 'missing_info';
  return null;
}

export function isApplicationStalled(
  anchorAt: Date | null,
  status: string | null,
  now: Date,
): boolean {
  if (!anchorAt || !status || !OPEN_APPLICATION_STATUSES.has(status)) return false;
  return now.getTime() - anchorAt.getTime() > T.APPLICATION_STALLED_DAYS * DAY_MS;
}

/** A stale-training flag counts for 14 days; future timestamps are ignored. */
export function isStaleTraining(staleTrainingDetectedAt: Date | null, now: Date): boolean {
  if (!staleTrainingDetectedAt) return false;
  const ageMs = now.getTime() - staleTrainingDetectedAt.getTime();
  return ageMs >= 0 && ageMs <= T.STALE_TRAINING_WINDOW_DAYS * DAY_MS;
}

/** Quiz flag with no follow-up event recorded since. */
export function needsComputerSupportFollowUp(
  needsFollowUp: boolean,
  lastFollowUpEventAt: Date | null,
): boolean {
  return needsFollowUp && lastFollowUpEventAt === null;
}

/**
 * Milestone in the last 7 days that the counselor has not acknowledged (no
 * staff message since the milestone).
 */
export function isMilestoneRecent(
  milestoneAt: Date | null,
  lastStaffMessageAt: Date | null,
  now: Date,
): boolean {
  if (!milestoneAt) return false;
  const ageMs = now.getTime() - milestoneAt.getTime();
  if (ageMs < 0 || ageMs > T.MILESTONE_WINDOW_DAYS * DAY_MS) return false;
  if (!lastStaffMessageAt) return true;
  return lastStaffMessageAt.getTime() < milestoneAt.getTime();
}

/** Joined in the last 7 days and nobody owns them yet. */
export function isNewWithoutCounselor(
  createdAt: Date,
  assignedAt: Date | null,
  now: Date,
): boolean {
  if (assignedAt) return false;
  return now.getTime() - createdAt.getTime() <= T.NEW_MEMBER_WINDOW_DAYS * DAY_MS;
}
