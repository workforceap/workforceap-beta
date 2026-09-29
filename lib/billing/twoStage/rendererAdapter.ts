import 'server-only';

/**
 * Pure adapter from M1 frozen content (content.ts) to the #2702 draft
 * renderer input (documentPdf.ts). Every string the renderer prints comes
 * from the frozen content, which the version hash binds:
 *
 *   letterhead.headerLines[0]  -> organization name (footer, signer caption, body sentences)
 *   paymentFollowUp.instruction + .wording -> J6 payment sentences
 *   letterhead.footer.website  -> website (footer)
 *   letterhead.footer          -> footer phone and address line(s)
 *   title                      -> document title (and PDF metadata title)
 *   signer.name / signer.title -> signature caption (`name`, then `title, organization`)
 *   lineItems[0].label/amount  -> the one Tuition & Fees line
 *   paymentFollowUp.wording    -> J6 follow-up sentence
 *   issueDate, contacts, board, training terms, voucher reference
 *
 * The approved layout (Mike Brown's synthetic J5/J6 references, 2026-09-28)
 * does not print the document number; it stays bound in the content hash and
 * the PDF metadata title.
 *
 * The only other printed text is the reviewed fixed wording in
 * FIXED_PRINTED_TEXT (labels and template sentences). The parity tests
 * (rendererAdapter.test.ts) extract the PDF text and check both directions:
 * every printed content field appears, and nothing else is printed.
 *
 * No I/O here: the route reads the logo bytes and passes them in; the
 * adapter only checks them against the hash frozen in the content.
 */
import { VOUCHER_REFERENCE_MAX_LENGTH } from './attestations';
import { sha256Hex } from './canonical';
import { stageForKind, TUITION_AND_FEES_CENTS } from './constants';
import type { J5Content, J6Content } from './content';
import {
  DRAFT_BADGE,
  DRAFT_ON_HOLD_BADGE,
  isWinAnsiPrintable,
  RECEIVING_SIGNATURE_PENDING_SUFFIX,
  renderJ5QuoteVoucherRequestDraftPdf,
  renderJ5QuoteVoucherRequestSignedPdf,
  renderJ6InvoiceVoucherCoverLetterDraftPdf,
  renderJ6InvoiceVoucherCoverLetterSignedPdf,
  TWO_STAGE_TEXT_LIMITS,
  type J5QuoteVoucherRequestFacts,
  type J6InvoiceVoucherCoverLetterFacts,
  type TwoStageDocumentFacts,
} from './documentPdf';
import { assertSingleTuitionLine } from './lineItem';
import type { ReviewReason } from './stateMachine';

export type TwoStageContent = J5Content | J6Content;

export type RendererAdapterCode =
  | 'LOGO_CHANGED'
  | 'SIGNATURE_IMAGE_MISMATCH'
  | 'TEXT_NOT_PRINTABLE'
  | 'VOUCHER_REFERENCE_TOO_LONG'
  | 'CONTENT_NOT_RENDERABLE';

export class RendererAdapterError extends Error {
  readonly code: RendererAdapterCode;
  readonly field: string | null;
  readonly holds: readonly ReviewReason[];
  constructor(code: RendererAdapterCode, message: string, opts: { field?: string | null; holds?: readonly ReviewReason[] } = {}) {
    super(message);
    this.name = 'RendererAdapterError';
    this.code = code;
    this.field = opts.field ?? null;
    this.holds = opts.holds ?? [];
  }
}

/** The voucher/PO reference limit: M1's VOUCHER_REFERENCE_MAX_LENGTH (80; a DB CHECK too), the same in upload, draft save and the renderer. */
export const VOUCHER_REFERENCE_MAX = VOUCHER_REFERENCE_MAX_LENGTH;

/**
 * Reviewed fixed wording the draft renderer prints besides content values.
 * `{name}` placeholders are filled from the content by fixedPrintedText().
 * Changing the renderer's wording must change this list (the reverse parity
 * test fails otherwise), so the reviewed list and the PDF cannot drift.
 */
export const FIXED_PRINTED_TEXT = Object.freeze({
  labels: Object.freeze([
    DRAFT_ON_HOLD_BADGE,
    DRAFT_BADGE,
    'TRAINING DETAILS',
    'Training hours',
    'Class start',
    'Class end',
    'Voucher / PO',
    'Student',
    'Class',
    'PHONE',
    'BOARD',
    'COPY',
    'TO',
    'RE',
    'Respectfully,',
    'Executive signature required before issue',
  ]),
  j5: Object.freeze([
    "At your request, {org} is providing this training quote for {student}. Please issue a training voucher for the program below through your board's authorization process. This is a quote and voucher request, not an invoice.",
    "Please send the issued voucher and any authorization details to {org}. A copy of this request will be retained in the student's file.",
    'Copy: {student} | {studentEmail}',
  ]),
  j6: Object.freeze([
    "{org} requests payment for {student}'s training under signed voucher {voucher}. The student began class on {classStartedOn}. Please process the tuition and fees amount shown below under your board's procedures.",
    'Enclosure for issued packet: received, signed training voucher {voucher}{receiptPending}',
    'Payment for {student} training',
  ]),
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The renderer's long date ("September 30, 2026"), for the parity tests. */
export function printedLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * The fixed template sentences for this content, filled with its values.
 * `receiptPending`: the J6 DRAFT has no designated-signer receipt attestation
 * yet, so the enclosure line says so.
 */
export function fixedPrintedText(content: TwoStageContent, opts: { receiptPending?: boolean } = {}): string[] {
  const vars: Record<string, string> = {
    org: content.letterhead.headerLines[0],
    student: content.student.name,
    studentEmail: content.student.email,
    counselor: content.counselor.name,
  };
  if (content.kind === 'j6_invoice_cover_letter') {
    vars.voucher = content.voucher.reference;
    vars.classStartedOn = printedLongDate(content.classStarted.classStartDate);
    vars.receiptPending = opts.receiptPending ? ` ${RECEIVING_SIGNATURE_PENDING_SUFFIX}` : '';
  }
  const templates = content.kind === 'j5_quote_voucher_request' ? FIXED_PRINTED_TEXT.j5 : FIXED_PRINTED_TEXT.j6;
  return templates.map((t) => t.replace(/\{(\w+)\}/gu, (_, key: string) => vars[key]));
}

type PrintedField = { field: string; value: string; max: number };

/** Every content string the renderer prints, with its content path and length cap. */
export function printedContentFields(content: TwoStageContent): PrintedField[] {
  const L = TWO_STAGE_TEXT_LIMITS;
  const fields: PrintedField[] = [
    { field: 'title', value: content.title, max: L.title },
    { field: 'letterhead.headerLines[0]', value: content.letterhead.headerLines[0], max: L.organizationName },
    { field: 'letterhead.footer.website', value: content.letterhead.footer.website, max: L.website },
    { field: 'letterhead.footer.phone', value: content.letterhead.footer.phone, max: L.phone },
    ...content.letterhead.footer.addressLines.map((value, i) => ({ field: `letterhead.footer.addressLines[${i}]`, value, max: L.addressLine })),
    { field: 'student.name', value: content.student.name, max: L.personName },
    { field: 'boardName', value: content.boardName, max: L.boardName },
    { field: 'counselor.name', value: content.counselor.name, max: L.personName },
    { field: 'training.className', value: content.training.className, max: L.className },
    { field: 'lineItems[0].label', value: content.lineItems[0]?.label ?? '', max: L.tuitionLabel },
    { field: 'signer.name', value: content.signer.name, max: L.personName },
    { field: 'signer.title', value: content.signer.title, max: L.signerTitle },
  ];
  if (content.kind === 'j5_quote_voucher_request') {
    // J5 is addressed to the counselor (name, email, phone) with a copy line for the student.
    fields.push(
      { field: 'student.email', value: content.student.email, max: L.email },
      { field: 'counselor.email', value: content.counselor.email, max: L.email },
      { field: 'counselor.phone', value: content.counselor.phone, max: L.phone },
    );
  } else {
    // J6 is addressed to board finance; counselor and student appear by name on the copy line.
    fields.push(
      { field: 'finance.name', value: content.finance.name, max: L.personName },
      { field: 'finance.email', value: content.finance.email, max: L.email },
      { field: 'voucher.reference', value: content.voucher.reference, max: L.voucherReference },
      { field: 'paymentFollowUp.instruction', value: content.paymentFollowUp.instruction, max: L.paymentFollowUpWording },
      { field: 'paymentFollowUp.wording', value: content.paymentFollowUp.wording, max: L.paymentFollowUpWording },
    );
  }
  return fields;
}

export type PrintableIssue = { code: 'TEXT_NOT_PRINTABLE' | 'VOUCHER_REFERENCE_TOO_LONG'; field: string; message: string };

const CONTROL = /[\u0000-\u001f\u007f]/u;
/**
 * Spacing the page would not print as typed: the renderer wraps on single
 * spaces, so a run of spaces, a non-breaking space or any other whitespace
 * character would print as one plain space and the page would differ from
 * the hashed value ('PO  44871' printed as 'PO 44871').
 */
const SPACING_NOT_PRINTED = /[^\S ]| {2}/u;

/** One printed value against the renderer's rules (single line, trimmed, WinAnsi, length cap). */
export function printableIssue(field: string, value: string, max: number): PrintableIssue | null {
  if (field === 'voucher.reference' && value.length > VOUCHER_REFERENCE_MAX) {
    return { code: 'VOUCHER_REFERENCE_TOO_LONG', field, message: `The voucher/PO reference is limited to ${VOUCHER_REFERENCE_MAX} characters.` };
  }
  if (!value || value !== value.trim() || CONTROL.test(value) || SPACING_NOT_PRINTED.test(value) || value.length > max || !isWinAnsiPrintable(value)) {
    return { code: 'TEXT_NOT_PRINTABLE', field, message: `${field} contains characters or a length the PDF cannot print.` };
  }
  return null;
}

/** Every printed content value the renderer would refuse. Empty = printable. Run at draft save. */
export function printableIssues(content: TwoStageContent): PrintableIssue[] {
  // The document number is not on the page but is in the PDF metadata title, which the renderer also validates.
  const fields = [{ field: 'documentNumber', value: content.documentNumber, max: TWO_STAGE_TEXT_LIMITS.documentNumber }, ...printedContentFields(content)];
  return fields.flatMap(({ field, value, max }) => printableIssue(field, value, max) ?? []);
}

export type RenderOptions = {
  logoPng: Uint8Array;
  /**
   * PDF creation date (not printed, not hashed): the record's updatedAt for a
   * draft preview; for a signed PDF, the instant the sign route renders it.
   */
  frozenAt: string;
  /**
   * J6: the designated signer's receipt-signature attestation id on this
   * exact voucher hash. Absent or null renders the DRAFT enclosure line as
   * pending; the staff voucher attestation id is never used in its place.
   */
  receiptSignatureId?: string | null;
};

/**
 * Build the renderer input from frozen content. Throws RendererAdapterError:
 * LOGO_CHANGED (bytes differ from the frozen hash), TEXT_NOT_PRINTABLE /
 * VOUCHER_REFERENCE_TOO_LONG, or CONTENT_NOT_RENDERABLE (shape problems M1
 * should never produce). Open gates never block a DRAFT: a held J6 renders
 * with the on-hold badge and a missing receipt attestation as a pending
 * enclosure line; freeze, sign and send enforce both.
 */

export function toRendererFacts(content: TwoStageContent, opts: RenderOptions): TwoStageDocumentFacts {
  if (sha256Hex(opts.logoPng) !== content.letterhead.logo.sha256) {
    throw new RendererAdapterError('LOGO_CHANGED', 'The letterhead logo changed. Save the draft again to review the new version.');
  }
  try {
    assertSingleTuitionLine(content.lineItems);
  } catch (error) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', (error as Error).message, { field: 'lineItems' });
  }
  if (content.totalCents !== TUITION_AND_FEES_CENTS) throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The total must be $7,500.00.', { field: 'totalCents' });
  const { headerLines, footer } = content.letterhead;
  if (headerLines.length < 1 || !headerLines[0]) throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The letterhead needs the organization name.', { field: 'letterhead.headerLines' });
  if (footer.addressLines.length < 1 || footer.addressLines.length > 2) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The letterhead footer needs one or two address lines.', { field: 'letterhead.footer.addressLines' });
  }
  if (content.signer.line !== `${content.signer.name} — ${content.signer.title}`) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The signer line must be "name — title".', { field: 'signer.line' });
  }
  const issue = printableIssues(content)[0];
  if (issue) throw new RendererAdapterError(issue.code, issue.message, { field: issue.field });
  const receiptSignatureId = opts.receiptSignatureId?.trim() || null;

  const common = {
    documentNumber: content.documentNumber,
    issueDate: content.issueDate,
    frozenAt: opts.frozenAt,
    title: content.title,
    student: { name: content.student.name, email: content.student.email },
    boardName: content.boardName,
    counselor: { name: content.counselor.name, email: content.counselor.email, phone: content.counselor.phone },
    programSlug: content.training.programSlug,
    className: content.training.className,
    classHours: content.training.contactHours,
    classStartDate: content.training.classStartDate,
    classEndDate: content.training.classEndDate,
    tuitionCents: 750_000 as const,
    tuitionLabel: content.lineItems[0].label,
    signer: { name: content.signer.name, title: content.signer.title },
    letterhead: {
      logoPng: opts.logoPng,
      organizationName: headerLines[0],
      website: footer.website,
      businessPhone: footer.phone,
      addressLine1: footer.addressLines[0],
      ...(footer.addressLines[1] === undefined ? {} : { addressLine2: footer.addressLines[1] }),
    },
  };
  if (content.kind === 'j5_quote_voucher_request') {
    const facts: J5QuoteVoucherRequestFacts = { ...common, stage: stageForKind(content.kind) as 'j5' };
    return facts;
  }
  const facts: J6InvoiceVoucherCoverLetterFacts = {
    ...common,
    stage: stageForKind(content.kind) as 'j6',
    financePerson: { name: content.finance.name, email: content.finance.email },
    classStartedAt: content.classStarted.classStartDate,
    paymentInstruction: content.paymentFollowUp.instruction,
    paymentFollowUpWording: content.paymentFollowUp.wording,
    openHolds: [...content.reviewReasons],
    signedVoucher: {
      reference: content.voucher.reference,
      receivedDate: content.voucher.receivedOn,
      authorizedAmountCents: content.voucher.authorizedAmountCents,
      sha256: content.voucher.sha256,
      // Michael's own receipt-signature attestation on this voucher hash, never the staff flag.
      receivingSignatureAttestationId: receiptSignatureId,
    },
  };
  return facts;
}

/**
 * Render the DRAFT PDF for frozen content. Any renderer refusal (for
 * example a value too wide for the one-page layout) becomes
 * TEXT_NOT_PRINTABLE, so a draft save can call this to fail early.
 */
export async function renderDraftFromContent(content: TwoStageContent, opts: RenderOptions): Promise<Uint8Array> {
  const facts = toRendererFacts(content, opts);
  try {
    return facts.stage === 'j5' ? await renderJ5QuoteVoucherRequestDraftPdf(facts) : await renderJ6InvoiceVoucherCoverLetterDraftPdf(facts);
  } catch (error) {
    throw layoutRefusal(error);
  }
}

/** A renderer refusal (for example a value too wide for the one-page layout) as TEXT_NOT_PRINTABLE. */
function layoutRefusal(error: unknown): RendererAdapterError {
  const message = error instanceof Error ? error.message : '';
  const field = /^([\w.[\]]+) must /u.exec(message)?.[1] ?? null;
  return new RendererAdapterError('TEXT_NOT_PRINTABLE', `${field ?? 'A printed field'} contains characters or a length the PDF cannot print.`, { field });
}

export type SignedRenderOptions = RenderOptions & {
  /**
   * The bytes of the designated signer's approved signature image, read from
   * the private archive. They must hash to the asset the content froze
   * (content.signature.assetSha256), so the page can only carry that image.
   */
  signaturePng: Uint8Array;
};

/**
 * Render the FINAL page for frozen content: the approved layout with the
 * frozen signature image and no DRAFT markers. Refuses, before rendering, a
 * content that froze no signature, an image that is not the frozen one, a
 * held J6, and a J6 without the designated signer's receiving-signature
 * attestation (`receiptSignatureId`). Sign-time authorization is not decided
 * here; the sign route has already applied it.
 */
export async function renderSignedFromContent(content: TwoStageContent, opts: SignedRenderOptions): Promise<Uint8Array> {
  const frozen = content.signature;
  if (!frozen || sha256Hex(opts.signaturePng) !== frozen.assetSha256) {
    throw new RendererAdapterError('SIGNATURE_IMAGE_MISMATCH', 'The signature image is not the one this draft was prepared with. Save the draft again and review it.');
  }
  if (content.kind === 'j6_invoice_cover_letter') {
    if (content.reviewReasons.length > 0) {
      throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'A J6 on hold cannot be signed.', { holds: content.reviewReasons });
    }
    if (!opts.receiptSignatureId?.trim()) {
      throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'A signed J6 needs the designated signer receiving-signature attestation.', { field: 'voucher' });
    }
  }
  const facts = toRendererFacts(content, opts);
  try {
    return facts.stage === 'j5'
      ? await renderJ5QuoteVoucherRequestSignedPdf(facts, opts.signaturePng)
      : await renderJ6InvoiceVoucherCoverLetterSignedPdf(facts, opts.signaturePng);
  } catch (error) {
    throw layoutRefusal(error);
  }
}
