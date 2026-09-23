/**
 * CSV cell helpers for CSVs built in the browser (admin downloads) and small
 * route handlers. Pure — safe to import from client components.
 *
 * Strings go through `csvEscape` from `@/lib/csv`, which prefixes `'` to a
 * value starting with `=+-@\t\r` so Excel/Sheets show it as text instead of
 * running it as a formula, and quotes values containing `"` `,` or a newline.
 * Numbers are written as-is so a negative number stays a number.
 */
import { csvEscape } from '@/lib/csv';

export type CsvCellValue = string | number | bigint | null | undefined;

/** One CSV cell: numbers unguarded, strings formula-guarded and quoted when needed, null → ''. */
export function csvCell(v: CsvCellValue): string {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return csvEscape(String(v));
}

/**
 * Rows of flat objects → CSV. The header row is the first row's keys (in
 * insertion order); every row writes those keys in that order. Lines are
 * joined with `\n`. No rows → ''.
 */
export function objectsToCsv(rows: Record<string, CsvCellValue>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\n');
}
