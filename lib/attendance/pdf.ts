import { PDFDocument, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, ESTIMATE_NOTICE, REPORTING_TIMEZONE, type Day, type SheetKind } from './evidence';

export type AttendanceSnapshot = {
  schemaVersion: 1;
  kind: SheetKind;
  provenance: { evidenceDigest: string; evidenceRevision: string; ruleVersion: string; pMinimumMinutes: number; ruleApproved: false; reportingTimezone: string; templateVersion: string };
  academicLabel: string;
  profile: { name: string; email: string | null; phone: string | null };
  enrollment: { program: string; twistId: string | null; counselor: string | null; abbreviation: string | null; pathway: string | null; classStart: string | null; classEnd: string | null };
  days: Day[];
};
/** Rendering only. A rendered PDF is NOT evidence of authorization or certification. */
export async function renderAttendancePdf(snapshot: AttendanceSnapshot): Promise<Uint8Array> {
  if (snapshot.profile.name.length > 2000) throw new Error('PARTICIPANT_NAME_TOO_LONG');
  if (!snapshot.academicLabel.trim() || snapshot.academicLabel.length > 64) throw new Error('INVALID_ACADEMIC_LABEL');
  if (snapshot.provenance.ruleVersion !== DRAFT_RULE.version || snapshot.provenance.templateVersion !== TEMPLATE_VERSION || snapshot.provenance.reportingTimezone !== REPORTING_TIMEZONE || snapshot.provenance.pMinimumMinutes !== DRAFT_RULE.pMinimumMinutes || snapshot.provenance.ruleApproved !== false) throw new Error('UNSUPPORTED_DRAFT_CONFIGURATION');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Attendance ${snapshot.kind} - DRAFT`);
  pdf.setSubject('Attendance draft. Template fidelity unverified; not WFS approved.');
  pdf.setCreator('WorkforceAP attendance');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y = 0;
  let pageNumber = 0;
  const safe = (value: string) => [...value.replace(/\s+/g, ' ')].map(char => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  const LEFT = 36;
  const MAX_TEXT_WIDTH = 535;
  const text = (value: string, x: number, yy: number, size = 9, f: PDFFont = font) => page.drawText(safe(value), { x, y: yy, size, font: f });
  function wrapMeasured(value: string, size: number, f: PDFFont): string[] {
    const chars = [...safe(value)];
    const lines: string[] = [];
    let current = '';
    for (const char of chars) {
      if (current && f.widthOfTextAtSize(current + char, size) > MAX_TEXT_WIDTH) {
        lines.push(current);
        current = char;
      } else current += char;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }
  function drawWrapped(value: string, x: number, startY: number, size: number, f: PDFFont = font, lineGap = 11): number {
    let yy = startY;
    for (const row of wrapMeasured(value, size, f)) {
      text(row, x, yy, size, f);
      yy -= lineGap;
    }
    return yy;
  }
  function assertRightEdge(value: string, size: number, f: PDFFont) {
    const width = f.widthOfTextAtSize(safe(value), size);
    if (width > MAX_TEXT_WIDTH) throw new Error('PDF_LINE_OVERFLOW');
  }
  function drawFooter() {
    const hashLines = wrapMeasured(`Snapshot SHA-256: ${digest(snapshot)}`, 6, font);
    let footY = 28;
    for (const row of hashLines) {
      assertRightEdge(row, 6, font);
      text(row, LEFT, footY, 6);
      footY -= 8;
    }
    const pageLines = wrapMeasured(`Page ${pageNumber} | ${ESTIMATE_NOTICE}: never actual attendance`, 7, font);
    let pageFootY = 16 + (pageLines.length - 1) * 9;
    for (const row of pageLines) {
      assertRightEdge(row, 7, font);
      text(row, LEFT, pageFootY, 7);
      pageFootY -= 9;
    }
  }
  function nextPage() {
    page = pdf.addPage([612, 792]); pageNumber++;
    assertRightEdge(`ATTENDANCE / ${snapshot.kind.toUpperCase()} / DRAFT`, 15, bold);
    text(`ATTENDANCE / ${snapshot.kind.toUpperCase()} / DRAFT`, LEFT, 756, 15, bold);
    let headerY = drawWrapped('Template fidelity unverified. Not WFS approved. No certification implied.', LEFT, 739, 8);
    if (snapshot.kind === 'monthly') headerY = drawWrapped('MONTHLY ADAPTED DRAFT - original monthly template unavailable', LEFT, headerY - 2, 8, bold);
    headerY = drawWrapped('PROPOSED DRAFT RULE: P >=4 verified hours/day; not institutionally approved.', LEFT, headerY - 2, 8);
    headerY = drawWrapped(`Reporting timezone: ${REPORTING_TIMEZONE} | Academic label: ${snapshot.academicLabel}`, LEFT, headerY - 2, 8);
    drawFooter();
    y = Math.min(676, headerY - 8);
    if (pageNumber > 1) {
      line(`Participant (continued): ${snapshot.profile.name}`, true);
      line('Date          Actual hours     Estimated hours (not certified)     Codes', true);
    }
  }
  function line(value: string, strong = false) {
    const chars = [...safe(value)];
    let current = '';
    const f = strong ? bold : font;
    for (const char of chars) {
      if (f.widthOfTextAtSize(current + char, 9) > MAX_TEXT_WIDTH) {
        if (y < 65) nextPage();
        text(current, LEFT, y, 9, f); y -= 13; current = '';
      }
      current += char;
    }
    if (y < 65) nextPage();
    text(current, LEFT, y, 9, f); y -= 13;
  }
  nextPage();
  line(`Participant: ${snapshot.profile.name}`, true);
  line(`Email: ${snapshot.profile.email ?? ''} | Phone: ${snapshot.profile.phone ?? ''}`);
  line(`Training program: ${snapshot.enrollment.program}`);
  line(`TWIST ID: ${snapshot.enrollment.twistId ?? ''} | WFS counselor: ${snapshot.enrollment.counselor ?? ''}`);
  line(`Class abbreviation: ${snapshot.enrollment.abbreviation ?? ''} | Pathway: ${snapshot.enrollment.pathway ?? ''}`);
  line(`Class dates: ${snapshot.enrollment.classStart ?? ''} to ${snapshot.enrollment.classEnd ?? ''}`);
  line('Unknown values are blank/unknown, never inferred. Time In/Out unavailable.');
  line('Proposed draft rule: P >=4 verified hours/day, one max; not institutionally approved.');
  line('W/CR/A require independent dated evidence.');
  line('P/W/CR/A counts are not actual hours. Missing telemetry is not absence.');
  line('Date          Actual hours     Estimated hours (not certified)     Codes', true);
  let total = 0; let known = 0;
  const counts = { P: 0, W: 0, CR: 0, A: 0 };
  for (const day of snapshot.days) {
    if (day.actualMinutes !== null) { total += day.actualMinutes; known++; }
    for (const code of day.codes) counts[code]++;
    const actual = day.actualMinutes === null ? 'unknown' : (day.actualMinutes / 60).toFixed(2);
    const estimated = day.estimatedMinutes === null ? 'unknown' : (day.estimatedMinutes / 60).toFixed(2);
    line(`${day.date}       ${actual.padEnd(17)} ${estimated.padEnd(30)} ${day.codes.join(', ')}`);
  }
  line(`Verified known-hours subtotal: ${(total / 60).toFixed(2)}; coverage ${known}/${snapshot.days.length} days. Unknown days excluded.`, true);
  line(`Code counts: P ${counts.P} / W ${counts.W} / CR ${counts.CR} / A ${counts.A}`);
  line('Student attestation: pending separate authenticated student act.');
  line('Instructor signature: pending authenticated review and explicit signing.');
  line('Satisfactory progress: unanswered. Will complete on time: unanswered.');
  line('Counselor delivery: student downloads and sends manually.');
  return pdf.save();
}
