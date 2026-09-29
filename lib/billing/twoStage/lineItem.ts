/**
 * The single line on both two-stage documents: `Tuition & Fees $7,500.00`.
 * No per-class or syllabus itemization. Whole cents only. Client-safe.
 */
import { TUITION_AND_FEES_CENTS, TUITION_AND_FEES_LABEL } from './constants';

export type TuitionLine = { readonly label: typeof TUITION_AND_FEES_LABEL; readonly amountCents: typeof TUITION_AND_FEES_CENTS };

/** "$7,500.00" from whole cents, without locale-dependent formatting. */
export function formatUsdCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('cents must be a non-negative integer');
  const dollars = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollars}.${String(cents % 100).padStart(2, '0')}`;
}

/** The one line item. Always exactly one element. */
export function buildTuitionLineItems(): readonly [TuitionLine] {
  return Object.freeze([Object.freeze({ label: TUITION_AND_FEES_LABEL, amountCents: TUITION_AND_FEES_CENTS })]) as readonly [TuitionLine];
}

/** `Tuition & Fees $7,500.00` */
export function tuitionLineText(line: TuitionLine = buildTuitionLineItems()[0]): string {
  return `${line.label} ${formatUsdCents(line.amountCents)}`;
}

/** Throws unless `items` is exactly the one Tuition & Fees $7,500.00 line. */
export function assertSingleTuitionLine(items: ReadonlyArray<{ label: string; amountCents: number }>): void {
  if (items.length !== 1) throw new Error(`Two-stage documents carry exactly one line; got ${items.length}.`);
  const [line] = items;
  if (line.label !== TUITION_AND_FEES_LABEL || line.amountCents !== TUITION_AND_FEES_CENTS) {
    throw new Error(`The only line must be "${TUITION_AND_FEES_LABEL} ${formatUsdCents(TUITION_AND_FEES_CENTS)}".`);
  }
}
