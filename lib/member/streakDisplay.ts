/**
 * Read-side streak arithmetic. Dependency free so the member dashboard loader,
 * the points page, the profile header and any staff view can share it.
 *
 * `MemberPoints.currentStreak` is a stored counter that only changes when the
 * member is next active (`computeNextStreak`), so on its own it says how long
 * the streak *was*, not whether it is still alive. A streak is alive only when
 * the last active UTC day is today or yesterday; otherwise the member has lost
 * it and every surface must show 0, never the stale counter.
 */
export type StoredStreakLike = {
  currentStreak: number | null | undefined;
  lastActiveDate: Date | string | null | undefined;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC days between the last active day and `now` (now - last). */
export function daysSinceLastActive(
  lastActiveDate: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (lastActiveDate == null) return null;
  const last = lastActiveDate instanceof Date ? lastActiveDate : new Date(lastActiveDate);
  if (Number.isNaN(last.getTime())) return null;
  return Math.round((toUtcDay(now) - toUtcDay(last)) / MS_PER_DAY);
}

/**
 * The streak a member actually holds right now: the stored counter while the
 * last activity was today or yesterday (UTC), else 0. A row with no
 * `lastActiveDate` has never recorded activity, so it holds no streak.
 */
export function effectiveStreak(prev: StoredStreakLike, now: Date = new Date()): number {
  const stored = Math.max(0, Math.floor(prev.currentStreak ?? 0));
  if (stored === 0) return 0;
  const gap = daysSinceLastActive(prev.lastActiveDate, now);
  if (gap === null) return 0;
  // A future-dated last activity (clock skew) still counts as alive today.
  return gap <= 1 ? stored : 0;
}
