/**
 * Fixed terms of the two-stage J5/J6 billing flow (docs/BILLING-PACKETS.md,
 * "Two-stage J5/J6"). These come from Mike Brown's 2026-09-27 contract and
 * supersede the older packet rules (per-class rows, $7,500 as a cap, empty
 * fallback row) for two-stage documents only. Legacy
 * `training_billing_packets` rows and their renderer are unchanged.
 *
 * Client-safe: no Prisma, no Node built-ins.
 */

/** Stage document kinds, stored in `billing_documents.kind`. */
export const J5_KIND = 'j5_quote_voucher_request' as const;
export const J6_KIND = 'j6_invoice_cover_letter' as const;
export type BillingDocumentKind = typeof J5_KIND | typeof J6_KIND;

/** Stage keys, stored in `billing_document_sends.stage` and in idempotency keys. */
export type BillingStage = 'j5' | 'j6';

export function stageForKind(kind: BillingDocumentKind): BillingStage {
  return kind === J5_KIND ? 'j5' : 'j6';
}

export const DOCUMENT_TITLES: Readonly<Record<BillingDocumentKind, string>> = {
  [J5_KIND]: 'Quote / Voucher Request',
  [J6_KIND]: 'Invoice / Voucher Cover Letter',
};

/** The one and only line on both documents: `Tuition & Fees $7,500.00`. */
export const TUITION_AND_FEES_LABEL = 'Tuition & Fees';
export const TUITION_AND_FEES_CENTS = 750_000;

/** Contract hours: 160, except the AI & Software program at 200 (see hours.ts). */
export const STANDARD_CONTACT_HOURS = 160;
export const AI_SOFTWARE_CONTACT_HOURS = 200;
export const ALLOWED_CONTACT_HOURS: ReadonlySet<number> = new Set([STANDARD_CONTACT_HOURS, AI_SOFTWARE_CONTACT_HOURS]);

/** Class end = class start + this many calendar months (month-end clamped). */
export const CLASS_LENGTH_CALENDAR_MONTHS = 6;

/**
 * After the J6 is sent, payment is *expected* in this window. This is a
 * follow-up expectation, not a contract term: never render it as "Net 14"
 * or "due", and never mark a case paid without recorded evidence.
 */
export const PAYMENT_FOLLOW_UP_MIN_DAYS = 10;
export const PAYMENT_FOLLOW_UP_MAX_DAYS = 14;

/** The authorized signer printed on both documents. */
export const AUTHORIZED_SIGNER = Object.freeze({
  name: 'Michael A. Brown, PMP, ChE',
  title: 'Executive Director',
});

/** `Michael A. Brown, PMP, ChE — Executive Director` */
export function authorizedSignerLine(): string {
  return `${AUTHORIZED_SIGNER.name} — ${AUTHORIZED_SIGNER.title}`;
}

/** Upper bound for an uploaded signed voucher or board invoice. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf']);

/** V1 keeps the original five-month terms; new V2 snapshots use six months. */
export const CONTENT_VERSION = 2;
export type ContentVersion = 1 | typeof CONTENT_VERSION;
export const CONTENT_VERSION_UPGRADE_MESSAGE = 'This draft uses earlier class-date terms. Save the draft again and review the six-month end date before signing.';
