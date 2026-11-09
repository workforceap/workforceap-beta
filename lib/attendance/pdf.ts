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
  const text = (value: string, x: number, yy: number, size = 9, f: PDFFont = font) => page.drawText(safe(value), { x, y: yy, size, font: f });
  function nextPage() {
    page = pdf.addPage([612, 792]); pageNumber++;
    text(`ATTENDANCE / ${snapshot.kind.toUpperCase()} / DRAFT`, 36, 756, 15, bold);
    text('Template fidelity unverified. Not WFS approved. No certification implied.', 36, 739, 8);
    if (snapshot.kind === 'monthly') text('MONTHLY ADAPTED DRAFT - original monthly template unavailable', 36, 724, 8, bold);
    text(`Reporting timezone: ${REPORTING_TIMEZONE} | Academic label: ${snapshot.academicLabel}`, 36, 708, 8);
    text(`Snapshot SHA-256: ${digest(snapshot)}`, 36, 28, 6);
    text(`Page ${pageNumber} | ${ESTIMATE_NOTICE}: never actual attendance`, 36, 16, 7);
    text('PROPOSED DRAFT RULE: P >=4 verified hours/day; not institutionally approved.', 36, 692, 8);
    y = 676;
    if (pageNumber > 1) {
      line(`Participant (continued): ${snapshot.profile.name}`, true);
      line('Date          Actual hours     Estimated hours (not certified)     Codes', true);
    }
  }
  function line(value: string, strong = false) {
    // Wrap by measured glyph widths, including unbroken long names.
    const chars = [...safe(value)];
    let current = '';
    const f = strong ? bold : font;
    for (const char of chars) {
      if (f.widthOfTextAtSize(current + char, 9) > 535) {
        if (y < 65) nextPage();
        text(current, 36, y, 9, f); y -= 13; current = '';
      }
      current += char;
    }
    if (y < 65) nextPage();
    text(current, 36, y, 9, f); y -= 13;
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
