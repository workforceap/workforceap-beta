import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrainingProviderIdentity } from './providerIdentity';
import type { PacketLineItem } from './packetSchema';
import { formatLongDate, formatMoney, totalContactHours } from './packetText';

/**
 * J5 (training invoice) and J6 (cover letter) renderers. Both documents are
 * produced from the same signed packet row so the numbers can never drift
 * between them. Letter size, pdf-lib standard fonts, no network access.
 */
export type PacketDocumentInput = {
  packetNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date | null;
  billToName: string;
  billToAttention: string | null;
  billToAddress: string | null;
  billToEmail: string | null;
  referenceNumber: string | null;
  lineItems: PacketLineItem[];
  totalAmount: number;
  coverLetterBody: string;
  signerName: string;
  signerTitle: string;
  signatureImage: string | null;
  signedAt: string | Date;
  member: { fullName: string; email: string };
  programTitle: string;
  provider: TrainingProviderIdentity;
  /** Counselor assigned at signing; false drops the counselor from the J6 cc line. Unknown (legacy) keeps it. */
  counselorAssigned?: boolean;
  /** Letterhead logo bytes (PNG). Optional so tests and cold paths never touch disk. */
  logoPng?: Uint8Array | null;
};

export type PacketDocKind = 'j5' | 'j6';

const PACKET_DOC_LABELS: Record<PacketDocKind, { code: string; title: string; file: string }> = {
  j5: { code: 'J5', title: 'Training Invoice', file: 'J5-training-invoice' },
  j6: { code: 'J6', title: 'Invoice Cover Letter', file: 'J6-cover-letter' },
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const HEADER_H = 78;
const FOOTER_H = 40;
const ACCENT = rgb(173 / 255, 44 / 255, 77 / 255);
const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.45, 0.45, 0.48);
const RULE = rgb(0.84, 0.84, 0.86);
const SHADE = rgb(0.965, 0.955, 0.958);
const WHITE = rgb(1, 1, 1);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

/** Height of the drawn/typed signature area inside the signature block. */
const SIG_BOX_H = 42;

/**
 * pdf-lib standard fonts only encode WinAnsi. Keep printable Latin-1 plus the
 * common typographic marks WinAnsi carries; swap anything else for '?'.
 */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[^ -~ -ÿ–—‘’“”•…€\n]/gu, '?');
}

export async function loadLetterheadLogo(): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(join(process.cwd(), 'public', 'images', 'wap_logo.png')));
  } catch {
    return null;
  }
}

function toIsoDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

const BULLET = '•';

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitizePdfText(text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const trimmed = paragraph.trim();
    const isBullet = trimmed.startsWith(BULLET) || trimmed.startsWith('- ') || trimmed.startsWith('* ');
    const body = isBullet ? trimmed.replace(/^([•\-*])\s*/, '') : trimmed;
    const prefix = isBullet ? `${BULLET} ` : '';
    const hang = isBullet ? '   ' : '';
    const words = body.split(/\s+/);
    let current = prefix;
    for (const word of words) {
      const candidate = current.endsWith(' ') || current === '' ? `${current}${word}` : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current.trim() && current !== prefix) {
        lines.push(current);
        current = `${hang}${word}`;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) lines.push(current);
  }
  return lines;
}

function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitizePdfText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

class Sheet {
  page: PDFPage;
  y: number;
  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    readonly input: PacketDocumentInput,
    readonly kind: PacketDocKind,
    readonly logo: PDFImage | null,
  ) {
    this.page = this.newPage();
    this.y = PAGE_H - HEADER_H - 30;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.drawLetterhead(page);
    return page;
  }

  ensure(height: number) {
    if (this.y - height < FOOTER_H + 12) {
      this.page = this.newPage();
      this.y = PAGE_H - HEADER_H - 30;
    }
  }

  text(txt: string, opts: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; y?: number }) {
    this.page.drawText(sanitizePdfText(txt), {
      x: opts.x ?? MARGIN,
      y: opts.y ?? this.y,
      size: opts.size ?? 10,
      font: opts.font ?? this.fonts.regular,
      color: opts.color ?? INK,
    });
  }

  paragraph(
    txt: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; leading?: number } = {},
  ) {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.fonts.regular;
    const leading = opts.leading ?? size * 1.45;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? PAGE_W - MARGIN - x;
    for (const line of wrap(txt, font, size, width)) {
      this.ensure(leading);
      if (line.trim()) this.text(line, { x, size, font, color: opts.color });
      this.y -= leading;
    }
  }

  gap(h: number) {
    this.y -= h;
  }

  rule(color = RULE, thickness = 0.6) {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness, color });
  }

  private drawLetterhead(page: PDFPage) {
    const { provider } = this.input;
    const label = PACKET_DOC_LABELS[this.kind];
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: ACCENT });

    let textX = MARGIN;
    if (this.logo) {
      const logoH = 34;
      const logoW = (this.logo.width / this.logo.height) * logoH;
      page.drawImage(this.logo, { x: MARGIN, y: PAGE_H - HEADER_H + (HEADER_H - logoH) / 2, width: logoW, height: logoH });
      textX = MARGIN + logoW + 14;
    }
    const pale = rgb(1, 0.9, 0.92);
    page.drawText(sanitizePdfText(provider.legalName), { x: textX, y: PAGE_H - 30, size: 13, font: this.fonts.bold, color: WHITE });
    const contact = [...provider.addressLines, `${provider.phone}  |  ${provider.website}`].join('   |   ');
    page.drawText(ellipsize(contact, this.fonts.regular, 7.5, PAGE_W - MARGIN - textX - 100), {
      x: textX,
      y: PAGE_H - 44,
      size: 7.5,
      font: this.fonts.regular,
      color: pale,
    });
    page.drawText(sanitizePdfText(`${provider.entityLine}  |  EIN ${provider.ein}`), {
      x: textX,
      y: PAGE_H - 56,
      size: 7.5,
      font: this.fonts.regular,
      color: pale,
    });

    const badge = `FORM ${label.code}`;
    const badgeW = this.fonts.bold.widthOfTextAtSize(badge, 9) + 16;
    page.drawRectangle({ x: PAGE_W - MARGIN - badgeW, y: PAGE_H - 40, width: badgeW, height: 20, color: WHITE, opacity: 0.16 });
    page.drawRectangle({ x: PAGE_W - MARGIN - badgeW, y: PAGE_H - 40, width: badgeW, height: 20, borderColor: WHITE, borderWidth: 0.8, opacity: 0 });
    page.drawText(badge, { x: PAGE_W - MARGIN - badgeW + 8, y: PAGE_H - 34, size: 9, font: this.fonts.bold, color: WHITE });
    const titleW = this.fonts.regular.widthOfTextAtSize(label.title, 8);
    page.drawText(label.title, { x: PAGE_W - MARGIN - titleW, y: PAGE_H - 54, size: 8, font: this.fonts.regular, color: pale });
  }

  finishFooters() {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      page.drawLine({ start: { x: MARGIN, y: FOOTER_H }, end: { x: PAGE_W - MARGIN, y: FOOTER_H }, thickness: 0.5, color: RULE });
      const left = `${this.input.provider.legalName}  |  ${PACKET_DOC_LABELS[this.kind].code} ${this.input.packetNumber}  |  ${this.input.member.fullName}`;
      page.drawText(ellipsize(left, this.fonts.regular, 7.5, PAGE_W - MARGIN * 2 - 90), {
        x: MARGIN,
        y: FOOTER_H - 12,
        size: 7.5,
        font: this.fonts.regular,
        color: MUTED,
      });
      const right = `Page ${i + 1} of ${pages.length}`;
      const rw = this.fonts.regular.widthOfTextAtSize(right, 7.5);
      page.drawText(right, { x: PAGE_W - MARGIN - rw, y: FOOTER_H - 12, size: 7.5, font: this.fonts.regular, color: MUTED });
    });
  }

  /**
   * Signature block: drawn PNG or typed name in italics, then name/title/date.
   * `tail` lines (enclosure, cc) are reserved with the block and printed under
   * it, so a closing never lands alone on a trailing page.
   */
  static signatureHeight(hasLead: boolean, tailCount = 0): number {
    return (hasLead ? 18 : 0) + SIG_BOX_H + 4 + 13 * 4 + 12 + tailCount * 12;
  }

  async signature(lead: string, tail: string[] = []) {
    const { input } = this;
    const sigBoxH = SIG_BOX_H;
    this.ensure(Sheet.signatureHeight(Boolean(lead), tail.length));
    if (lead) {
      this.text(lead, { size: 9.5, color: MUTED });
      this.gap(8);
    }

    const sigBoxW = 220;
    const sigTop = this.y;
    let drawn = false;
    if (input.signatureImage) {
      try {
        const base64 = input.signatureImage.replace(/^data:image\/png;base64,/, '');
        const image = await this.doc.embedPng(Buffer.from(base64, 'base64'));
        const scale = Math.min(sigBoxW / image.width, sigBoxH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        this.page.drawImage(image, { x: MARGIN, y: sigTop - sigBoxH + (sigBoxH - h) / 2, width: w, height: h });
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      this.text(input.signerName, { size: 20, font: this.fonts.italic, color: rgb(0.1, 0.15, 0.45), y: sigTop - sigBoxH + 14 });
    }
    this.y = sigTop - sigBoxH - 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 260, y: this.y }, thickness: 0.8, color: INK });
    this.gap(13);
    this.text(input.signerName, { size: 10.5, font: this.fonts.bold });
    this.gap(13);
    this.text(`${input.signerTitle}, ${input.provider.legalName}`, { size: 9.5, color: MUTED });
    this.gap(13);
    this.text(`${input.provider.email}  |  ${input.provider.phone}`, { size: 9.5, color: MUTED });
    this.gap(13);
    this.text(
      `Signed ${formatLongDate(toIsoDate(input.signedAt))}${drawn ? ' (electronic signature)' : ' (typed signature)'}`,
      { size: 9, color: MUTED },
    );
    this.gap(12);
    for (const line of tail) {
      this.text(line, { size: 9, color: MUTED });
      this.gap(12);
    }
  }
}

async function open(input: PacketDocumentInput, kind: PacketDocKind) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${PACKET_DOC_LABELS[kind].code} ${PACKET_DOC_LABELS[kind].title} ${input.packetNumber}`);
  doc.setAuthor(input.provider.legalName);
  doc.setSubject(`${input.member.fullName} - ${input.programTitle}`);
  doc.setCreator(`${input.provider.shortName} billing`);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  let logo: PDFImage | null = null;
  if (input.logoPng) {
    try {
      logo = await doc.embedPng(input.logoPng);
    } catch {
      logo = null;
    }
  }
  return { doc, sheet: new Sheet(doc, fonts, input, kind, logo) };
}

function billToLines(input: PacketDocumentInput): string[] {
  const lines = [input.billToName];
  if (input.billToAttention) lines.push(`Attn: ${input.billToAttention}`);
  if (input.billToAddress) lines.push(...input.billToAddress.split('\n').map((l) => l.trim()).filter(Boolean));
  if (input.billToEmail) lines.push(input.billToEmail);
  return lines;
}

/** J5: itemized training invoice with class-by-class price breakdown. */
export async function renderJ5InvoicePdf(input: PacketDocumentInput): Promise<Uint8Array> {
  const { doc, sheet } = await open(input, 'j5');
  const f = sheet.fonts;

  sheet.text('Training Invoice', { size: 22, font: f.bold, color: ACCENT });
  sheet.gap(16);
  // Invoice meta on the right.
  const metaX = PAGE_W - MARGIN - 230;
  sheet.text(ellipsize(`${input.programTitle}  |  ${input.member.fullName}`, f.regular, 10.5, metaX - MARGIN - 14), {
    size: 10.5,
    color: MUTED,
  });
  const meta: Array<[string, string]> = [
    ['Invoice number', input.packetNumber],
    ['Invoice date', formatLongDate(toIsoDate(input.invoiceDate))],
    ['Due date', input.dueDate ? formatLongDate(toIsoDate(input.dueDate)) : 'Net 30 from receipt'],
  ];
  if (input.referenceNumber) meta.push(['Reference / voucher', input.referenceNumber]);
  let metaY = PAGE_H - HEADER_H - 30;
  for (const [k, v] of meta) {
    sheet.text(k, { x: metaX, y: metaY, size: 8.5, color: MUTED });
    sheet.text(ellipsize(v, f.bold, 9.5, 125), { x: metaX + 105, y: metaY, size: 9.5, font: f.bold });
    metaY -= 14;
  }
  sheet.y = Math.min(sheet.y - 22, metaY - 6);
  sheet.rule();
  sheet.gap(14);

  // Bill to / participant columns.
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2;
  const startY = sheet.y;
  sheet.text('BILL TO', { size: 8, font: f.bold, color: ACCENT });
  sheet.gap(13);
  for (const line of billToLines(input)) {
    sheet.text(ellipsize(line, f.regular, 10, colW), { size: 10 });
    sheet.gap(13);
  }
  const leftEnd = sheet.y;
  sheet.y = startY;
  const rightX = MARGIN + colW + 24;
  sheet.text('PARTICIPANT', { x: rightX, size: 8, font: f.bold, color: ACCENT });
  sheet.gap(13);
  const participant = [
    input.member.fullName,
    input.member.email,
    `Program: ${input.programTitle}`,
    `Provider contact: ${input.provider.email}`,
  ];
  for (const line of participant) {
    sheet.text(ellipsize(line, f.regular, 10, colW), { x: rightX, size: 10 });
    sheet.gap(13);
  }
  sheet.y = Math.min(leftEnd, sheet.y) - 10;

  // Line-item table.
  const cols = { idx: MARGIN, desc: MARGIN + 26, hours: PAGE_W - MARGIN - 190, amount: PAGE_W - MARGIN };
  const descW = cols.hours - cols.desc - 14;
  const drawHeader = () => {
    sheet.ensure(24);
    sheet.page.drawRectangle({ x: MARGIN, y: sheet.y - 6, width: PAGE_W - MARGIN * 2, height: 20, color: SHADE });
    sheet.text('#', { x: cols.idx + 4, size: 8.5, font: f.bold, color: MUTED });
    sheet.text('CLASS / ITEM', { x: cols.desc, size: 8.5, font: f.bold, color: MUTED });
    sheet.text('CONTACT HOURS', { x: cols.hours, size: 8.5, font: f.bold, color: MUTED });
    const aw = f.bold.widthOfTextAtSize('AMOUNT', 8.5);
    sheet.text('AMOUNT', { x: cols.amount - aw, size: 8.5, font: f.bold, color: MUTED });
    sheet.gap(20);
  };
  drawHeader();
  input.lineItems.forEach((row, i) => {
    const lines = wrap(row.description, f.regular, 10, descW);
    const rowH = Math.max(1, lines.length) * 13 + 8;
    if (sheet.y - rowH < FOOTER_H + 12) {
      sheet.ensure(rowH + 30);
      drawHeader();
    }
    sheet.text(String(i + 1), { x: cols.idx + 4, size: 10, color: MUTED });
    lines.forEach((line, li) => sheet.text(line, { x: cols.desc, y: sheet.y - li * 13, size: 10 }));
    const hours = row.hours != null ? `${row.hours}` : '—';
    sheet.text(hours, { x: cols.hours + 30, size: 10 });
    const amount = formatMoney(row.amount);
    const aw = f.regular.widthOfTextAtSize(amount, 10);
    sheet.text(amount, { x: cols.amount - aw, size: 10 });
    // Rule sits under the row's last line (below the descenders), never through the text.
    const ruleY = sheet.y - (lines.length - 1) * 13 - 7;
    sheet.page.drawLine({ start: { x: MARGIN, y: ruleY }, end: { x: PAGE_W - MARGIN, y: ruleY }, thickness: 0.4, color: RULE });
    sheet.y -= rowH;
  });

  // Totals.
  sheet.ensure(60);
  sheet.gap(4);
  const hours = totalContactHours(input.lineItems);
  const totalsX = cols.hours - 60;
  sheet.text('Total contact hours', { x: totalsX, size: 9.5, color: MUTED });
  const hw = f.regular.widthOfTextAtSize(`${hours}`, 9.5);
  sheet.text(`${hours}`, { x: cols.amount - hw, size: 9.5 });
  sheet.gap(18);
  sheet.page.drawRectangle({ x: totalsX - 10, y: sheet.y - 8, width: PAGE_W - MARGIN - totalsX + 10, height: 26, color: SHADE });
  sheet.text('TOTAL DUE', { x: totalsX, size: 10.5, font: f.bold, color: ACCENT });
  const total = formatMoney(input.totalAmount);
  const tw = f.bold.widthOfTextAtSize(total, 13);
  sheet.text(total, { x: cols.amount - tw, size: 13, font: f.bold, color: ACCENT });
  sheet.gap(26);

  // Remit / terms, reserved together with the signature block so a long
  // invoice never leaves the closing alone on a page of its own.
  const remitText = `Training is provided at no cost to the participant. This invoice is billed to the funding partner named above. Please remit payment to ${input.provider.legalName}, ${input.provider.addressLines.join(', ')} (EIN ${input.provider.ein}), or contact ${input.provider.email} for electronic payment details. Reference invoice ${input.packetNumber} on all remittances.`;
  const remitLeading = 9 * 1.45;
  const remitHeight = wrap(remitText, f.regular, 9, PAGE_W - MARGIN * 2).length * remitLeading;
  sheet.ensure(remitHeight + 6 + Sheet.signatureHeight(true));
  sheet.paragraph(remitText, { size: 9, color: MUTED });
  sheet.gap(6);

  await sheet.signature('I certify that the classes and amounts above are accurate and that the participant is enrolled as stated.');
  sheet.finishFooters();
  return doc.save();
}

/** Enclosure and cc lines under the J6 signature. No counselor at signing, no counselor cc. */
export function j6EnclosureLines(input: PacketDocumentInput): string[] {
  return [
    `Enclosure: Form J5 Training Invoice ${input.packetNumber} (${formatMoney(input.totalAmount)})`,
    `cc: ${input.member.fullName} (participant)${input.counselorAssigned === false ? '' : '; assigned career counselor'}`,
  ];
}

/** J6: cover letter transmitting the J5 invoice to the funding partner. */
export async function renderJ6CoverLetterPdf(input: PacketDocumentInput): Promise<Uint8Array> {
  const { doc, sheet } = await open(input, 'j6');
  const f = sheet.fonts;

  sheet.text(formatLongDate(toIsoDate(input.invoiceDate)), { size: 10.5 });
  sheet.gap(20);
  for (const line of billToLines(input)) {
    sheet.text(line, { size: 10.5 });
    sheet.gap(13);
  }
  sheet.gap(8);
  sheet.paragraph(`RE: Training invoice ${input.packetNumber} — ${input.member.fullName}, ${input.programTitle}`, {
    font: f.bold,
    size: 10.5,
  });
  sheet.gap(8);
  const salutation = input.billToAttention ? `Dear ${input.billToAttention},` : 'To Whom It May Concern:';
  sheet.text(salutation, { size: 10.5 });
  sheet.gap(16);

  for (const block of sanitizePdfText(input.coverLetterBody).split(/\n{2,}/)) {
    sheet.paragraph(block, { size: 10.5, leading: 14.6 });
    sheet.gap(6);
  }

  sheet.gap(4);
  // Closing, signature, enclosure and cc are one unit: reserve exactly what
  // they occupy so the letter only breaks when the body genuinely runs long.
  const tail = j6EnclosureLines(input);
  sheet.ensure(14 + 4 + Sheet.signatureHeight(false, tail.length));
  sheet.text('Respectfully,', { size: 10.5 });
  sheet.gap(4);
  await sheet.signature('', tail);

  sheet.finishFooters();
  return doc.save();
}

/**
 * Both documents in one file (J6 cover letter first, then the J5 invoice it
 * transmits) so the office can download or print the whole packet in one go.
 */
export async function renderPacketBundlePdf(input: PacketDocumentInput): Promise<Uint8Array> {
  const [j6, j5] = await Promise.all([renderJ6CoverLetterPdf(input), renderJ5InvoicePdf(input)]);
  const bundle = await PDFDocument.create();
  bundle.setTitle(`Training invoice packet ${input.packetNumber}`);
  bundle.setAuthor(input.provider.legalName);
  bundle.setSubject(`${input.member.fullName} - ${input.programTitle}`);
  bundle.setCreator(`${input.provider.shortName} billing`);
  for (const bytes of [j6, j5]) {
    const source = await PDFDocument.load(bytes);
    const pages = await bundle.copyPages(source, source.getPageIndices());
    pages.forEach((page) => bundle.addPage(page));
  }
  return bundle.save();
}

/** 'both' renders the cover letter and invoice merged into a single PDF. */
export type PacketDownloadKind = PacketDocKind | 'both';

export function parsePacketDownloadKind(value: string | null | undefined): PacketDownloadKind {
  if (value === 'j6') return 'j6';
  if (value === 'both') return 'both';
  return 'j5';
}

export async function renderPacketDocument(kind: PacketDownloadKind, input: PacketDocumentInput): Promise<Uint8Array> {
  if (kind === 'both') return renderPacketBundlePdf(input);
  return kind === 'j5' ? renderJ5InvoicePdf(input) : renderJ6CoverLetterPdf(input);
}

export function packetDocumentFilename(kind: PacketDownloadKind, packetNumber: string, memberName: string): string {
  const slug = memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'participant';
  const base = kind === 'both' ? 'J5-J6-invoice-packet' : PACKET_DOC_LABELS[kind].file;
  return `${base}-${packetNumber}-${slug}.pdf`;
}
