import 'server-only';

/**
 * Pure adapter from M1 frozen content (content.ts) to the #2702 draft
 * renderer input (documentPdf.ts). Every string the renderer prints comes
 * from the frozen content, which the version hash binds:
 *
 *   letterhead.headerLines[0]  -> organization name (footer, signer caption, body sentences)
 *   letterhead.footer.website  -> website (footer)
 *   letterhead.footer          -> footer phone and address line(s)
 *   title                      -> document title (and PDF metadata title)
 *   signer.name / signer.title -> signature caption (`name`, then `title, organization`)
 *   lineItems[0].label/amount  -> the one Tuition & Fees line
 *   paymentFollowUp.wording    -> J6 follow-up sentence
 *   issueDate, contacts, board, training terms, voucher reference
 *
 * The approved layout (Mike Brown's synthetic J5/J6 references, 2026-09-28)
 * prints neither the tagline (headerLines[1]; the logo artwork carries it) nor
 * the document number; both stay bound in the content hash.
 *
 * The only other printed text is the reviewed fixed wording in
 * FIXED_PRINTED_TEXT (labels and template sentences). The parity tests
 * (rendererAdapter.test.ts) extract the PDF text and check both directions:
 * every printed content field appears, and nothing else is printed.
 *
 * No I/O here: the route reads the logo bytes and passes them in; the
 * adapter only checks them against the hash frozen in the content.
 */
import { sha256Hex } from './canonical';
import { stageForKind, TUITION_AND_FEES_CENTS } from './constants';
import type { J5Content, J6Content } from './content';
import {
  isWinAnsiPrintable,
  renderJ5QuoteVoucherRequestDraftPdf,
  renderJ6InvoiceVoucherCoverLetterDraftPdf,
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
  | 'PREVIEW_UNAVAILABLE_HELD'
  | 'RECEIVING_SIGNATURE_NOT_ATTESTED'
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

/**
 * The voucher/PO reference limit, one value for draft save, upload and the
 * renderer (M1 recordVoucherBoardSigned allows 120; the printed layout does
 * not, so M3 refuses 81-120 at upload with VOUCHER_REFERENCE_TOO_LONG).
 */
export const VOUCHER_REFERENCE_MAX = TWO_STAGE_TEXT_LIMITS.voucherReference;

/**
 * Reviewed fixed wording the draft renderer prints besides content values.
 * `{name}` placeholders are filled from the content by fixedPrintedText().
 * Changing the renderer's wording must change this list (the reverse parity
 * test fails otherwise), so the reviewed list and the PDF cannot drift.
 */
export const FIXED_PRINTED_TEXT = Object.freeze({
  labels: Object.freeze([
    'DRAFT - SIGNATURE REQUIRED',
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
    'Please arrange payment by check or wire to {org} and confirm the expected remittance date. {paymentFollowUp}',
    'Enclosure for issued packet: received, signed training voucher {voucher}',
    'Payment for {student} training',
  ]),
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The renderer's long date ("September 30, 2026"), for the parity tests. */
export function printedLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The fixed template sentences for this content, filled with its values. */
export function fixedPrintedText(content: TwoStageContent): string[] {
  const vars: Record<string, string> = {
    org: content.letterhead.headerLines[0],
    student: content.student.name,
    studentEmail: content.student.email,
    counselor: content.counselor.name,
  };
  if (content.kind === 'j6_invoice_cover_letter') {
    vars.voucher = content.voucher.reference;
    vars.classStartedOn = printedLongDate(content.classStarted.classStartDate);
    vars.paymentFollowUp = content.paymentFollowUp.wording;
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
      { field: 'paymentFollowUp.wording', value: content.paymentFollowUp.wording, max: L.paymentFollowUpWording },
    );
  }
  return fields;
}

export type PrintableIssue = { code: 'TEXT_NOT_PRINTABLE' | 'VOUCHER_REFERENCE_TOO_LONG'; field: string; message: string };

const CONTROL = /[\u0000-\u001f\u007f]/u;

/** One printed value against the renderer's rules (single line, trimmed, WinAnsi, length cap). */
export function printableIssue(field: string, value: string, max: number): PrintableIssue | null {
  if (field === 'voucher.reference' && value.length > VOUCHER_REFERENCE_MAX) {
    return { code: 'VOUCHER_REFERENCE_TOO_LONG', field, message: `The voucher/PO reference is limited to ${VOUCHER_REFERENCE_MAX} characters.` };
  }
  if (!value || value !== value.trim() || CONTROL.test(value) || value.length > max || !isWinAnsiPrintable(value)) {
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

/**
 * Build the renderer input from frozen content. Throws RendererAdapterError:
 * LOGO_CHANGED (bytes differ from the frozen hash), PREVIEW_UNAVAILABLE_HELD
 * (a held J6 has no signable version to review), TEXT_NOT_PRINTABLE /
 * VOUCHER_REFERENCE_TOO_LONG, or CONTENT_NOT_RENDERABLE (shape problems M1
 * should never produce).
 */
export type RenderOptions = {
  logoPng: Uint8Array;
  /**
   * PDF creation date (not printed, not hashed): the record's updatedAt for a
   * draft preview; for a signed PDF, the instant the sign route renders it.
   */
  frozenAt: string;
  /** J6: the designated signer's receipt-signature attestation id on this exact voucher hash. */
  receiptSignatureId?: string | null;
};

export function toRendererFacts(content: TwoStageContent, opts: RenderOptions): TwoStageDocumentFacts {
  if (sha256Hex(opts.logoPng) !== content.letterhead.logo.sha256) {
    throw new RendererAdapterError('LOGO_CHANGED', 'The letterhead logo changed. Save the draft again to review the new version.');
  }
  if (content.kind === 'j6_invoice_cover_letter' && content.reviewReasons.length > 0) {
    throw new RendererAdapterError('PREVIEW_UNAVAILABLE_HELD', 'This J6 cannot be previewed while it is on hold.', { holds: content.reviewReasons });
  }
  try {
    assertSingleTuitionLine(content.lineItems);
  } catch (error) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', (error as Error).message, { field: 'lineItems' });
  }
  if (content.totalCents !== TUITION_AND_FEES_CENTS) throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The total must be $7,500.00.', { field: 'totalCents' });
  const { headerLines, footer } = content.letterhead;
  if (headerLines.length !== 3) throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The letterhead needs exactly three header lines.', { field: 'letterhead.headerLines' });
  if (footer.addressLines.length < 1 || footer.addressLines.length > 2) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The letterhead footer needs one or two address lines.', { field: 'letterhead.footer.addressLines' });
  }
  if (content.signer.line !== `${content.signer.name} — ${content.signer.title}`) {
    throw new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The signer line must be "name — title".', { field: 'signer.line' });
  }
  const issue = printableIssues(content)[0];
  if (issue) throw new RendererAdapterError(issue.code, issue.message, { field: issue.field });
  const receiptSignatureId = opts.receiptSignatureId?.trim() ?? '';
  if (content.kind === 'j6_invoice_cover_letter' && !receiptSignatureId) {
    throw new RendererAdapterError(
      'RECEIVING_SIGNATURE_NOT_ATTESTED',
      "Michael A. Brown must attest his receiving signature on this exact voucher before the J6 can be previewed.",
    );
  }

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
    paymentFollowUpWording: content.paymentFollowUp.wording,
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
    const message = error instanceof Error ? error.message : '';
    const field = /^([\w.[\]]+) must /u.exec(message)?.[1] ?? null;
    throw new RendererAdapterError('TEXT_NOT_PRINTABLE', `${field ?? 'A printed field'} contains characters or a length the PDF cannot print.`, { field });
  }
}
