/**
 * Calendar-date math for the two-stage J5/J6 documents. Dates are plain
 * `YYYY-MM-DD` strings (no time, no time zone) so a class start never shifts
 * by a day between the server, the PDF and the database `DATE` column.
 */
import { CLASS_LENGTH_CALENDAR_MONTHS, CONTENT_VERSION, type ContentVersion } from './constants';

/** Time zone used to decide "today" for the class-start gate (WorkforceAP is in Texas). */
export const BILLING_TIME_ZONE = 'America/Chicago';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CalendarDate = { year: number; month: number; day: number };

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse a real calendar date (rejects 2027-02-29, 2026-13-01, 2026-9-1 ...). */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

function format({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function requireDate(value: string): CalendarDate {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${value}`);
  return parsed;
}

/**
 * Add whole calendar months, clamping to the last day of the target month
 * when the start day does not exist there (Jan 31 + 1 month = Feb 28/29).
 */
export function addCalendarMonthsClamped(isoDate: string, months: number): string {
  if (!Number.isInteger(months)) throw new RangeError('months must be an integer');
  const start = requireDate(isoDate);
  const zeroBased = start.year * 12 + (start.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return format({ year, month, day: Math.min(start.day, daysInMonth(year, month)) });
}

/** New terms use six calendar months; frozen V1 documents retain their five-month rule. */
export function classEndDate(classStartDate: string, contentVersion: ContentVersion = CONTENT_VERSION): string {
  if (contentVersion !== 1 && contentVersion !== CONTENT_VERSION) throw new RangeError('Unsupported billing content version');
  return addCalendarMonthsClamped(classStartDate, contentVersion === 1 ? 5 : CLASS_LENGTH_CALENDAR_MONTHS);
}

export function addDays(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer');
  const { year, month, day } = requireDate(isoDate);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return format({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const x = requireDate(a);
  const y = requireDate(b);
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86_400_000);
}

/** -1, 0 or 1. Both arguments must be calendar dates. */
export function compareIsoDates(a: string, b: string): number {
  requireDate(a);
  requireDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The calendar date of `now` in the billing time zone. */
export function billingToday(now: Date, timeZone: string = BILLING_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "September 30, 2026" for a calendar date, independent of the host time zone. */
export function formatLongCalendarDate(isoDate: string): string {
  const { year, month, day } = requireDate(isoDate);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[month - 1]} ${day}, ${year}`;
}
