import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import type { PacketLineItem } from './packetSchema';

/**
 * Client-safe helpers shared by the admin form, the PDF renderer and the
 * emails. No Prisma, no syllabus data, so the browser bundle stays small.
 */
export function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function formatLongDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Long date of an instant (signed, emailed) in the org's operating timezone,
 * so an evening signature in Texas is not dated the next (UTC) day.
 */
export function formatLongDateOfInstant(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: PORTAL_TIMEZONE });
}

export function totalContactHours(items: ReadonlyArray<PacketLineItem>): number {
  return items.reduce((sum, item) => sum + (item.hours ?? 0), 0);
}

/**
 * Split `total` across `weights` proportionally, in whole cents, so the rows
 * always add back up to the total. Any rounding remainder lands on the last
 * row with a positive weight. Zero-weight rows (a class with no hours on
 * file) share the total equally instead of getting $0.
 */
export function allocateAmount(total: number, weights: ReadonlyArray<number>): number[] {
  if (weights.length === 0) return [];
  const totalCents = Math.round(total * 100);
  const positive = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = positive.reduce((a, b) => a + b, 0);
  const effective = weightSum > 0 ? positive : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;

  const cents = effective.map((w) => Math.floor((totalCents * w) / effectiveSum));
  let remainder = totalCents - cents.reduce((a, b) => a + b, 0);
  for (let i = effective.length - 1; i >= 0 && remainder > 0; i--) {
    if (effective[i] > 0) {
      cents[i] += remainder;
      remainder = 0;
    }
  }
  return cents.map((c) => c / 100);
}

export const DRAFT_CURRICULUM_REASON =
  "Not available for billing: this program's curriculum is pending owner verification, so its hours and price are not on the official price list.";

/** Funding basis staff select on the form; never inferred from other data. */
export type FundingBasis = 'wioa_ita' | 'separate_contract';

export const FUNDING_BASIS_LABEL: Record<FundingBasis, string> = {
  wioa_ita: 'WIOA ITA',
  separate_contract: 'Separate contract',
};

/**
 * Capital Area Board's standard WIOA ITA amount: WFSCA Board Plan PY2025-2028,
 * printed pp.63-64 (Board-approved exceptions up to $10,000). It is a
 * board-specific reference used only for a non-blocking review warning, never
 * a charge, an approval or a cap applied to other boards.
 */
export const WFSCA_STANDARD_ITA_AMOUNT = 7500;

/** Non-blocking review warnings shown before signing and recorded at signing. */
export function fundingReviewWarnings(args: { fundingType: FundingBasis | '' | null | undefined; total: number }): string[] {
  if (args.fundingType === 'wioa_ita' && args.total > WFSCA_STANDARD_ITA_AMOUNT) {
    return [
      `The total exceeds ${formatMoney(WFSCA_STANDARD_ITA_AMOUNT)}, the Capital Area Board's standard ITA amount. Confirm the local board's limit and any exception; an exception note is recorded as a staff note, unverified.`,
    ];
  }
  return [];
}

/**
 * Default J6 narrative. Deliberately fact-free: the member, program, classes,
 * amounts, bill-to, funding and reference are printed by the facts block and
 * the RE line, which are generated from the invoice itself.
 */
export function defaultCoverLetterNarrative(providerName: string): string {
  return [
    `Please find enclosed the training invoice (Form J5) from ${providerName} for the participant and program named above.`,
    'The facts below are generated from the signed invoice; the class-by-class breakdown also appears on Form J5. Training is provided at no cost to the participant.',
    "Thank you for your partnership in advancing this participant's career. Please contact me directly with any questions about this enrollment or invoice.",
  ].join('\n\n');
}

/** Staff-recorded funding attestation as it appears in the J6 facts block. */
export type J6FundingFacts = { fundingType: FundingBasis; approvedAmount: number; reference: string };

/**
 * The J6 facts block: every factual statement the cover letter makes, generated
 * from the J5 rows and the funding attestation. Staff cannot edit it; signing
 * freezes it in the snapshot, so J5 and J6 always state the same facts.
 */
export function buildJ6Facts(args: {
  invoiceDate: string | Date;
  dueDate: string | Date | null;
  billToName: string;
  referenceNumber: string | null;
  lineItems: ReadonlyArray<PacketLineItem>;
  funding: J6FundingFacts | null;
}): string[] {
  const total = args.lineItems.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
  const lines = [
    `Invoice date: ${formatLongDate(args.invoiceDate)}; due: ${args.dueDate ? formatLongDate(args.dueDate) : 'Net 30 from receipt'}`,
    `Billed to: ${args.billToName}`,
  ];
  if (args.referenceNumber) lines.push(`Board / ITA / voucher reference: ${args.referenceNumber}`);
  if (args.funding) {
    lines.push(
      `Funding (staff-recorded): ${FUNDING_BASIS_LABEL[args.funding.fundingType]}, reference ${args.funding.reference}, approved amount ${formatMoney(args.funding.approvedAmount)}`,
    );
  }
  args.lineItems.forEach((row, i) => {
    lines.push(`${i + 1}. ${row.description}${row.hours != null ? ` (${row.hours} contact hours)` : ''}: ${formatMoney(row.amount)}`);
  });
  lines.push(`Total contact hours: ${totalContactHours(args.lineItems)}`);
  lines.push(`Total due: ${formatMoney(total)}`);
  return lines;
}

const MONEY_WORDS = '(?:total|amount|tuition|fees?|invoice)';
const NARRATIVE_MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/\$\s?\d/, 'a dollar amount'],
  [/(?:^|[^\w.])\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/, 'a number formatted like money'],
  [/(?:^|[^\w.])\d+\.\d{2}\b/, 'a number formatted like money'],
  [new RegExp(`\\b${MONEY_WORDS}\\b(?:\\W+[A-Za-z]+){0,2}\\W+\\d[\\d,.]*\\b`, 'i'), 'an amount word next to a number'],
  [new RegExp(`(?:^|[^\\w.])\\d[\\d,.]*(?:\\W+[A-Za-z]+){0,2}\\W+${MONEY_WORDS}\\b`, 'i'), 'an amount word next to a number'],
];

/**
 * Hard server-side block: the narrative may not state money. The facts block
 * is generated and authoritative; the narrative is human-reviewed prose, NOT
 * machine-verified beyond this check (a payer name or other wording is only
 * covered by the signer's review confirmation).
 */
export function narrativeMoneyViolations(narrative: string): string[] {
  const found = new Set<string>();
  for (const [pattern, label] of NARRATIVE_MONEY_PATTERNS) if (pattern.test(narrative)) found.add(label);
  return [...found].map((label) => `The J6 narrative contains ${label}. Amounts belong only in the generated facts block; remove it from the narrative.`);
}

/** Non-blocking hint for hours typed into the narrative. */
export function narrativeFactHints(narrative: string): string[] {
  return /\d+(?:\.\d+)?\s+(?:total\s+)?contact hours/i.test(narrative)
    ? ['The narrative mentions contact hours. Hours are printed in the facts block; consider removing them from the prose.']
    : [];
}

/** Values the signer reviews; any change after ticking a confirmation voids it. */
export type ReviewedValues = {
  programSlug: string;
  invoiceDate: string;
  dueDate: string | null;
  billToName: string;
  referenceNumber: string;
  lineItems: ReadonlyArray<{ description: string; hours: number | null; amount: number | null }>;
  fundingBasis: string;
  approvedAmount: number | null;
  fundingReference: string;
  exceptionNote: string;
  /** The J6 narrative is covered by the review too. */
  narrative: string;
};

function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Deterministic fingerprint of the reviewed values. The form records it when
 * staff tick a confirmation; the server recomputes it from what is being
 * signed and refuses a mismatch, so a stale confirmation cannot sign edited
 * values. An integrity binding, not a security token.
 */
export function attestationFingerprint(v: ReviewedValues): string {
  const canonical = JSON.stringify([
    v.programSlug,
    v.invoiceDate,
    v.dueDate ?? '',
    v.billToName.trim(),
    v.referenceNumber.trim(),
    v.lineItems.map((row) => [row.description.trim(), row.hours ?? null, row.amount ?? null]),
    v.fundingBasis,
    v.approvedAmount ?? null,
    v.fundingReference.trim(),
    v.exceptionNote.trim(),
    v.narrative.trim(),
  ]);
  return `${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01000193)}`;
}

/**
 * Today in the org's operating timezone (PORTAL_TIMEZONE) as YYYY-MM-DD, plus
 * an optional day offset. Used for the form's invoice/due date defaults so a
 * late-evening Texas session does not default to tomorrow's (UTC) date.
 */
export function isoDateInPortalTz(days: number, from: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PORTAL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(from);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day') + days)).toISOString().slice(0, 10);
}

/** Today (UTC) as YYYY-MM-DD, with an optional day offset. */
export function isoDatePlusDays(days: number, from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}
