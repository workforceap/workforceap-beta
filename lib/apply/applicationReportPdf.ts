import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, rgb } from 'pdf-lib';
import { applicationReportDate, type ApplicationReport } from './applicationReport';

let fontBytes: Promise<Buffer> | undefined;
const FONT_PATH = path.join(process.cwd(), 'assets/application-report/DejaVuSans.ttf');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  let lineWidth = 0;
  const widths = new Map<string, number>();
  const measure = (value: string) => {
    const cached = widths.get(value);
    if (cached !== undefined) return cached;
    const result = font.widthOfTextAtSize(value, size);
    widths.set(value, result);
    return result;
  };
  const spaceWidth = measure(' ');
  for (const word of text.replace(/\s+/gu, ' ').split(' ')) {
    const wordWidth = measure(word);
    if (line && lineWidth + spaceWidth + wordWidth > width) { lines.push(line); line = ''; lineWidth = 0; }
    if (wordWidth <= width) {
      lineWidth += (line ? spaceWidth : 0) + wordWidth;
      line += (line ? ' ' : '') + word;
      continue;
    }
    // Long email addresses and unbroken Unicode text must also fit.
    for (const char of (line ? ' ' : '') + word) {
      const charWidth = measure(char);
      if (line && lineWidth + charWidth > width) { lines.push(line); line = ''; lineWidth = 0; }
      line += char;
      lineWidth += charWidth;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** One Letter page, with no silent clipping. Unusual oversized historical
 * records use a complete HTML attachment instead of an unreadable PDF. */
export async function applicationReportPdf(report: ApplicationReport, applicationId: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  fontBytes ??= readFile(FONT_PATH).catch((error) => { fontBytes = undefined; throw error; });
  const font = await doc.embedFont(await fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  const printable = (text: string) => Array.from(text.replace(/[\u0000-\u001f\u007f]/gu, ' '), (char) => {
    if (supported.has(char.codePointAt(0)!)) return char;
    // Use the full Unicode HTML copy instead of changing an applicant's name
    // into missing-glyph boxes, question marks or character codes.
    throw new Error('APPLICATION_REPORT_UNSUPPORTED_GLYPH');
  }).join('');
  const rows = report.sections.flatMap((section) => [
    { heading: true, text: printable(section.title) },
    ...section.fields.map(({ label, value }) => ({ heading: false, text: printable(`${label}: ${value}`) })),
  ]);
  let size = 10;
  const layout = () => rows.map((row) => ({ ...row, lines: wrap(row.text, font, size, 528) }));
  let lines = layout();
  const height = () => lines.reduce((sum, row) => sum + row.lines.length * size * 1.25 + (row.heading ? 9 : 2), 0);
  while (height() > 588 && size > 7) { size -= 0.25; lines = layout(); }
  if (height() > 588) throw new Error('APPLICATION_REPORT_TOO_LONG');
  const page = doc.addPage([612, 792]);
  const draw = (text: string, x: number, y: number, fontSize: number) => page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.08, 0.08, 0.08) });
  draw('WORKFORCE ADVANCEMENT PROJECT', 42, 753, 11);
  draw('Application report', 42, 729, 20);
  draw(`Submitted: ${applicationReportDate(report.submittedAt)}`, 42, 710, 8);
  draw(`Application ID: ${applicationId}`, 42, 697, 7);
  let y = 676;
  for (const row of lines) {
    if (row.heading) {
      y -= 6;
      page.drawLine({ start: { x: 42, y: y + size + 2 }, end: { x: 570, y: y + size + 2 }, thickness: 0.3, color: rgb(0.65, 0.65, 0.65) });
    }
    for (const line of row.lines) { draw(line, 42, y, size); y -= size * 1.25; }
    y -= row.heading ? 3 : 2;
  }
  const footer = report.source === 'submission'
    ? 'Saved at submission. Screening is self-reported; this is not funding approval.'
    : `Recovered from current records on ${applicationReportDate(report.capturedAt)}; may differ from original submission.`;
  wrap(footer, font, 7, 528).forEach((line, i) => draw(line, 42, 57 - i * 9, 7));
  doc.setTitle('WorkforceAP application report');
  doc.setCreationDate(new Date(report.capturedAt));
  doc.setModificationDate(new Date(report.capturedAt));
  return doc.save();
}
