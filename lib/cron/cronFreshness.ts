/**
 * Is a scheduled job still succeeding on time? Pure helpers behind the
 * "Overdue" / "Never run" flags on /admin/crons (X03 part 3).
 *
 * The expected interval comes from the job's vercel.json expression
 * (lib/admin/cronScheduleKey.ts CRON_EXPRESSION_BY_JOB). A job is overdue when
 * more than OVERDUE_INTERVAL_MULTIPLE intervals have passed since its last
 * SUCCESS, which leaves room for one missed or slow invocation before it is
 * flagged.
 */

export type CronFreshness = 'ok' | 'overdue' | 'never_run' | 'unknown';

/** Flag a job once this many expected intervals have passed since its last success. */
const OVERDUE_INTERVAL_MULTIPLE = 2;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 10080;
/** The longest month: a monthly job's gap is never more than 31 days. */
const MINUTES_PER_LONGEST_MONTH = 44640;

const INT = /^\d+$/;
const STEP = /^\*\/(\d+)$/;

function inRange(value: string, min: number, max: number): boolean {
  if (!INT.test(value)) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

/** `*\/N` with min <= N <= max, else null. */
function step(value: string, min: number, max: number): number | null {
  const m = STEP.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= min && n <= max ? n : null;
}

/**
 * The longest gap, in minutes, between two scheduled runs of a 5-field cron
 * expression, for the shapes vercel.json uses. Anything else returns null
 * rather than a guess, and such a job is never flagged overdue.
 */
export function expectedIntervalMinutes(expression: string): number | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (month !== '*') return null;
  const anyDay = dayOfMonth === '*' && dayOfWeek === '*';

  const everyMinutes = step(minute, 1, 59);
  if (everyMinutes !== null) return hour === '*' && anyDay ? everyMinutes : null;
  if (!inRange(minute, 0, 59)) return null;

  if (hour === '*') return anyDay ? MINUTES_PER_HOUR : null;
  const everyHours = step(hour, 1, 23);
  if (everyHours !== null) return anyDay ? everyHours * MINUTES_PER_HOUR : null;
  if (!inRange(hour, 0, 23)) return null;

  if (anyDay) return MINUTES_PER_DAY;
  if (dayOfMonth === '*') return inRange(dayOfWeek, 0, 7) ? MINUTES_PER_WEEK : null;
  if (dayOfWeek !== '*') return null;
  if (inRange(dayOfMonth, 1, 31)) return MINUTES_PER_LONGEST_MONTH;
  // `*/N` runs on days 1, 1+N, ... and restarts on the 1st, so no gap exceeds N days.
  const everyDays = step(dayOfMonth, 1, 31);
  return everyDays !== null ? everyDays * MINUTES_PER_DAY : null;
}

interface CronFreshnessInput {
  /** The job's vercel.json expression, or null when nothing schedules it. */
  expr: string | null;
  /** startedAt of the job's most recent SUCCESS row, or null if it has none. */
  lastSuccessAt: Date | null;
  /** startedAt of the job's most recent row of any status, or null if it has none. */
  lastRunAt: Date | null;
  now: Date;
  /** False when the job is switched off (its latest run was SKIPPED). A disabled job is never overdue. */
  enabled?: boolean;
}

/**
 * - `never_run`: scheduled, but no CronExecution row exists at all.
 * - `overdue`: scheduled with a known interval, and either it has never
 *   succeeded or its last success is more than 2 intervals old.
 * - `unknown`: not scheduled, disabled, or an expression we cannot bound.
 * - `ok`: otherwise.
 */
export function cronFreshness({ expr, lastSuccessAt, lastRunAt, now, enabled = true }: CronFreshnessInput): CronFreshness {
  if (!expr) return 'unknown';
  if (!lastRunAt && !lastSuccessAt) return 'never_run';
  if (!enabled) return 'unknown';
  const interval = expectedIntervalMinutes(expr);
  if (interval === null) return 'unknown';
  if (!lastSuccessAt) return 'overdue';
  const sinceSuccessMs = now.getTime() - lastSuccessAt.getTime();
  return sinceSuccessMs > OVERDUE_INTERVAL_MULTIPLE * interval * 60_000 ? 'overdue' : 'ok';
}
