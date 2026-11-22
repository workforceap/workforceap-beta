/**
 * Read-only point signals shown beside the monthly draft.
 * Counts and cumulative hours only. Never Class Hrs, Lab Hrs, Time In/Out, or a filled day.
 */
import { REPORTING_TIMEZONE, localEvidenceDate, validDate } from './evidence';

export const ACTIVITY_OBSERVED_LABEL = 'Activity observed — not verified attendance';
export const CUMULATIVE_ESTIMATE_LABEL = 'Cumulative estimate — not verified attendance';

export type AssistiveDaySignal = {
  date: string;
  courseraPoints: number;
  sitePoints: number;
};

export type AssistiveSignals = {
  activityLabel: typeof ACTIVITY_OBSERVED_LABEL;
  cumulativeLabel: typeof CUMULATIVE_ESTIMATE_LABEL;
  timezone: typeof REPORTING_TIMEZONE;
  days: AssistiveDaySignal[];
  coursera: { coursesCompleted: number; learningHours: number | null } | null;
  catalogHours: number | null;
};

export type RawPoint = { timestamp: string };
export type RawSitePoint = { timestamp: string };

function chicagoDate(timestamp: string): string | null {
  try { return localEvidenceDate(timestamp); } catch { return null; }
}

/** Group dated point events onto calendar days. Events that cannot be dated are dropped, not invented. */
export function assistiveSignals(input: {
  month: string;
  courseraPoints: RawPoint[];
  sitePoints: RawSitePoint[];
  coursera: { coursesCompleted: number; learningHours: number | null } | null;
  catalogHours: number | null;
}): AssistiveSignals {
  if (!validDate(`${input.month}-01`)) throw new Error('INVALID_DATE');
  const counts = new Map<string, AssistiveDaySignal>();
  const add = (timestamp: string, field: 'courseraPoints' | 'sitePoints') => {
    const date = chicagoDate(timestamp);
    if (!date || !date.startsWith(`${input.month}-`)) return;
    const row = counts.get(date) ?? { date, courseraPoints: 0, sitePoints: 0 };
    row[field] += 1;
    counts.set(date, row);
  };
  for (const point of input.courseraPoints) add(point.timestamp, 'courseraPoints');
  for (const point of input.sitePoints) add(point.timestamp, 'sitePoints');
  return {
    activityLabel: ACTIVITY_OBSERVED_LABEL,
    cumulativeLabel: CUMULATIVE_ESTIMATE_LABEL,
    timezone: REPORTING_TIMEZONE,
    days: [...counts.values()].sort((a, b) => a.date.localeCompare(b.date)),
    coursera: input.coursera,
    catalogHours: input.catalogHours,
  };
}
