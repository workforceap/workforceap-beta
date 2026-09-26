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

/**
 * Default J6 body. Plain paragraphs separated by blank lines; the admin edits
 * it on the form before signing. Keep the wording board-facing and factual.
 */
export function defaultCoverLetterBody(args: {
  memberName: string;
  programTitle: string;
  billToName: string;
  lineItems: ReadonlyArray<PacketLineItem>;
  providerName: string;
  referenceNumber?: string;
}): string {
  const classes = args.lineItems.filter((row) => row.hours != null);
  const hours = totalContactHours(args.lineItems);
  const total = args.lineItems.reduce((sum, row) => sum + row.amount, 0);
  const classList = classes.length
    ? classes.map((row) => `- ${row.description}${row.hours ? ` (${row.hours} contact hours)` : ''}`).join('\n')
    : `- ${args.programTitle}`;
  const reference = args.referenceNumber ? ` under reference ${args.referenceNumber}` : '';

  return [
    `Please find enclosed the training invoice (Form J5) from ${args.providerName} for ${args.memberName}, who is enrolled in the ${args.programTitle} program${reference}.`,
    `The invoice covers the following classes${hours ? ` (${hours} total contact hours)` : ''}:\n${classList}`,
    `The total amount due is ${formatMoney(total)}. A class-by-class price breakdown appears on the invoice. Training is provided at no cost to the participant; this invoice is billed to ${args.billToName} as the funding partner.`,
    `Thank you for your partnership in advancing this participant's career. Please contact me directly with any questions about this enrollment or invoice.`,
  ].join('\n\n');
}

/**
 * Above this total a WIOA ITA invoice needs a recorded Board-approved
 * exception. Source: Workforce Solutions Capital Area Board plan PY2025-2028,
 * p.57 ($7,500 maximum ITA, exceptions by Board-staff approval). Not applied to
 * a separate contract, and never used as an approved amount.
 */
export const WIOA_ITA_MAX_WITHOUT_EXCEPTION = 7500;

const MONEY_IN_TEXT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;
const CLASS_BULLET = /^\s*(?:[-*]|\u2022)\s+(.+?)\s+\((\d+(?:\.\d+)?) contact hours\)\s*$/;
const TOTAL_HOURS = /(\d+(?:\.\d+)?) total contact hours/g;
const BILLED_TO = /billed to (.+?) as the funding partner/g;

const toCents = (n: number) => Math.round(n * 100);

/**
 * Facts in the J6 letter body that contradict the J5 rows it transmits: a
 * dollar figure that is neither the total nor a row amount, a stated total of
 * contact hours, a listed class (name + hours) that is not a J5 class row or a
 * J5 class missing from the list, and the default letter's bill-to and
 * reference phrases. Empty when the letter agrees with the invoice.
 */
export function findCoverLetterMismatches(args: {
  coverLetterBody: string;
  lineItems: ReadonlyArray<PacketLineItem>;
  billToName: string;
  referenceNumber?: string | null;
}): string[] {
  const body = args.coverLetterBody;
  const issues: string[] = [];
  const total = args.lineItems.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
  const allowed = new Set([toCents(total), ...args.lineItems.map((row) => toCents(row.amount))]);

  // A figure in a sentence about the total must be the total; any other figure
  // must be the total or one row's amount.
  for (const sentence of body.split(/(?<=[.!?])\s+|\n/)) {
    const aboutTotal = /\btotal\b/i.test(sentence);
    for (const m of sentence.matchAll(MONEY_IN_TEXT)) {
      const cents = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
      if (aboutTotal ? cents !== toCents(total) : !allowed.has(cents)) {
        issues.push(`The letter mentions ${m[0].trim()}, but the invoice total is ${formatMoney(total)}${aboutTotal ? '' : ' and no row has that amount'}.`);
      }
    }
  }

  const hours = totalContactHours(args.lineItems);
  for (const m of body.matchAll(TOTAL_HOURS)) {
    if (Number(m[1]) !== hours) issues.push(`The letter says ${m[1]} total contact hours; the invoice rows add up to ${hours}.`);
  }

  const classRows = args.lineItems.filter((row) => row.hours != null);
  const listed = body
    .split('\n')
    .map((line) => CLASS_BULLET.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ description: m[1].trim(), hours: Number(m[2]) }));
  const key = (description: string, h: number | null) => `${description.trim().toLowerCase()}|${h ?? ''}`;
  if (listed.length > 0) {
    const rowKeys = new Set(classRows.map((row) => key(row.description, row.hours)));
    const listedKeys = new Set(listed.map((c) => key(c.description, c.hours)));
    for (const c of listed) {
      if (!rowKeys.has(key(c.description, c.hours))) issues.push(`The letter lists "${c.description} (${c.hours} contact hours)", which is not a class row on the invoice.`);
    }
    for (const row of classRows) {
      if (row.hours && !listedKeys.has(key(row.description, row.hours))) issues.push(`The invoice class "${row.description}" is missing from the letter's class list.`);
    }
  }

  for (const m of body.matchAll(BILLED_TO)) {
    if (m[1].trim() !== args.billToName.trim()) issues.push(`The letter says it is billed to ${m[1].trim()}; the invoice is billed to ${args.billToName.trim()}.`);
  }

  const ref = args.referenceNumber?.trim() ?? '';
  if (body.includes('under reference ') && (!ref || !body.includes(`under reference ${ref}`))) {
    issues.push(ref ? `The letter's reference does not match the invoice reference ${ref}.` : 'The letter cites a reference number, but the invoice has none.');
  }
  return issues;
}

/** Today (UTC) as YYYY-MM-DD, with an optional day offset. */
export function isoDatePlusDays(days: number, from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}
