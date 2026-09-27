import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * One-page, side-effect-free renderers for the two distinct WAP billing stages.
 * Callers must pass an immutable stage snapshot and the approved WAP logo bytes.
 * Rendering neither signs a PDF cryptographically nor authorizes a user: the
 * server must verify the executive action before constructing `mode: 'signed'`.
 */

export type ExecutiveSignatureState =
  | { readonly mode: 'draft' }
  | {
      readonly mode: 'signed';
      readonly proof: {
        /** Only a trusted server route may assert this after checking the actor. */
        readonly source: 'server-verified-executive-action';
        readonly signerName: 'Michael A. Brown';
        readonly signerUserId: string;
        readonly approvalEventId: string;
        readonly approvedAt: string;
      };
    };

type Person = { readonly name: string; readonly email: string };

type CommonFacts = {
  readonly documentNumber: string;
  readonly issueDate: string; // YYYY-MM-DD, frozen by the server
  readonly frozenAt: string; // UTC ISO instant, also used for deterministic PDF metadata
  readonly student: Person;
  readonly boardName: string;
  readonly counselor: Person & { readonly phone: string };
  readonly className: string;
  readonly classHours: 160 | 200;
  readonly classStartDate: string;
  readonly classEndDate: string; // exactly five calendar months after start
  readonly tuitionCents: 750_000;
  readonly letterhead: {
    readonly logoPng: Uint8Array;
    readonly businessPhone: string;
    readonly addressLine1: string;
    readonly addressLine2: string;
  };
  readonly signature: ExecutiveSignatureState;
};

export type J5QuoteVoucherRequestFacts = CommonFacts & {
  readonly stage: 'j5';
};

export type J6InvoiceVoucherCoverLetterFacts = CommonFacts & {
  readonly stage: 'j6';
  readonly financePerson: Person;
  readonly classStartedAt: string;
  /** The received, executive-signed voucher remains a separate attachment. */
  readonly signedVoucher: {
    readonly reference: string;
    readonly receivedDate: string;
    readonly sha256: string;
    readonly receivingSignatureAttestationId: string;
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
  // not silently replace a student's name or a voucher reference with '?'.
  const text = value.replace(/[\u2018\u2019]/gu, "'").replace(/[\u2013\u2014]/gu, '-').replace(/\u00a0/gu, ' ');
  if (/[^\x20-\x7e\u00a1-\u00ff\u20ac]/u.test(text)) throw new Error('PDF text contains a glyph unsupported by the standard font');
  return text;
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

function longDate(value: string): string {
  const date = isoDate(value, 'date');
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function validateFacts(input: TwoStageDocumentFacts): Date {
  if (input.stage !== 'j5' && input.stage !== 'j6') throw new Error('Unknown billing stage');
  required(input.documentNumber, 'documentNumber', 64);
  const issueDate = isoDate(input.issueDate, 'issueDate');
  const frozenAt = utcInstant(input.frozenAt, 'frozenAt');
  required(input.student?.name, 'student.name', 90);
  required(input.student?.email, 'student.email', 254);
  required(input.boardName, 'boardName', 100);
  required(input.counselor?.name, 'counselor.name', 90);
  required(input.counselor?.email, 'counselor.email', 254);
  required(input.counselor?.phone, 'counselor.phone', 40);
  required(input.className, 'className', 110);
  isoDate(input.classStartDate, 'classStartDate');
  isoDate(input.classEndDate, 'classEndDate');
  if (input.classEndDate !== fiveMonthsLater(input.classStartDate)) throw new Error('Class end must be five calendar months after start');
  if (input.classHours !== 160 && input.classHours !== 200) throw new Error('Class hours must be 160 or 200');
  if (input.tuitionCents !== 750_000) throw new Error('Tuition & Fees must equal $7,500.00');
  if (!(input.letterhead?.logoPng instanceof Uint8Array) || input.letterhead.logoPng.length === 0) throw new Error('Approved WAP logo PNG is required');
  required(input.letterhead.businessPhone, 'letterhead.businessPhone', 40);
  required(input.letterhead.addressLine1, 'letterhead.addressLine1', 100);
  required(input.letterhead.addressLine2, 'letterhead.addressLine2', 100);
  if (input.signature?.mode === 'signed') {
    const proof = input.signature.proof;
    if (proof?.source !== 'server-verified-executive-action' || proof.signerName !== 'Michael A. Brown') {
      throw new Error('Signed rendering requires server-verified Michael A. Brown authorization');
    }
    required(proof.signerUserId, 'signature.proof.signerUserId', 100);
    required(proof.approvalEventId, 'signature.proof.approvalEventId', 100);
    utcInstant(proof.approvedAt, 'signature.proof.approvedAt');
  } else if (input.signature?.mode !== 'draft') {
    throw new Error('Explicit draft or signed signature mode is required');
  }
  if (input.stage === 'j5') {
    if ('signedVoucher' in input || 'financePerson' in input) throw new Error('J5 must precede the voucher and finance stage');
  } else {
    required(input.financePerson?.name, 'financePerson.name', 90);
    required(input.financePerson?.email, 'financePerson.email', 254);
    const started = isoDate(input.classStartedAt, 'classStartedAt');
    if (started < isoDate(input.classStartDate, 'classStartDate')) throw new Error('J6 class start cannot precede the confirmed class start date');
    if (started > issueDate) throw new Error('J6 requires class start to be recorded before issue');
    const voucher = input.signedVoucher;
    required(voucher?.reference, 'signedVoucher.reference', 80);
    if (isoDate(voucher.receivedDate, 'signedVoucher.receivedDate') > issueDate) throw new Error('Voucher receipt cannot follow J6 issue');
    if (!/^[0-9a-f]{64}$/iu.test(voucher.sha256)) throw new Error('Signed voucher SHA-256 is required');
    required(voucher.receivingSignatureAttestationId, 'signedVoucher.receivingSignatureAttestationId', 100);
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

function drawLetterhead(page: PDFPage, fonts: Fonts, input: TwoStageDocumentFacts, logoWidth: number, logoHeight: number, logo: Awaited<ReturnType<PDFDocument['embedPng']>>): void {
  const scale = Math.min(183 / logoWidth, 88 / logoHeight);
  page.drawImage(logo, { x: LEFT, y: 682, width: logoWidth * scale, height: logoHeight * scale });
  const status = input.signature.mode === 'draft' ? 'DRAFT - SIGNATURE REQUIRED' : 'SIGNED - APPROVAL RECORDED';
  const statusW = fonts.bold.widthOfTextAtSize(status, 7.5) + 22;
  page.drawRectangle({ x: RIGHT - statusW, y: 749, width: statusW, height: 22, color: rgb(1, 0.94, 0.84) });
  drawText(page, fonts, status, RIGHT - statusW + 11, 756, statusW - 22, 7.5, true, rgb(110 / 255, 68 / 255, 12 / 255));
  page.drawLine({ start: { x: LEFT, y: 667 }, end: { x: RIGHT, y: 667 }, thickness: 1, color: GOLD });
}

function drawFooter(page: PDFPage, fonts: Fonts, input: TwoStageDocumentFacts): void {
  page.drawLine({ start: { x: LEFT, y: 72 }, end: { x: RIGHT, y: 72 }, thickness: 0.6, color: RULE });
  drawCentered(page, fonts, 'Workforce Advancement Project', 56, 8.2, true, INK);
  drawCentered(page, fonts, `www.WorkforceAP.org  |  ${input.letterhead.businessPhone}`, 43, 7.5);
  drawCentered(page, fonts, `${input.letterhead.addressLine1}  |  ${input.letterhead.addressLine2}`, 31, 7.5);
}

function drawSignature(page: PDFPage, fonts: Fonts, input: TwoStageDocumentFacts, y: number): void {
  if (y < 167) throw new Error('Signature area would collide with the footer');
  drawText(page, fonts, 'Respectfully,', LEFT, y, CONTENT_W, 9.3);
  page.drawLine({ start: { x: LEFT, y: y - 32 }, end: { x: LEFT + 245, y: y - 32 }, thickness: 0.7, color: MUTED });
  if (input.signature.mode === 'draft') {
    drawText(page, fonts, 'Executive signature required before issue', LEFT, y - 44, 350, 7.9, false, MUTED);
  } else {
    const date = input.signature.proof.approvedAt.slice(0, 10);
    drawText(page, fonts, `Executive approval recorded ${longDate(date)}`, LEFT, y - 44, 350, 7.9, false, MUTED);
  }
  drawText(page, fonts, 'Michael A. Brown, PMP, ChE', LEFT, y - 58, 350, 9.5, true);
  drawText(page, fonts, 'Executive Director, Workforce Advancement Project', LEFT, y - 71, 350, 8.4);
  if (input.signature.mode === 'signed') {
    drawText(page, fonts, `Approval reference: ${input.signature.proof.approvalEventId}`, LEFT, y - 84, CONTENT_W, 7.4, false, MUTED);
  }
  if (y - (input.signature.mode === 'signed' ? 84 : 71) < 78) throw new Error('Signature block overlaps the footer');
}

/** Returns frozen document bytes; the signed voucher is never embedded here. */
export async function renderTwoStageDocumentPdf(input: TwoStageDocumentFacts): Promise<Uint8Array> {
  const frozenAt = validateFacts(input);
  const doc = await PDFDocument.create();
  const title = input.stage === 'j5' ? 'J5 Quote / Voucher Request' : 'J6 Invoice / Voucher Cover Letter';
  doc.setTitle(`${title} - ${input.documentNumber}`);
  doc.setAuthor('Workforce Advancement Project');
  doc.setCreator('Workforce Advancement Project billing');
  doc.setProducer('Workforce Advancement Project billing');
  doc.setSubject(`${input.student.name} - ${input.className}`);
  doc.setCreationDate(frozenAt);
  doc.setModificationDate(frozenAt);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  // Copy caller-owned bytes before the first await. A missing or bad logo is an
  // error, rather than silently shipping an unbranded letter.
  const logoBytes = new Uint8Array(input.letterhead.logoPng);
  const logo = await doc.embedPng(logoBytes);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  drawLetterhead(page, fonts, input, logo.width, logo.height, logo);
  drawFooter(page, fonts, input);

  drawText(page, fonts, input.stage.toUpperCase(), LEFT, 642, 50, 9.5, true, RED);
  drawRight(page, fonts, longDate(input.issueDate), RIGHT, 642, 9, false, MUTED);
  drawText(page, fonts, input.stage === 'j5' ? 'Quote / Voucher Request' : 'Invoice / Voucher Cover Letter', LEFT, 621, CONTENT_W, 19, true);
  let y = 590;
  if (input.stage === 'j5') {
    y = recipientRow(page, fonts, 'TO', `${input.counselor.name} | ${input.counselor.email}`, y);
    y = recipientRow(page, fonts, 'PHONE', input.counselor.phone, y);
    y = recipientRow(page, fonts, 'BOARD', input.boardName, y);
    y = recipientRow(page, fonts, 'RE', input.student.name, y);
    y -= 12;
    y = paragraph(page, fonts, `At your request, Workforce Advancement Project is providing this training quote for ${input.student.name}. Please issue a training voucher for the program below through your board's authorization process. This is a quote and voucher request, not an invoice.`, y, 3);
  } else {
    y = recipientRow(page, fonts, 'TO', `${input.financePerson.name} | ${input.financePerson.email}`, y);
    y = recipientRow(page, fonts, 'BOARD', input.boardName, y);
    y = recipientRow(page, fonts, 'COPY', `${input.counselor.name}; ${input.student.name}`, y);
    y = recipientRow(page, fonts, 'RE', `Payment for ${input.student.name} training`, y);
    y -= 12;
    y = paragraph(page, fonts, `Workforce Advancement Project requests payment for ${input.student.name}'s training under signed voucher ${input.signedVoucher.reference}. The student began class on ${longDate(input.classStartedAt)}. Please process the tuition and fees amount shown below under your board's procedures.`, y, 3);
  }
  y -= 9;
  drawText(page, fonts, 'TRAINING DETAILS', LEFT, y, CONTENT_W, 8.1, true, MUTED);
  y -= 11;
  const rows: Array<readonly [string, string]> = [
    ['Student', input.student.name],
    ['Class', input.className],
    ['Training hours', `${input.classHours} hours`],
    ['Class start', longDate(input.classStartDate)],
    ['Class end', longDate(input.classEndDate)],
  ];
  if (input.stage === 'j6') rows.push(['Voucher / PO', input.signedVoucher.reference]);
  y = details(page, fonts, rows, y);
  y -= 13;
  const priceBottom = y - 37;
  page.drawRectangle({ x: LEFT, y: priceBottom, width: CONTENT_W, height: 37, color: PRICE_PALE });
  drawText(page, fonts, 'Tuition & Fees', LEFT + 13, priceBottom + 13, 210, 10.2, true);
  drawRight(page, fonts, '$7,500.00', RIGHT - 13, priceBottom + 13, 10.4, true);
  y = priceBottom - 18;
  if (input.stage === 'j5') {
    y = paragraph(page, fonts, "Please send the issued voucher and any authorization details to Workforce Advancement Project. A copy of this request will be retained in the student's file.", y, 2);
    y -= 5;
    drawText(page, fonts, `Copy: ${input.student.name} | ${input.student.email}`, LEFT, y, CONTENT_W, 8.4, false, MUTED);
  } else {
    y = paragraph(page, fonts, 'Please arrange payment by check or wire to Workforce Advancement Project and confirm the expected remittance date. We will follow up in 10 to 14 days if payment has not been recorded.', y, 2);
    y -= 4;
    drawText(page, fonts, `Enclosure: received, signed training voucher ${input.signedVoucher.reference}`, LEFT, y, CONTENT_W, 8.4, false, MUTED);
    y -= 13;
    drawText(page, fonts, `Copy: ${input.counselor.name}; ${input.student.name}. Both documents retained in the student's file.`, LEFT, y, CONTENT_W, 8.1, false, MUTED);
  }
  drawSignature(page, fonts, input, y - 21);
  return doc.save({ useObjectStreams: false });
}

export function renderJ5QuoteVoucherRequestPdf(input: J5QuoteVoucherRequestFacts): Promise<Uint8Array> {
  return renderTwoStageDocumentPdf(input);
}

export function renderJ6InvoiceVoucherCoverLetterPdf(input: J6InvoiceVoucherCoverLetterFacts): Promise<Uint8Array> {
  return renderTwoStageDocumentPdf(input);
}
