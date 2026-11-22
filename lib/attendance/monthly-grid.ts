/**
 * WFS Capital Area monthly training sheet geometry.
 * Six Sunday–Saturday weeks. Unknown days stay blank — never zero.
 * Class and lab hours come only from staff-entered minutes.
 */
import { validDate, type Day } from './evidence';

export const MONTHLY_WEEKS = 6;
export const WEEK_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
export const COURSE_BLOCKS = 4;

export type MonthlyHours = { classMinutes: number | null; labMinutes: number | null };

export type MonthlyWeekCell = {
  date: string | null;
  classHours: string | null;
  labHours: string | null;
};

export type MonthlyWeekTotals = { classHours: string | null; labHours: string | null; totalHours: string | null };

export type MonthlyGrid = {
  weeks: MonthlyWeekCell[][];
  weekTotals: MonthlyWeekTotals[];
  running: { classHours: string | null; labHours: string | null; totalHours: string | null };
};

function monthStart(iso: string): Date {
  if (!validDate(iso)) throw new Error('INVALID_DATE');
  const date = new Date(`${iso.slice(0, 8)}01T12:00:00Z`);
  if (!validDate(date.toISOString().slice(0, 10))) throw new Error('INVALID_DATE');
  return date;
}

/** First Sunday on or before the first of the month. */
export function monthlyGridStart(selectedDate: string): string {
  const start = monthStart(selectedDate);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function printed(minutes: number | null): string | null {
  return minutes === null ? null : (minutes / 60).toFixed(2);
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

function totals(classMinutes: Array<number | null>, labMinutes: Array<number | null>): MonthlyWeekTotals {
  const classTotal = sumKnown(classMinutes);
  const labTotal = sumKnown(labMinutes);
  const parts = [classTotal, labTotal].filter((value): value is number => value !== null);
  return {
    classHours: printed(classTotal),
    labHours: printed(labTotal),
    totalHours: parts.length === 0 ? null : printed(parts.reduce((total, value) => total + value, 0)),
  };
}

/**
 * Staff-entered minutes are Class Hrs. Lab Hrs stay blank until a separate lab entry exists.
 * Absence and other codes are not hours. Days outside the month stay empty.
 */
export function monthlyHoursForDay(day: Day | undefined, inMonth: boolean): MonthlyHours {
  if (!inMonth || !day || day.actualMinutes === null || day.codes.includes('A')) return { classMinutes: null, labMinutes: null };
  return { classMinutes: day.actualMinutes, labMinutes: null };
}

export function buildMonthlyGrid(selectedDate: string, days: Day[]): MonthlyGrid {
  const start = monthStart(selectedDate);
  const month = start.getUTCMonth();
  const year = start.getUTCFullYear();
  const byDate = new Map(days.map(day => [day.date, day]));
  const gridStart = monthlyGridStart(selectedDate);
  const weeks: MonthlyWeekCell[][] = [];
  const weekClass: Array<Array<number | null>> = [];
  const weekLab: Array<Array<number | null>> = [];
  for (let week = 0; week < MONTHLY_WEEKS; week++) {
    const cells: MonthlyWeekCell[] = [];
    const classMinutes: Array<number | null> = [];
    const labMinutes: Array<number | null> = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const iso = addDays(gridStart, week * 7 + weekday);
      const date = new Date(`${iso}T12:00:00Z`);
      const inMonth = date.getUTCMonth() === month && date.getUTCFullYear() === year;
      const hours = monthlyHoursForDay(byDate.get(iso), inMonth);
      cells.push({ date: inMonth ? iso : null, classHours: printed(hours.classMinutes), labHours: printed(hours.labMinutes) });
      if (inMonth) {
        classMinutes.push(hours.classMinutes);
        labMinutes.push(hours.labMinutes);
      }
    }
    weeks.push(cells);
    weekClass.push(classMinutes);
    weekLab.push(labMinutes);
  }
  return {
    weeks,
    weekTotals: weekClass.map((classMinutes, index) => totals(classMinutes, weekLab[index])),
    running: totals(weekClass.flat(), weekLab.flat()),
  };
}
