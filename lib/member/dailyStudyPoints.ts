/**
 * Daily-activity points from xAPI.
 *
 * Members' streaks previously only advanced on rare milestone events
 * (assessment/program/course completions), not on the daily lecture/quiz
 * activity captured item-by-item in `XapiStatement`. This module awards a
 * small `daily_study` points event the first time a resolved member's xAPI
 * activity is seen on a given UTC calendar day.
 *
 * Idempotency is delegated to `PointsTransaction`'s
 * `@@unique([userId, event, entityId])` constraint: `entityId` is the UTC
 * date string (e.g. `2026-07-03`), so a second statement on the same day is a
 * no-op award (see `awardPoints` in lib/member/points.ts) rather than a
 * second row.
 */

/**
 * Format a Date as its UTC calendar day, e.g. `2026-07-03`.
 * Pure + exported so it can be unit-tested without a database.
 */
export function utcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The `daily_study` award key for one xAPI statement, or null when it must not
 * award (WAP-276). "Studied today" means the learner's own event time falls on
 * the current UTC day. Keying on the processing time instead let the hourly
 * auto-heal replay of old statements award a point and a streak day on days
 * the member never studied. A statement with no trustworthy learner time
 * never awards: received/replay time is not learner activity.
 */
export function dailyStudyAwardKey(learnerAt: Date | null, now: Date = new Date()): string | null {
  if (!learnerAt) return null;
  const key = utcDateKey(learnerAt);
  return key === utcDateKey(now) ? key : null;
}
