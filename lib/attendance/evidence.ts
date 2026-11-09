import { createHash } from 'node:crypto';

export const REPORTING_TIMEZONE = 'America/Chicago';
export const ESTIMATE_NOTICE = 'estimated, not certified';
export type SheetKind = 'weekly' | 'monthly' | 'yearly';
export type Evidence = {
  /** Underlying evidence identity, not an import-row ID. */
  sourceKey: string;
  date: string;
  kind: 'verified-duration' | 'estimated' | 'W' | 'CR' | 'A';
  minutes?: number;
  reference: string;
  verifiedBy: string | null;
  reason: string;
};
export type Day = {
  date: string;
  actualMinutes: number | null;
  estimatedMinutes: number | null;
  codes: Array<'P' | 'W' | 'CR' | 'A'>;
  evidenceKeys: string[];
};
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function requireDate(value: string): Date {
  if (!validDate(value)) throw new Error('INVALID_DATE');
  return new Date(`${value}T12:00:00Z`);
}
export function localEvidenceDate(timestamp: string): string {
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) throw new Error('TIMESTAMP_OFFSET_REQUIRED');
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_TIMESTAMP');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORTING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function periodDates(kind: SheetKind, selected: string, startMonth: number | null): string[] {
  const start = requireDate(selected);
  let end: Date;
  if (kind === 'weekly') {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  } else if (kind === 'monthly') {
    start.setUTCDate(1);
    end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (kind === 'yearly') {
    if (!Number.isInteger(startMonth) || startMonth! < 1 || startMonth! > 12) throw new Error('ENROLLMENT_START_MONTH_REQUIRED');
    const year = start.getUTCFullYear() - (start.getUTCMonth() + 1 < startMonth! ? 1 : 0);
    start.setUTCFullYear(year, startMonth! - 1, 1);
    end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else throw new Error('INVALID_SHEET_KIND');
  const dates: string[] = [];
  for (const day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  return dates;
}
function boundedText(value: string, max: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
export function validateEvidence(row: Evidence): void {
  if (!validDate(row.date) || !boundedText(row.sourceKey, 200) || !boundedText(row.reference, 500) || !boundedText(row.reason, 1000)) throw new Error('INVALID_EVIDENCE');
  if (!['verified-duration', 'estimated', 'W', 'CR', 'A'].includes(row.kind)) throw new Error('INVALID_EVIDENCE_KIND');
  if (row.kind !== 'estimated' && !boundedText(row.verifiedBy ?? '', 100)) throw new Error('VERIFIER_REQUIRED');
  if (row.kind === 'verified-duration' || row.kind === 'estimated') {
    if (!Number.isInteger(row.minutes) || row.minutes! < 0 || row.minutes! > 1440) throw new Error('INVALID_MINUTES');
  } else if (row.minutes !== undefined) throw new Error('CODE_IS_NOT_ACTUAL_HOURS');
}
/** Stable JSON binds values rather than object-key insertion order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  throw new Error('NON_CANONICAL_VALUE');
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function summarize(dates: string[], input: Evidence[]): Day[] {
  if (input.length > 10000 || dates.length > 366 || new Set(dates).size !== dates.length || dates.some(d => !validDate(d))) throw new Error('INVALID_COVERAGE');
  const unique = new Map<string, Evidence>();
  for (const row of input) {
    validateEvidence(row);
    const previous = unique.get(row.sourceKey);
    if (previous && canonical(previous) !== canonical(row)) throw new Error('CONFLICTING_EVIDENCE_IDENTITY');
    unique.set(row.sourceKey, row);
  }
  return dates.map(date => {
    const rows = [...unique.values()].filter(row => row.date === date);
    const verified = rows.filter(row => row.kind === 'verified-duration');
    const estimates = rows.filter(row => row.kind === 'estimated');
    // One authoritative daily total avoids course/item/badge overlap.
    // Corrections must supersede prior evidence before reaching this function.
    if (verified.length > 1) throw new Error('AMBIGUOUS_DAILY_TOTAL');
    const actualMinutes = verified[0]?.minutes ?? null;
    const codes: Day['codes'] = [];
    if (actualMinutes !== null && actualMinutes >= 240) codes.push('P');
    for (const code of ['W', 'CR', 'A'] as const) if (rows.some(row => row.kind === code)) codes.push(code);
    if (codes.includes('A') && (actualMinutes !== null || codes.length > 1)) throw new Error('CONFLICTING_ABSENCE_EVIDENCE');
    return { date, actualMinutes, estimatedMinutes: estimates.length ? Math.max(...estimates.map(row => row.minutes!)) : null, codes, evidenceKeys: rows.map(row => row.sourceKey).sort() };
  });
}
