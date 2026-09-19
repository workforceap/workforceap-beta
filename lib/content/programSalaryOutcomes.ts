/**
 * @deprecated Unused legacy calculations retained while catalog authorities
 * are consolidated. These unsourced bands are not wage evidence and must not
 * be imported into pages, APIs, metadata, recommendations or generated copy.
 * The live salary guide provides occupational research links instead.
 */

import type { Program } from './programs';
import { PROGRAMS } from './programs';

export type SalaryRangeK = { lowK: number; highK: number };

/** Extract "$55K-$72K" style range from a program salary line. */
export function parseProgramSalaryRange(salary: string): SalaryRangeK | null {
  const m = salary.match(/\$(\d+)K\s*[-–]\s*\$(\d+)K/i);
  if (!m) return null;
  return { lowK: parseInt(m[1], 10), highK: parseInt(m[2], 10) };
}

export function formatSalaryRangeK(range: SalaryRangeK): string {
  return `$${range.lowK}K–$${range.highK}K`;
}

export function salaryRangeDisplay(program: Program): string {
  const r = parseProgramSalaryRange(program.salary);
  return r ? formatSalaryRangeK(r) : program.salary.replace(/^Starting salary:\s*/i, '').trim();
}

export function salaryMidpointK(program: Program): number {
  const r = parseProgramSalaryRange(program.salary);
  if (!r) return 0;
  return (r.lowK + r.highK) / 2;
}

function levelFromHighK(highK: number, category: string): 'Entry' | 'Mid' | 'Mid-High' | 'High' {
  if (highK >= 120 || (highK >= 110 && ['cloud-data', 'ai-software'].includes(category))) return 'High';
  if (highK >= 95) return 'Mid-High';
  if (highK >= 78) return 'Mid';
  return 'Entry';
}

function rampFromProgram(program: Program, highK: number): 'Easier' | 'Moderate' | 'Steeper' {
  if (program.category === 'digital-literacy') return 'Easier';
  if (program.duration.includes('4-6')) return 'Steeper';
  if (highK >= 105) return 'Steeper';
  if (highK <= 68) return 'Easier';
  return 'Moderate';
}

function levelColor(level: 'Entry' | 'Mid' | 'Mid-High' | 'High'): string {
  if (level === 'High') return '#4a9b4f';
  if (level === 'Mid-High' || level === 'Mid') return '#2b7bb9';
  return '#888';
}

export type SalaryGuideRow = {
  slug: string;
  program: string;
  duration: string;
  salary: string;
  level: 'Entry' | 'Mid' | 'Mid-High' | 'High';
  ramp: 'Easier' | 'Moderate' | 'Steeper';
  color: string;
  midpointK: number;
};

export function buildSalaryGuideRows(): SalaryGuideRow[] {
  const rows = PROGRAMS.map((p) => {
    const r = parseProgramSalaryRange(p.salary);
    const highK = r?.highK ?? 0;
    const level = levelFromHighK(highK, p.category);
    return {
      slug: p.slug,
      program: p.title,
      duration: p.duration.replace(/, 10 hrs\/week/i, '').replace(/10 hrs\/week/i, '~10 hrs/wk').trim(),
      salary: salaryRangeDisplay(p),
      level,
      ramp: rampFromProgram(p, highK),
      color: levelColor(level),
      midpointK: salaryMidpointK(p),
    };
  });
  rows.sort((a, b) => b.midpointK - a.midpointK);
  return rows;
}

export function salaryGuideSummaryStats(rows: SalaryGuideRow[]) {
  if (rows.length === 0) {
    return { highestSalary: '—', highestProgram: '', avgMidpointLabel: '—', over100Count: 0 };
  }
  const top = rows[0];
  const midpoints = rows.map((r) => r.midpointK).filter((m) => m > 0);
  const avgK =
    midpoints.length > 0 ? Math.round(midpoints.reduce((a, b) => a + b, 0) / midpoints.length) : 0;
  const over100Count = rows.filter((r) => {
    const range = parseProgramSalaryRange(
      PROGRAMS.find((p) => p.slug === r.slug)?.salary ?? ''
    );
    return range && range.highK >= 100;
  }).length;
  return {
    highestSalary: top.salary,
    highestProgram: top.program,
    avgMidpointLabel: `$${avgK}K`,
    over100Count,
  };
}
