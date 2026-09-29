import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getProgramSyllabus } from '@/shared/programSyllabi';

/**
 * One-page, side-effect-free renderers for the two distinct WAP billing
 * stages.
 *
 * The DRAFT renderers never sign or create a final document: they print the
 * DRAFT badge and the "signature required" caption.
 *
 * The SIGNED renderers produce the final page for the sign route. They print
 * the identical approved layout with exactly two differences: the DRAFT badge
 * and the "Executive signature required before issue" caption are omitted, and
 * the designated signer's approved signature PNG is placed in the existing
 * signature gap above the rule. The caller (the sign route) has already
 * checked that the image bytes hash to the asset frozen in the content; this
 * module only refuses a J6 that still carries a hold or lacks the receiving
 * signature attestation, since neither can be signed. Archiving the exact final
 * bytes and everything about who may sign stay with the server workflow.
 *
 * Every variable string on the page (organization name, website, footer
 * phone and address, title, signer name and title, payment wording,
 * line-item label, contacts, terms) comes from the input,
 * which `rendererAdapter.ts` builds from the frozen M1 content, so the PDF
 * prints exactly what the version hash binds. The only other text is the
 * reviewed fixed wording listed in `rendererAdapter.ts` FIXED_PRINTED_TEXT.
 */

/** Length caps the one-page layout accepts (also enforced at draft save). */
export const TWO_STAGE_TEXT_LIMITS = Object.freeze({
  documentNumber: 64,
  title: 60,
  organizationName: 60,
  website: 60,
  signerTitle: 60,
  personName: 90,
  email: 254,
  phone: 40,
  boardName: 100,
  programSlug: 120,
  className: 110,
  addressLine: 100,
  tuitionLabel: 40,
  paymentFollowUpWording: 120,
  voucherReference: 80,
  attestationId: 100,
});

/**
 * Helvetica's WinAnsi encoding: printable ASCII, Latin-1 and the CP1252
 * extras (curly quotes, dashes, euro, ...). Anything else would be replaced
 * or dropped by the font, so it is refused instead of silently altered.
 */
const NOT_WIN_ANSI = /[^\x20-\x7e\u00a0-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/u;

/** True when `value` prints unchanged with the standard PDF font. */
export function isWinAnsiPrintable(value: string): boolean {
  return !NOT_WIN_ANSI.test(value);
}

type Person = { readonly name: string; readonly email: string };

type CommonFacts = {
  readonly documentNumber: string;
  readonly issueDate: string; // YYYY-MM-DD, frozen by the server
  readonly frozenAt: string; // UTC ISO instant, also used for deterministic PDF metadata
  readonly student: Person;
  readonly boardName: string;
  readonly counselor: Person & { readonly phone: string };
  /** The enrolled program slug, not a display title or broad category. */
  readonly programSlug: string;
  readonly className: string;
  readonly classHours: 160 | 200;
  readonly classStartDate: string;
  readonly classEndDate: string; // exactly five calendar months after start
  readonly tuitionCents: 750_000;
  /** The printed line-item label (`Tuition & Fees`). */
  readonly tuitionLabel: string;
  /** The printed document title, e.g. `Quote / Voucher Request`. */
  readonly title: string;
  /** Printed under the signature line as `name` and `title, organizationName`. This draft renderer never draws a signature. */
  readonly signer: { readonly name: string; readonly title: string };
  readonly letterhead: {
    readonly logoPng: Uint8Array;
    /** Printed in the footer, the signer caption and the body sentences. */
    readonly organizationName: string;
    /** Printed in the footer next to the phone. */
    readonly website: string;
    readonly businessPhone: string;
    readonly addressLine1: string;
    /** Optional second footer address line. */
    readonly addressLine2?: string;
  };
};

export type J5QuoteVoucherRequestFacts = CommonFacts & {
  readonly stage: 'j5';
};

export type J6InvoiceVoucherCoverLetterFacts = CommonFacts & {
  readonly stage: 'j6';
  readonly financePerson: Person;
  readonly classStartedAt: string;
  /** The printed payment instruction sentence (how to pay). */
  readonly paymentInstruction: string;
  /** The printed payment follow-up sentence (an expectation, never a due date). */
  readonly paymentFollowUpWording: string;
  /**
   * DRAFT review only: the J6 hard holds this version carries. A held J6 can
   * never be signed, but staff review its layout; the badge then reads
   * `DRAFT - ON HOLD - NOT SIGNABLE`, and the contract checks a hold already
   * reports (end date, voucher amount) are not re-thrown here.
   */
  readonly openHolds?: readonly string[];
  /** The received, executive-signed voucher remains a separate attachment. */
  readonly signedVoucher: {
    readonly reference: string;
    readonly receivedDate: string;
    /** Structured value read from the received voucher, before PDF rendering. */
    readonly authorizedAmountCents: number;
    readonly sha256: string;
    /**
     * The designated signer's receipt-signature attestation on this voucher's
     * exact bytes, or null while it is still pending: the DRAFT then says so
     * on the enclosure line (a signable version always has one).
     */
    readonly receivingSignatureAttestationId: string | null;
  };
};

export type TwoStageDocumentFacts = J5QuoteVoucherRequestFacts | J6InvoiceVoucherCoverLetterFacts;

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 54;
const RIGHT = 558;
const CONTENT_W = RIGHT - LEFT;
const INK = rgb(35 / 255, 38 / 255, 42 / 255);
const MUTED = rgb(89 / 255, 97 / 255, 104 / 255);
const GOLD = rgb(207 / 255, 142 / 255, 23 / 255);
const RED = rgb(176 / 255, 31 / 255, 48 / 255);
const PALE = rgb(248 / 255, 246 / 255, 241 / 255);
const PRICE_PALE = rgb(242 / 255, 244 / 255, 245 / 255);
const RULE = rgb(211 / 255, 216 / 255, 220 / 255);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Fonts = { regular: PDFFont; bold: PDFFont };

function required(value: unknown, label: string, max = 180): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\r\n\x00-\x1f]/u.test(value)) {
    throw new Error(`${label} must be a non-empty single line of at most ${max} characters`);
  }
  return value;
}

function printable(value: string): string {
  // Helvetica's WinAnsi encoding does not cover every Unicode character. Do
  // not silently replace a student's name or a voucher reference with '?',
  // and print covered characters (dashes, curly quotes) exactly as given so
  // the page matches the hashed content character for character.
  if (!isWinAnsiPrintable(value)) throw new Error('PDF text contains a glyph unsupported by the standard font');
  return value;
}

function isoDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} is not a real date`);
  return parsed;
}

function utcInstant(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) throw new Error(`${label} must be a UTC ISO instant`);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`${label} is not a real instant`);
  return date;
}

function fiveMonthsLater(value: string): string {
  const start = isoDate(value, 'classStartDate');
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 5;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

/** "$7,500.00" from whole cents, locale-independent. */
function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `$${dollars}.${String(cents % 100).padStart(2, '0')}`;
}

function longDate(value: string): string {
  const date = isoDate(value, 'date');
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** How the page is rendered: a DRAFT preview, or the final page with the signer's approved image. */
type RenderMode = { readonly kind: 'draft' } | { readonly kind: 'signed'; readonly signaturePng: Uint8Array };

function validateFacts(input: TwoStageDocumentFacts, signed: boolean): Date {
  if (input.stage !== 'j5' && input.stage !== 'j6') throw new Error('Unknown billing stage');
  // The signature is never a caller-supplied fact: the signed renderers take the image separately.
  if ('signature' in input || 'signed' in input) throw new Error('Signature data is not accepted as a document fact');
  const L = TWO_STAGE_TEXT_LIMITS;
  required(input.documentNumber, 'documentNumber', L.documentNumber);
  required(input.title, 'title', L.title);
  required(input.tuitionLabel, 'tuitionLabel', L.tuitionLabel);
  required(input.signer?.name, 'signer.name', L.personName);
  required(input.signer?.title, 'signer.title', L.signerTitle);
  const issueDate = isoDate(input.issueDate, 'issueDate');
  const frozenAt = utcInstant(input.frozenAt, 'frozenAt');
  required(input.student?.name, 'student.name', L.personName);
  required(input.student?.email, 'student.email', L.email);
  required(input.boardName, 'boardName', L.boardName);
  required(input.counselor?.name, 'counselor.name', L.personName);
  required(input.counselor?.email, 'counselor.email', L.email);
  required(input.counselor?.phone, 'counselor.phone', L.phone);
  const rawSlug = required(input.programSlug, 'programSlug', L.programSlug);
  const canonicalSlug = canonicalizeProgramSlug(rawSlug);
  if (rawSlug !== canonicalSlug) throw new Error('Canonical program slug is required');
  const syllabus = getProgramSyllabus(canonicalSlug);
  if (!syllabus || syllabus.slug !== canonicalSlug) throw new Error('An approved program syllabus is required');
  const contractHours = canonicalSlug === 'software-developer-professional-certificate-ibm' ? 200 : 160;
  if (syllabus.totalHours !== contractHours || input.classHours !== syllabus.totalHours) {
    throw new Error(`Class hours must match the approved ${contractHours}-hour syllabus`);
  }
  required(input.className, 'className', L.className);
  if (input.className !== syllabus.title) throw new Error('Class name must match the approved program syllabus');
  isoDate(input.classStartDate, 'classStartDate');
  isoDate(input.classEndDate, 'classEndDate');
  const holds: readonly string[] = input.stage === 'j6' ? input.openHolds ?? [] : [];
  // A held J6 can be previewed as a DRAFT but is never signable.
  if (signed && holds.length > 0) throw new Error('A signed document cannot carry open holds');
  if (input.classEndDate !== fiveMonthsLater(input.classStartDate) && !holds.includes('end_date_not_contract')) {
    throw new Error('Class end must be five calendar months after start');
  }
  if (input.tuitionCents !== 750_000) throw new Error('Tuition & Fees must equal $7,500.00');
  if (!(input.letterhead?.logoPng instanceof Uint8Array) || input.letterhead.logoPng.length === 0) throw new Error('Approved WAP logo PNG is required');
  required(input.letterhead.businessPhone, 'letterhead.businessPhone', L.phone);
  required(input.letterhead.addressLine1, 'letterhead.addressLine1', L.addressLine);
  if (input.letterhead.addressLine2 !== undefined) required(input.letterhead.addressLine2, 'letterhead.addressLine2', L.addressLine);
  required(input.letterhead.organizationName, 'letterhead.organizationName', L.organizationName);
  required(input.letterhead.website, 'letterhead.website', L.website);
  if (input.stage === 'j5') {
    if ('signedVoucher' in input || 'financePerson' in input) throw new Error('J5 must precede the voucher and finance stage');
  } else {
    required(input.financePerson?.name, 'financePerson.name', L.personName);
    required(input.financePerson?.email, 'financePerson.email', L.email);
    required(input.paymentInstruction, 'paymentInstruction', L.paymentFollowUpWording);
    required(input.paymentFollowUpWording, 'paymentFollowUpWording', L.paymentFollowUpWording);
    const started = isoDate(input.classStartedAt, 'classStartedAt');
    if (started < isoDate(input.classStartDate, 'classStartDate')) throw new Error('J6 class start cannot precede the confirmed class start date');
    if (started > issueDate) throw new Error('J6 requires class start to be recorded before issue');
    const voucher = input.signedVoucher;
    required(voucher?.reference, 'signedVoucher.reference', L.voucherReference);
    if (isoDate(voucher.receivedDate, 'signedVoucher.receivedDate') > issueDate) throw new Error('Voucher receipt cannot follow J6 issue');
    if (voucher.authorizedAmountCents !== 750_000 && !holds.includes('voucher_amount_differs')) throw new Error('Signed voucher authorized amount must equal $7,500.00');
    if (!/^[0-9a-f]{64}$/iu.test(voucher.sha256)) throw new Error('Signed voucher SHA-256 is required');
    if (voucher.receivingSignatureAttestationId !== null) required(voucher.receivingSignatureAttestationId, 'signedVoucher.receivingSignatureAttestationId', L.attestationId);
    if (signed && voucher.receivingSignatureAttestationId === null) throw new Error('A signed J6 needs the designated signer receiving-signature attestation');
  }
  return frozenAt;
}

function drawText(page: PDFPage, fonts: Fonts, value: string, x: number, y: number, width: number, size = 9.5, bold = false, color = INK): void {
  const text = printable(value);
  const font = bold ? fonts.bold : fonts.regular;
  if (x < 0 || y < 0 || x + width > PAGE_W || y > PAGE_H || font.widthOfTextAtSize(text, size) > width) {
    throw new Error(`PDF text does not fit the one-page layout: ${value.slice(0, 60)}`);
  }
  page.drawText(text, { x, y, size, font, color });
}

function drawRight(page: PDFPage, fonts: Fonts, value: string, right: number, y: number, size = 9.5, bold = false, color = INK): void {
  const text = printable(value);
  const width = (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size);
  drawText(page, fonts, text, right - width, y, width + 0.1, size, bold, color);
}

function drawCentered(page: PDFPage, fonts: Fonts, value: string, y: number, size = 8, bold = false, color = MUTED): void {
  const text = printable(value);
  const width = (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size);
  drawText(page, fonts, text, (PAGE_W - width) / 2, y, width + 0.1, size, bold, color);
}

function wrap(value: string, font: PDFFont, size: number, width: number, maxLines: number): string[] {
  // Wrapping joins words with one plain space; refuse spacing it would silently change.
  if (/[^\S ]| {2}/u.test(value.trim())) throw new Error('PDF text has spacing the layout would not print as typed');
  const words = printable(value).split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > width) throw new Error('A PDF field is too wide for the page');
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) throw new Error('PDF content exceeds its one-page layout');
  return lines;
}

function paragraph(page: PDFPage, fonts: Fonts, value: string, y: number, maxLines: number, size = 9.3): number {
  const lines = wrap(value, fonts.regular, size, CONTENT_W, maxLines);
  for (const line of lines) {
    drawText(page, fonts, line, LEFT, y, CONTENT_W, size);
    y -= 13;
  }
  return y;
}

function recipientRow(page: PDFPage, fonts: Fonts, label: string, value: string, y: number): number {
  drawText(page, fonts, label, LEFT, y, 62, 8.4, true, MUTED);
  drawText(page, fonts, value, LEFT + 62, y, CONTENT_W - 62, 9.1);
  return y - 15;
}

function details(page: PDFPage, fonts: Fonts, rows: ReadonlyArray<readonly [string, string]>, top: number): number {
  const rowH = 22;
  const bottom = top - rows.length * rowH - 10;
  page.drawRectangle({ x: LEFT, y: bottom, width: CONTENT_W, height: top - bottom, color: PALE });
  rows.forEach(([label, value], index) => {
    const y = top - 18 - index * rowH;
    drawText(page, fonts, label, LEFT + 12, y, 116, 8.7, false, MUTED);
    drawText(page, fonts, value, LEFT + 132, y, CONTENT_W - 144, 9.3, true);
    if (index < rows.length - 1) {
      const lineY = y - 7;
      page.drawLine({ start: { x: LEFT + 12, y: lineY }, end: { x: RIGHT - 12, y: lineY }, thickness: 0.5, color: RULE });
    }
  });
  return bottom;
}

export const DRAFT_BADGE = 'DRAFT - SIGNATURE REQUIRED';
export const DRAFT_ON_HOLD_BADGE = 'DRAFT - ON HOLD - NOT SIGNABLE';
export const RECEIVING_SIGNATURE_PENDING_SUFFIX = '(receiving signature not yet attested)';

function drawLetterhead(page: PDFPage, fonts: Fonts, logoWidth: number, logoHeight: number, logo: Awaited<ReturnType<PDFDocument['embedPng']>>, badge: string | null): void {
  const scale = Math.min(183 / logoWidth, 88 / logoHeight);
  page.drawImage(logo, { x: LEFT, y: 682, width: logoWidth * scale, height: logoHeight * scale });
  // The final (signed) page carries no status badge.
  if (badge !== null) {
    const statusW = fonts.bold.widthOfTextAtSize(badge, 7.5) + 22;
    page.drawRectangle({ x: RIGHT - statusW, y: 749, width: statusW, height: 22, color: rgb(1, 0.94, 0.84) });
    drawText(page, fonts, badge, RIGHT - statusW + 11, 756, statusW - 22, 7.5, true, rgb(110 / 255, 68 / 255, 12 / 255));
  }
  page.drawLine({ start: { x: LEFT, y: 667 }, end: { x: RIGHT, y: 667 }, thickness: 1, color: GOLD });
}

function drawFooter(page: PDFPage, fonts: Fonts, input: TwoStageDocumentFacts): void {
  page.drawLine({ start: { x: LEFT, y: 72 }, end: { x: RIGHT, y: 72 }, thickness: 0.6, color: RULE });
  const { organizationName, website, businessPhone, addressLine1, addressLine2 } = input.letterhead;
  drawCentered(page, fonts, organizationName, 56, 8.2, true, INK);
  drawCentered(page, fonts, `${website}  |  ${businessPhone}`, 43, 7.5);
  drawCentered(page, fonts, addressLine2 === undefined ? addressLine1 : `${addressLine1}  |  ${addressLine2}`, 31, 7.5);
}

/** The signature gap above the rule: 245pt wide (the rule), 26pt tall, clear of "Respectfully," above and the rule below. */
const SIGNATURE_BOX = Object.freeze({ width: 240, height: 26, aboveRule: 2 });

function drawSignature(page: PDFPage, fonts: Fonts, input: TwoStageDocumentFacts, y: number, signature: Awaited<ReturnType<PDFDocument['embedPng']>> | null): void {
  if (y < 167) throw new Error('Signature area would collide with the footer');
  drawText(page, fonts, 'Respectfully,', LEFT, y, CONTENT_W, 9.3);
  if (signature) {
    const scale = Math.min(SIGNATURE_BOX.width / signature.width, SIGNATURE_BOX.height / signature.height);
    page.drawImage(signature, { x: LEFT + 2, y: y - 32 + SIGNATURE_BOX.aboveRule, width: signature.width * scale, height: signature.height * scale });
  }
  page.drawLine({ start: { x: LEFT, y: y - 32 }, end: { x: LEFT + 245, y: y - 32 }, thickness: 0.7, color: MUTED });
  if (!signature) drawText(page, fonts, 'Executive signature required before issue', LEFT, y - 44, 350, 7.9, false, MUTED);
  drawText(page, fonts, input.signer.name, LEFT, y - 58, 350, 9.5, true);
  drawText(page, fonts, `${input.signer.title}, ${input.letterhead.organizationName}`, LEFT, y - 71, 350, 8.4);
  if (y - 71 < 78) throw new Error('Signature block overlaps the footer');
}

/** Returns the document bytes (DRAFT or signed); the received voucher is never embedded here. */
async function renderTwoStagePdf(input: TwoStageDocumentFacts, mode: RenderMode): Promise<Uint8Array> {
  // Snapshot all caller-owned data before the first await. In particular, a
  // mutable PNG supplied by a route cannot change while pdf-lib embeds it.
  const facts = structuredClone(input);
  const logoBytes = new Uint8Array(facts.letterhead?.logoPng ?? []);
  const signatureBytes = mode.kind === 'signed' ? new Uint8Array(mode.signaturePng ?? []) : null;
  if (signatureBytes !== null && signatureBytes.length === 0) throw new Error('The approved signature image is required to render a signed document');
  const frozenAt = validateFacts(facts, mode.kind === 'signed');
  const doc = await PDFDocument.create();
  const org = facts.letterhead.organizationName;
  doc.setTitle(`${facts.stage.toUpperCase()} ${facts.title} - ${facts.documentNumber}`);
  doc.setAuthor(org);
  doc.setCreator(`${org} billing`);
  doc.setProducer(`${org} billing`);
  doc.setSubject(`${facts.student.name} - ${facts.className}`);
  doc.setCreationDate(frozenAt);
  doc.setModificationDate(frozenAt);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await doc.embedPng(logoBytes);
  const signatureImage = signatureBytes ? await doc.embedPng(signatureBytes) : null;
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const held = facts.stage === 'j6' && (facts.openHolds?.length ?? 0) > 0;
  drawLetterhead(page, fonts, logo.width, logo.height, logo, signatureImage ? null : held ? DRAFT_ON_HOLD_BADGE : DRAFT_BADGE);
  drawFooter(page, fonts, facts);

  drawText(page, fonts, facts.stage.toUpperCase(), LEFT, 642, 50, 9.5, true, RED);
  drawRight(page, fonts, longDate(facts.issueDate), RIGHT, 642, 9, false, MUTED);
  drawText(page, fonts, facts.title, LEFT, 621, CONTENT_W, 19, true);
  let y = 590;
  if (facts.stage === 'j5') {
    y = recipientRow(page, fonts, 'TO', `${facts.counselor.name} | ${facts.counselor.email}`, y);
    y = recipientRow(page, fonts, 'PHONE', facts.counselor.phone, y);
    y = recipientRow(page, fonts, 'BOARD', facts.boardName, y);
    y = recipientRow(page, fonts, 'RE', facts.student.name, y);
    y -= 12;
    y = paragraph(page, fonts, `At your request, ${org} is providing this training quote for ${facts.student.name}. Please issue a training voucher for the program below through your board's authorization process. This is a quote and voucher request, not an invoice.`, y, 3);
  } else {
    y = recipientRow(page, fonts, 'TO', `${facts.financePerson.name} | ${facts.financePerson.email}`, y);
    y = recipientRow(page, fonts, 'BOARD', facts.boardName, y);
    y = recipientRow(page, fonts, 'COPY', `${facts.counselor.name}; ${facts.student.name}`, y);
    y = recipientRow(page, fonts, 'RE', `Payment for ${facts.student.name} training`, y);
    y -= 12;
    y = paragraph(page, fonts, `${org} requests payment for ${facts.student.name}'s training under signed voucher ${facts.signedVoucher.reference}. The student began class on ${longDate(facts.classStartedAt)}. Please process the tuition and fees amount shown below under your board's procedures.`, y, 3);
  }
  y -= 9;
  drawText(page, fonts, 'TRAINING DETAILS', LEFT, y, CONTENT_W, 8.1, true, MUTED);
  y -= 11;
  const rows: Array<readonly [string, string]> = [
    ['Student', facts.student.name],
    ['Class', facts.className],
    ['Training hours', `${facts.classHours} hours`],
    ['Class start', longDate(facts.classStartDate)],
    ['Class end', longDate(facts.classEndDate)],
  ];
  if (facts.stage === 'j6') rows.push(['Voucher / PO', facts.signedVoucher.reference]);
  y = details(page, fonts, rows, y);
  y -= 13;
  const priceBottom = y - 37;
  page.drawRectangle({ x: LEFT, y: priceBottom, width: CONTENT_W, height: 37, color: PRICE_PALE });
  drawText(page, fonts, facts.tuitionLabel, LEFT + 13, priceBottom + 13, 210, 10.2, true);
  drawRight(page, fonts, formatCents(facts.tuitionCents), RIGHT - 13, priceBottom + 13, 10.4, true);
  y = priceBottom - 18;
  if (facts.stage === 'j5') {
    y = paragraph(page, fonts, `Please send the issued voucher and any authorization details to ${org}. A copy of this request will be retained in the student's file.`, y, 2);
    y -= 5;
    drawText(page, fonts, `Copy: ${facts.student.name} | ${facts.student.email}`, LEFT, y, CONTENT_W, 8.4, false, MUTED);
  } else {
    y = paragraph(page, fonts, `${facts.paymentInstruction} ${facts.paymentFollowUpWording}`, y, 2);
    y -= 4;
    const pending = facts.signedVoucher.receivingSignatureAttestationId === null ? ` ${RECEIVING_SIGNATURE_PENDING_SUFFIX}` : '';
    const enclosure = wrap(`Enclosure for issued packet: received, signed training voucher ${facts.signedVoucher.reference}${pending}`, fonts.regular, 8.4, CONTENT_W, 2);
    enclosure.forEach((line, index) => drawText(page, fonts, line, LEFT, y - index * 11, CONTENT_W, 8.4, false, MUTED));
    y -= (enclosure.length - 1) * 11;
  }
  drawSignature(page, fonts, facts, y - 21, signatureImage);
  return doc.save({ useObjectStreams: false });
}

export function renderJ5QuoteVoucherRequestDraftPdf(input: J5QuoteVoucherRequestFacts): Promise<Uint8Array> {
  if (input.stage !== 'j5') throw new Error('J5 renderer requires J5 facts');
  return renderTwoStagePdf(input, { kind: 'draft' });
}

export function renderJ6InvoiceVoucherCoverLetterDraftPdf(input: J6InvoiceVoucherCoverLetterFacts): Promise<Uint8Array> {
  if (input.stage !== 'j6') throw new Error('J6 renderer requires J6 facts');
  return renderTwoStagePdf(input, { kind: 'draft' });
}

/**
 * The final J5 page: the approved layout with the designated signer's approved
 * signature image. `signaturePng` must be the bytes of the asset frozen in the
 * content (the sign route verifies its hash); it is never a client upload.
 */
export function renderJ5QuoteVoucherRequestSignedPdf(input: J5QuoteVoucherRequestFacts, signaturePng: Uint8Array): Promise<Uint8Array> {
  if (input.stage !== 'j5') throw new Error('J5 renderer requires J5 facts');
  return renderTwoStagePdf(input, { kind: 'signed', signaturePng });
}

/** The final J6 page. Refuses a J6 with open holds or without the receiving-signature attestation. */
export function renderJ6InvoiceVoucherCoverLetterSignedPdf(input: J6InvoiceVoucherCoverLetterFacts, signaturePng: Uint8Array): Promise<Uint8Array> {
  if (input.stage !== 'j6') throw new Error('J6 renderer requires J6 facts');
  return renderTwoStagePdf(input, { kind: 'signed', signaturePng });
}

/**
 * Whether pdf-lib can embed these PNG bytes. The upload route asks before it
 * accepts a signature image, so a stored asset can always be rendered later
 * (the database accepts PNG variants, such as some interlaced or 16-bit files,
 * that a PDF writer may not).
 */
export async function canEmbedSignaturePng(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(new Uint8Array(bytes));
    return image.width > 0 && image.height > 0;
  } catch {
    return false;
  }
}
