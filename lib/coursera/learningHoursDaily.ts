/**
 * Daily Coursera study minutes from cumulative learning-hours snapshots.
 *
 * Coursera only reports a running total of learning hours per learner and
 * course. The student sign-in timesheet needs minutes per day, so we keep one
 * cumulative reading per Central-time day (`coursera_learning_hours_snapshots`)
 * and take the difference between consecutive days.
 *
 * Pure module: no Prisma, no clock. Kept separate so the timesheet code and
 * its tests can use it without a database.
 *
 * Rules:
 *   - Minutes are exact (hours * 60, rounded to the nearest whole minute).
 *     Rounding up for a printed sheet is the sheet's job, not this one's.
 *   - The first reading for a course has no earlier day to compare with, so
 *     its day is `unknown` with reason `NO_PREVIOUS_SNAPSHOT`.
 *   - A total that went down (Coursera re-aggregated or reset a course) is
 *     `unknown` with reason `TOTAL_DECREASED`. It is never a negative day and
 *     never clamped to zero, because either would be a guess.
 *   - Days with no reading between two readings get no row. The minutes that
 *     accrued across the gap land on the next day that has a reading and are
 *     flagged with `gapDays` so a reviewer can see they span more than a day.
 */

export const LEARNING_HOURS_REPORTING_TIMEZONE = 'America/Chicago';

export type LearningHoursSnapshotPoint = {
  /** Coursera course id the cumulative total belongs to. */
  courseraCourseId: string;
  /** Central-time calendar day, `YYYY-MM-DD`. */
  snapshotDate: string;
  /** Cumulative learning hours Coursera reported as of that day. */
  learningHours: number;
};

export type DailyCourseraMinutes =
  | {
      date: string;
      courseraCourseId: string;
      status: 'known';
      minutes: number;
      /** Calendar days since the previous reading minus one (0 = consecutive). */
      gapDays: number;
    }
  | {
      date: string;
      courseraCourseId: string;
      status: 'unknown';
      reason: 'NO_PREVIOUS_SNAPSHOT' | 'TOTAL_DECREASED' | 'INVALID_HOURS';
    };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(date: string): number {
  if (!DATE_RE.test(date)) throw new Error(`INVALID_SNAPSHOT_DATE: ${date}`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new Error(`INVALID_SNAPSHOT_DATE: ${date}`);
  }
  return Math.round(ms / 86_400_000);
}

/** Central-time calendar day for an instant, `YYYY-MM-DD`. */
export function centralDateKey(at: Date): string {
  if (!Number.isFinite(at.getTime())) throw new Error('INVALID_CAPTURE_TIME');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEARNING_HOURS_REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Pick the cumulative hours from a Coursera gradebook row. Prefers the exact
 * `totalLearningHours`, falls back to `approxTotalLearningHrs`. Returns null
 * when neither is a finite, non-negative number, so callers skip the write.
 */
export function pickGradebookLearningHours(row: {
  totalLearningHours?: unknown;
  approxTotalLearningHrs?: unknown;
}): number | null {
  for (const value of [row.totalLearningHours, row.approxTotalLearningHrs]) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Turn cumulative snapshots into per-day minutes, one row per course per day
 * that has a reading. Input order does not matter. If two points share a
 * course and day, the larger total wins (the table keeps the larger reading
 * of a day too).
 */
export function dailyCourseraMinutes(points: LearningHoursSnapshotPoint[]): DailyCourseraMinutes[] {
  const byCourse = new Map<string, Map<string, number>>();
  for (const p of points) {
    dayNumber(p.snapshotDate);
    const days = byCourse.get(p.courseraCourseId) ?? new Map<string, number>();
    const prev = days.get(p.snapshotDate);
    const hours = Number.isFinite(p.learningHours) && p.learningHours >= 0 ? p.learningHours : Number.NaN;
    if (prev === undefined || Number.isNaN(prev) || (!Number.isNaN(hours) && hours > prev)) {
      days.set(p.snapshotDate, hours);
    }
    byCourse.set(p.courseraCourseId, days);
  }

  const out: DailyCourseraMinutes[] = [];
  for (const [courseraCourseId, days] of byCourse) {
    const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
    let previous: { date: string; hours: number } | null = null;
    for (const [date, hours] of ordered) {
      if (Number.isNaN(hours)) {
        out.push({ date, courseraCourseId, status: 'unknown', reason: 'INVALID_HOURS' });
        continue;
      }
      if (!previous) {
        out.push({ date, courseraCourseId, status: 'unknown', reason: 'NO_PREVIOUS_SNAPSHOT' });
      } else if (hours < previous.hours) {
        out.push({ date, courseraCourseId, status: 'unknown', reason: 'TOTAL_DECREASED' });
      } else {
        out.push({
          date,
          courseraCourseId,
          status: 'known',
          minutes: Math.round((hours - previous.hours) * 60),
          gapDays: dayNumber(date) - dayNumber(previous.date) - 1,
        });
      }
      previous = { date, hours };
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.courseraCourseId.localeCompare(b.courseraCourseId),
  );
}
