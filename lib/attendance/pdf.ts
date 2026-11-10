import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MARGIN = 36;

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
  if (snapshot.kind === 'weekly') drawWeekly(pdf, snapshot, font, bold);
  else if (snapshot.kind === 'yearly') drawYearly(pdf, snapshot, font, bold);
  else drawMonthly(pdf, snapshot, font, bold);
  return pdf.save();
}

type Pen = {
  page: ReturnType<PDFDocument['addPage']>;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  safe: (value: string) => string;
  text: (value: string, x: number, y: number, size?: number, strong?: boolean) => void;
  fit: (value: string, max: number, size: number, strong?: boolean) => string;
};

function penFor(pdf: PDFDocument, font: PDFFont, bold: PDFFont, size: [number, number]): Pen {
  const page = pdf.addPage(size);
  const safe = (value: string) => [...value.replace(/\s+/g, ' ')].map(char => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  const face = (strong: boolean) => (strong ? bold : font);
  const fit = (value: string, max: number, sizePt: number, strong = false) => {
    const chars = [...safe(value)];
    let out = '';
    for (const char of chars) {
      if (face(strong).widthOfTextAtSize(out + char, sizePt) > max) break;
      out += char;
    }
    return out;
  };
  return {
    page, font, bold, width: size[0], safe, fit,
    text: (value, x, y, sizePt = 9, strong = false) => page.drawText(safe(value), { x, y, size: sizePt, font: face(strong) }),
  };
}

/** Draft marks plus the snapshot digest, kept at or above the 36pt margin. */
function drawDraftFooter(pen: Pen, snapshot: AttendanceSnapshot) {
  const y = MARGIN;
  pen.text('DRAFT', MARGIN, y + 18, 8, true);
  pen.text(pen.fit('Template fidelity unverified. Not WFS approved. No certification implied.', pen.width - 2 * MARGIN - 42, 7), MARGIN + 42, y + 18, 7);
  // Wrapped, never clipped: the full snapshot digest must survive on the page.
  let line = '';
  let footY = y + 9;
  const prefix = `Admin-entered (unverified). ${ESTIMATE_NOTICE}. `;
  for (const word of `${prefix}Snapshot SHA-256: ${digest(snapshot)}`.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && pen.font.widthOfTextAtSize(pen.safe(next), 6) > pen.width - 2 * MARGIN) {
      pen.text(line, MARGIN, footY, 6);
      footY -= 7;
      line = word;
    } else line = next;
  }
  pen.text(line, MARGIN, footY, 6);
}

function hours(minutes: number | null): string | null {
  return minutes === null ? null : (minutes / 60).toFixed(2);
}

/** WFS "Weekly Training Attendance Sheet" (10_Training Attendance Sheet.v10.20.20), landscape. */
function drawWeekly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont) {
  const pen = penFor(pdf, font, bold, [792, 612]);
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  pen.text('DRAFT', 700, 584, 14, true);
  pen.text('Workforce Solutions Capital Area', MARGIN, 584, 9, true);
  pen.text('Weekly Training Attendance Sheet', MARGIN, 566, 16, true);
  pen.text('not WFS approved; not institutionally approved', 470, 566, 8, true);

  const field = (label: string, value: string, x: number, y: number, width: number) => {
    pen.text(label, x, y, 9, true);
    const labelWidth = bold.widthOfTextAtSize(label, 9);
    pen.text(pen.fit(value, width - labelWidth - 8, 9), x + labelWidth + 6, y, 9);
    page.drawLine({ start: { x: x + labelWidth + 4, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: 0.4, color: ink });
  };
  field("Participant's Name:", snapshot.profile.name, MARGIN, 540, 470);
  field('TWIST ID:', snapshot.enrollment.twistId ?? '', 520, 540, 236);
  field('Training or Educational Program:', snapshot.enrollment.program, MARGIN, 518, 720);

  // Fixed column positions. Widths are measured, never padded with spaces.
  const columns = [
    { label: 'Day of Week', x: MARGIN, width: 130 },
    { label: 'Date', x: 180, width: 120 },
    { label: 'Time In', x: 320, width: 130 },
    { label: 'Time Out', x: 470, width: 140 },
    { label: 'Total Hours', x: 630, width: 126 },
  ];
  const headerY = 490;
  page.drawRectangle({ x: MARGIN, y: headerY - 6, width: 720, height: 18, borderWidth: 0.6, color: rgb(0.93, 0.93, 0.93), borderColor: ink });
  for (const column of columns) pen.text(column.label, column.x + 4, headerY, 9, true);

  const byDate = new Map(snapshot.days.map(day => [day.date, day]));
  const monday = utcDate(snapshot.days[0]?.date ?? '2026-01-05');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  for (let index = 0; index < 7; index++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const rowY = 464 - index * 26;
    page.drawRectangle({ x: MARGIN, y: rowY - 8, width: 720, height: 26, borderWidth: 0.4, borderColor: ink });
    for (const column of columns.slice(1)) {
      page.drawLine({ start: { x: column.x - 4, y: rowY - 8 }, end: { x: column.x - 4, y: rowY + 18 }, thickness: 0.4, color: ink });
    }
    pen.text(WEEKDAYS[index], columns[0].x + 4, rowY, 9);
    const day = byDate.get(iso);
    if (!day) continue;
    pen.text(iso, columns[1].x + 4, rowY, 9);
    // No time-in or time-out is stored, so those cells stay blank.
    const total = hours(day.actualMinutes);
    if (total !== null) pen.text(total, columns[4].x + 4, rowY, 9);
    else if (day.codes.includes('A')) pen.text('A', columns[4].x + 4, rowY, 9);
  }

  pen.text('PROPOSED DRAFT RULE: P >=4 verified hours/day; not institutionally approved. Time In/Out unavailable.', MARGIN, 292, 7);
  pen.text('Is the participant making satisfactory progress as defined by the educational institution?', MARGIN, 272, 8);
  pen.text('Yes', 620, 272, 9);
  pen.text('No', 690, 272, 9);
  box(page, 604, 270);
  box(page, 674, 270);
  pen.text('unanswered', 706, 272, 6);
  pen.text('Will the course / training be completed on time?', MARGIN, 250, 8);
  pen.text('Yes', 420, 250, 9);
  pen.text('No', 490, 250, 9);
  box(page, 404, 248);
  box(page, 474, 248);
  pen.text('unanswered', 524, 250, 7);

  pen.text('Instructor Signature:', MARGIN, 222, 9, true);
  page.drawLine({ start: { x: 150, y: 220 }, end: { x: 470, y: 220 }, thickness: 0.4, color: ink });
  pen.text('pending', 156, 224, 8);
  pen.text('Date:', 490, 222, 9, true);
  page.drawLine({ start: { x: 524, y: 220 }, end: { x: 700, y: 220 }, thickness: 0.4, color: ink });
  pen.text('I affirm that the information provided concerning my attendance is accurate.', MARGIN, 196, 9);
  pen.text('Participant Signature:', MARGIN, 172, 9, true);
  page.drawLine({ start: { x: 160, y: 170 }, end: { x: 470, y: 170 }, thickness: 0.4, color: ink });
  pen.text('pending separate authenticated student act', 166, 174, 8);

  pen.text('Workforce Solutions Capital Area', MARGIN, 142, 8, true);
  pen.text('9001 N IH 35, Ste 110A', MARGIN, 132, 7);
  pen.text('Fax: 512-491-7563', MARGIN, 122, 7);
  pen.text('www.wfscapitalarea.com', MARGIN, 112, 7);
  const legal = 'Workforce Solutions Capital Area is an Equal Opportunity Employer/Program. Auxiliary aids and services are available, upon request, to persons with disabilities. Relay Texas: 1.800.735.2989 (TDD) / 711 (Voice)';
  pen.text(pen.fit(legal, 620, 6), MARGIN, 96, 6);
  pen.text('10_Training Attendance Sheet.v10.20.20', 560, 84, 6);
  drawDraftFooter(pen, snapshot);
}

function box(page: Pen['page'], x: number, y: number) {
  page.drawRectangle({ x, y, width: 10, height: 10, borderWidth: 0.6, borderColor: rgb(0, 0, 0) });
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * WorkforceAP yearly overview, landscape. Schedule, total class hours and instructor are not stored
 * on the enrollment, so those cells print "not stored" instead of a guessed value.
 */
function drawYearly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont) {
  const pen = penFor(pdf, font, bold, [792, 612]);
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  pen.text('Workforce Advancement Project Student Attendance Record', MARGIN, 590, 11, true);
  pen.text(pen.fit(snapshot.academicLabel, 90, 9, true), 470, 590, 9, true);
  pen.text('DRAFT', 700, 590, 12, true);
  pen.text('not WFS approved; not institutionally approved', MARGIN, 578, 7, true);

  const cells: Array<[string, string, number]> = [
    ['Name of Student', snapshot.profile.name, 150],
    ['Class Abbrv.', snapshot.enrollment.abbreviation ?? '', 70],
    ['Student Phone Number', snapshot.profile.phone ?? '', 110],
    ['Student Email Address', snapshot.profile.email ?? '', 170],
    ['Class Start Date', snapshot.enrollment.classStart ?? '', 80],
    ['Class End Date', snapshot.enrollment.classEnd ?? '', 80],
  ];
  let x = MARGIN;
  for (const [label, value, width] of cells) {
    pen.text(label, x, 566, 6, true);
    pen.text(pen.fit(value, width - 4, 7), x, 556, 7);
    page.drawRectangle({ x, y: 552, width, height: 22, borderWidth: 0.3, borderColor: ink });
    x += width;
  }
  const second: Array<[string, string, number]> = [
    ['Name of Class Pathway', snapshot.enrollment.pathway ?? '', 200],
    ['Class Schedule', 'not stored', 180],
    ['Total Class Hours', 'not stored', 120],
    ['Name of Instructors', 'not stored', 220],
  ];
  x = MARGIN;
  for (const [label, value, width] of second) {
    pen.text(label, x, 544, 6, true);
    pen.text(pen.fit(value, width - 4, 7), x, 534, 7);
    page.drawRectangle({ x, y: 530, width, height: 22, borderWidth: 0.3, borderColor: ink });
    x += width;
  }

  pen.text('P = Present (4 hrs); W = Class by Webinar (4 hrs); CR = Watched Class Recordings (4 hrs); A = Absent', MARGIN, 516, 6);
  pen.text('Admin-entered (unverified). Missing days are blank, never zero.', MARGIN, 507, 6);

  const monthX = MARGIN;
  const monthWidth = 78;
  const gridX = monthX + monthWidth;
  const dayWidth = 20;
  const headerY = 500;
  pen.text('Month', monthX + 4, headerY, 6, true);
  for (let day = 1; day <= 31; day++) pen.text(String(day), gridX + (day - 1) * dayWidth + 3, headerY, 6, true);

  const byDate = new Map(snapshot.days.map(day => [day.date, day]));
  const counts = { P: 0, W: 0, CR: 0, A: 0 };
  const first = utcDate(snapshot.days[0]?.date ?? `${new Date().getUTCFullYear()}-01-01`);
  const startMonth = first.getUTCMonth();
  const startYear = first.getUTCFullYear();
  for (let index = 0; index < 12; index++) {
    const rowY = 478 - index * 23;
    const month = (startMonth + index) % 12;
    const year = startYear + Math.floor((startMonth + index) / 12);
    pen.text(MONTHS[month], monthX + 2, rowY, 6, true);
    page.drawRectangle({ x: monthX, y: rowY - 6, width: monthWidth + 31 * dayWidth, height: 24, borderWidth: 0.3, borderColor: ink });
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= 31; day++) {
      const cellX = gridX + (day - 1) * dayWidth;
      page.drawLine({ start: { x: cellX, y: rowY - 6 }, end: { x: cellX, y: rowY + 18 }, thickness: 0.2, color: ink });
      if (day > daysInMonth) continue;
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = byDate.get(iso);
      const code = record ? cellCode(record) : null;
      if (code) {
        pen.text(code, cellX + 6, rowY, 7, true);
        counts[code]++;
      }
    }
  }

  pen.text(`Totals (known days only): P ${counts.P}   W ${counts.W}   CR ${counts.CR}   A ${counts.A}`, MARGIN, 184, 8, true);
  pen.text('Signature of WorkforceAP Student', MARGIN, 160, 8, true);
  page.drawLine({ start: { x: 200, y: 158 }, end: { x: 470, y: 158 }, thickness: 0.4, color: ink });
  pen.text('pending', 206, 162, 7);
  pen.text('Signature of WorkforceAP representative', MARGIN, 140, 8, true);
  page.drawLine({ start: { x: 230, y: 138 }, end: { x: 520, y: 138 }, thickness: 0.4, color: ink });
  pen.text('pending', 236, 142, 7);
  drawDraftFooter(pen, snapshot);
}

/** One cell, one code. Absence wins over attendance; a known day with no code stays blank. */
function cellCode(day: Day): 'P' | 'W' | 'CR' | 'A' | null {
  if (day.codes.includes('A')) return 'A';
  if (day.codes.includes('P')) return 'P';
  if (day.codes.includes('W')) return 'W';
  if (day.codes.includes('CR')) return 'CR';
  return null;
}

/**
 * No monthly form exists, so this stays the adapted portrait draft and says so.
 * Columns use fixed x positions; unknown days print "unknown", never zero.
 */
function drawMonthly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont) {
  const pen = penFor(pdf, font, bold, [612, 792]);
  const columns = [
    { label: 'Date', x: MARGIN },
    { label: 'Admin-entered (unverified)', x: 130 },
    { label: 'Estimated hours (not certified)', x: 290 },
    { label: 'Codes', x: 470 },
  ];
  let pageNumber = 0;
  let y = 0;
  const startPage = () => {
    if (pageNumber > 0) pen.page = pdf.addPage([612, 792]);
    pageNumber++;
    pen.text('ATTENDANCE / MONTHLY / DRAFT', MARGIN, 756, 15, true);
    pen.text('Template fidelity unverified. Not WFS approved. No certification implied.', MARGIN, 740, 8);
    pen.text('MONTHLY ADAPTED DRAFT - original monthly template unavailable', MARGIN, 726, 8, true);
    pen.text('PROPOSED DRAFT RULE: P >=4 verified hours/day; not institutionally approved.', MARGIN, 712, 8);
    pen.text(pen.fit(`Reporting timezone: ${REPORTING_TIMEZONE} | Academic label: ${snapshot.academicLabel}`, 540, 8), MARGIN, 698, 8);
    drawDraftFooter(pen, snapshot);
    y = 676;
    if (pageNumber > 1) {
      pen.text(pen.fit(`Participant (continued): ${snapshot.profile.name}`, 540, 9, true), MARGIN, y, 9, true);
      y -= 16;
    }
    for (const column of columns) pen.text(column.label, column.x, y, 8, true);
    y -= 16;
  };
  startPage();
  const identity = [
    `Participant: ${snapshot.profile.name}`,
    `Email: ${snapshot.profile.email ?? ''} | Phone: ${snapshot.profile.phone ?? ''}`,
    `Training program: ${snapshot.enrollment.program}`,
    `TWIST ID: ${snapshot.enrollment.twistId ?? ''} | WFS counselor: ${snapshot.enrollment.counselor ?? ''}`,
    `Class abbreviation: ${snapshot.enrollment.abbreviation ?? ''} | Pathway: ${snapshot.enrollment.pathway ?? ''}`,
    `Class dates: ${snapshot.enrollment.classStart ?? ''} to ${snapshot.enrollment.classEnd ?? ''}`,
  ];
  for (const row of identity) {
    pen.text(pen.fit(row, 540, 9), MARGIN, y, 9);
    y -= 13;
  }
  pen.text('Unknown values are blank/unknown, never inferred. Time In/Out unavailable.', MARGIN, y, 8);
  y -= 11;
  pen.text('P/W/CR/A counts are not actual hours. Missing telemetry is not absence.', MARGIN, y, 8);
  y -= 18;
  let total = 0;
  let known = 0;
  const counts = { P: 0, W: 0, CR: 0, A: 0 };
  for (const day of snapshot.days) {
    if (y < 70) startPage();
    if (day.actualMinutes !== null) { total += day.actualMinutes; known++; }
    for (const code of day.codes) counts[code]++;
    pen.text(day.date, columns[0].x, y, 9);
    pen.text(hours(day.actualMinutes) ?? 'unknown', columns[1].x, y, 9);
    pen.text(hours(day.estimatedMinutes) ?? 'unknown', columns[2].x, y, 9);
    pen.text(day.codes.join(', '), columns[3].x, y, 9);
    y -= 12;
  }
  y -= 6;
  if (y < 110) startPage();
  pen.text(`Admin-entered (unverified) subtotal: ${(total / 60).toFixed(2)}; coverage ${known}/${snapshot.days.length} days. Unknown days excluded.`, MARGIN, y, 8, true);
  y -= 12;
  pen.text(`Code counts: P ${counts.P} / W ${counts.W} / CR ${counts.CR} / A ${counts.A}`, MARGIN, y, 8);
  y -= 12;
  pen.text('Student attestation: pending separate authenticated student act.', MARGIN, y, 8);
  y -= 12;
  pen.text('Instructor signature: pending authenticated review and explicit signing.', MARGIN, y, 8);
  y -= 12;
  pen.text('Satisfactory progress: unanswered. Will complete on time: unanswered.', MARGIN, y, 8);
  y -= 12;
  pen.text('Counselor delivery: student downloads and sends manually.', MARGIN, y, 8);
}
