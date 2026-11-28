import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, ESTIMATE_NOTICE, REPORTING_TIMEZONE, type Day, type SheetKind } from './evidence';
import { programCourseEstimate } from './coursera-estimate';
import { ACTIVITY_OBSERVED_LABEL, CUMULATIVE_ESTIMATE_LABEL, type AssistiveSignals } from './assistive-signals';
import { COURSE_BLOCKS, WEEK_LABELS, buildMonthlyGrid } from './monthly-grid';

export type AttendanceSnapshot = {
  schemaVersion: 1;
  kind: SheetKind;
  provenance: { evidenceDigest: string; evidenceRevision: string; ruleVersion: string; pMinimumMinutes: number; ruleApproved: false; reportingTimezone: string; templateVersion: string };
  academicLabel: string;
  profile: { name: string; email: string | null; phone: string | null };
  enrollment: { program: string; twistId: string | null; counselor: string | null; abbreviation: string | null; pathway: string | null; classStart: string | null; classEnd: string | null; programSlug?: string | null };
  days: Day[];
  /** Stored Coursera progress. Cumulative estimates only: never daily attendance. */
  coursera?: { coursesCompleted: number; coursesTotal: number | null; overallProgress: number | null; learningHours: number | null } | null;
  /** Dated point counts beside the monthly grid. Never copied into Class Hrs or Lab Hrs. */
  assistive?: AssistiveSignals | null;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MARGIN = 36;
/** Right edge shared by every landscape yearly block: metadata, day grid and totals. */
const RIGHT_EDGE = 792 - MARGIN;

/** Original globe, rising arrow, people and stacked wordmark; never substitute the synthetic SVG badge. */
function drawLogo(page: PDFPage, logo: PDFImage, bottom: number) {
  const width = 176;
  const height = width * logo.height / logo.width;
  page.drawImage(logo, { x: 792 - MARGIN - width, y: bottom, width, height });
}

/** Catalog course length plus stored progress. Labeled as an estimate, never as attendance. */
function courseraLine(snapshot: AttendanceSnapshot): string {
  const estimate = programCourseEstimate(snapshot.enrollment.programSlug ?? null);
  const progress = snapshot.coursera ?? null;
  if (!estimate && !progress) return 'Coursera estimate, not verified attendance: not stored';
  const hours = estimate ? `${estimate.estimatedHours} estimated hours` : 'hours not stored';
  const total = progress?.coursesTotal ?? estimate?.coursesTotal;
  const courses = progress ? `${progress.coursesCompleted} of ${total ?? '?'} courses completed` : 'completion not stored';
  const overall = progress?.overallProgress != null ? `${progress.overallProgress}% overall` : 'progress not stored';
  const learning = progress?.learningHours != null ? `${progress.learningHours} learning hours` : 'learning hours not stored';
  return `Coursera estimate, not verified attendance: ${hours}, ${courses}, ${overall}, ${learning}`;
}

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
  // Resolve from the app root, not the module path (which differs after Next.js bundling).
  const logo = snapshot.kind === 'monthly' ? null : await pdf.embedPng(await readFile(join(process.cwd(), 'public', 'images', 'logo-tight.png')));
  if (snapshot.kind === 'weekly') drawWeekly(pdf, snapshot, font, bold, logo!);
  else if (snapshot.kind === 'yearly') drawYearly(pdf, snapshot, font, bold, logo!);
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
function drawWeekly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont, logo: PDFImage) {
  const pen = penFor(pdf, font, bold, [792, 612]);
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  drawLogo(page, logo, 102);
  pen.text('DRAFT', 700, 584, 14, true);
  pen.text('Workforce Solutions Capital Area', MARGIN, 584, 9, true);
  pen.text('Weekly Training Attendance Sheet', MARGIN, 566, 16, true);
  pen.text('not WFS approved; not institutionally approved', MARGIN, 552, 8, true);

  const field = (label: string, value: string, x: number, y: number, width: number) => {
    pen.text(label, x, y, 9, true);
    const labelWidth = bold.widthOfTextAtSize(label, 9);
    if (label === "Participant's Name:") {
      // Never use fit() here: it silently drops the participant's identity.
      const room = width - labelWidth - 8;
      const fontSize = Math.min(9, 9 * room / Math.max(1, font.widthOfTextAtSize(pen.safe(value), 9)));
      if (fontSize < 5) throw new Error('PARTICIPANT_NAME_DOES_NOT_FIT_WEEKLY');
      pen.text(value, x + labelWidth + 6, y, fontSize);
    } else pen.text(pen.fit(value, width - labelWidth - 8, 9), x + labelWidth + 6, y, 9);
    page.drawLine({ start: { x: x + labelWidth + 4, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: 0.4, color: ink });
  };
  field("Participant's Name:", snapshot.profile.name, MARGIN, 540, 470);
  field('TWIST ID:', snapshot.enrollment.twistId ?? '', 520, 540, 236);
  field('Training or Educational Program:', snapshot.enrollment.program, MARGIN, 518, 720);
  pen.text(pen.fit(courseraLine(snapshot), 720, 7), MARGIN, 504, 7);

  // Fixed column positions. Widths are measured, never padded with spaces.
  const columns = [
    { label: 'Day of Week', x: MARGIN, width: 130 },
    { label: 'Date', x: 180, width: 120 },
    { label: 'Time In', x: 320, width: 130 },
    { label: 'Time Out', x: 470, width: 140 },
    { label: 'Total Hours', x: 630, width: 126 },
  ];
  const headerY = 480;
  page.drawRectangle({ x: MARGIN, y: headerY - 6, width: 720, height: 18, borderWidth: 0.6, color: rgb(0.93, 0.93, 0.93), borderColor: ink });
  for (const column of columns) pen.text(column.label, column.x + 4, headerY, 9, true);

  const byDate = new Map(snapshot.days.map(day => [day.date, day]));
  const monday = utcDate(snapshot.days[0]?.date ?? '2026-01-05');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  for (let index = 0; index < 7; index++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const rowY = 454 - index * 26;
    page.drawRectangle({ x: MARGIN, y: rowY - 8, width: 720, height: 26, borderWidth: 0.4, borderColor: ink });
    for (const column of columns.slice(1)) {
      page.drawLine({ start: { x: column.x - 4, y: rowY - 8 }, end: { x: column.x - 4, y: rowY + 18 }, thickness: 0.4, color: ink });
    }
    pen.text(WEEKDAYS[index], columns[0].x + 4, rowY, 9);
    const day = byDate.get(iso);
    if (!day) continue;
    pen.text(iso, columns[1].x + 4, rowY, 9);
    // No time-in or time-out is stored, so those cells stay blank.
    // Codes without minutes belong in Total Hours: A already did; W/CR were dropped, so those days looked unentered.
    const total = hours(day.actualMinutes);
    if (total !== null) pen.text(total, columns[4].x + 4, rowY, 9);
    else {
      const code = cellCode(day);
      if (code) pen.text(code, columns[4].x + 4, rowY, 9);
    }
  }

  pen.text('PROPOSED DRAFT RULE: P >=4 verified hours/day; not institutionally approved. Time In/Out unavailable.', MARGIN, 282, 7);
  const yesX = 610;
  const noX = 681;
  for (const y of [264, 244]) {
    pen.text('Yes', yesX, y, 9);
    pen.text('No', noX, y, 9);
    box(page, yesX - 16, y - 2);
    box(page, noX - 16, y - 2);
    pen.text('unanswered', 708, y, 6);
  }
  pen.text('Is the participant making satisfactory progress as defined by the educational institution?', MARGIN, 264, 8);
  pen.text('Will the course / training be completed on time?', MARGIN, 244, 8);

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
 * WorkforceAP yearly overview, landscape. Only catalog-estimated class hours are known;
 * missing enrollment fields use the same dash marker, never inferred values.
 */
function drawYearly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont, logo: PDFImage) {
  const pen = penFor(pdf, font, bold, [792, 612]);
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  drawLogo(page, logo, 65);
  pen.text('Workforce Advancement Project Student Attendance Record', MARGIN, 590, 11, true);
  pen.text(pen.fit(snapshot.academicLabel, 80, 9, true), 380, 590, 9, true);
  pen.text('DRAFT', 700, 590, 12, true);
  pen.text('not WFS approved; not institutionally approved', MARGIN, 578, 7, true);

  const missing = '—';
  const cellValue = (value: string | null | undefined) => value?.trim() || missing;
  const estimate = programCourseEstimate(snapshot.enrollment.programSlug ?? null);
  const cells: Array<[string, string, number]> = [
    ['Name of Student', snapshot.profile.name, 150],
    ['Class Abbrv.', cellValue(snapshot.enrollment.abbreviation), 70],
    ['Student Phone Number', cellValue(snapshot.profile.phone), 110],
    ['Student Email Address', cellValue(snapshot.profile.email), 170],
    ['Class Start Date', cellValue(snapshot.enrollment.classStart), 80],
    ['Class End Date', cellValue(snapshot.enrollment.classEnd), 140],
  ];
  let x = MARGIN;
  for (const [label, value, width] of cells) {
    pen.text(label, x, 566, 6, true);
    if (label === 'Name of Student') {
      // Never use fit() here: it silently drops the participant's identity.
      const fontSize = Math.min(7, 7 * (width - 4) / Math.max(1, font.widthOfTextAtSize(pen.safe(value), 7)));
      if (fontSize < 4) throw new Error('PARTICIPANT_NAME_DOES_NOT_FIT_YEARLY');
      pen.text(value, x + 2, 556, fontSize);
    } else pen.text(pen.fit(value, width - 4, 7), x + 2, 556, 7);
    page.drawRectangle({ x, y: 552, width, height: 22, borderWidth: 0.3, borderColor: ink });
    x += width;
  }
  const second: Array<[string, string, number]> = [
    ['Name of Class Pathway', cellValue(snapshot.enrollment.pathway), 200],
    ['Class Schedule', missing, 180],
    ['Total Class Hours', estimate ? `${estimate.estimatedHours} h (catalog estimate)` : missing, 140],
    ['Name of Instructors', missing, 200],
  ];
  x = MARGIN;
  for (const [label, value, width] of second) {
    pen.text(label, x, 544, 6, true);
    pen.text(pen.fit(value, width - 4, 7), x, 534, 7);
    page.drawRectangle({ x, y: 530, width, height: 22, borderWidth: 0.3, borderColor: ink });
    x += width;
  }

  pen.text('P = Present (4 hrs); W = Class by Webinar (4 hrs); CR = Watched Class Recordings (4 hrs); A = Absent', MARGIN, 516, 6);
  pen.text(pen.fit(courseraLine(snapshot), 720, 6), MARGIN, 507, 6);
  pen.text('Admin-entered (unverified). Missing days are blank; shaded × cells are invalid dates.', MARGIN, 498, 6);

  const monthX = MARGIN;
  const monthWidth = 78;
  const gridX = monthX + monthWidth;
  const dayWidth = (RIGHT_EDGE - gridX) / 31;
  const headerY = 486;
  pen.text('Month', monthX + 4, headerY, 6, true);
  for (let day = 1; day <= 31; day++) pen.text(String(day), gridX + (day - 1) * dayWidth + 3, headerY, 6, true);

  const byDate = new Map(snapshot.days.map(day => [day.date, day]));
  const counts = { P: 0, W: 0, CR: 0, A: 0 };
  const first = utcDate(snapshot.days[0]?.date ?? `${new Date().getUTCFullYear()}-01-01`);
  const startMonth = first.getUTCMonth();
  const startYear = first.getUTCFullYear();
  for (let index = 0; index < 12; index++) {
    const rowY = 464 - index * 22;
    const month = (startMonth + index) % 12;
    const year = startYear + Math.floor((startMonth + index) / 12);
    pen.text(MONTHS[month], monthX + 2, rowY, 6, true);
    page.drawRectangle({ x: monthX, y: rowY - 6, width: monthWidth + 31 * dayWidth, height: 24, borderWidth: 0.3, borderColor: ink });
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= 31; day++) {
      const cellX = gridX + (day - 1) * dayWidth;
      if (day > daysInMonth) {
        page.drawRectangle({ x: cellX, y: rowY - 6, width: dayWidth, height: 24, color: rgb(0.87, 0.87, 0.87) });
      }
      page.drawLine({ start: { x: cellX, y: rowY - 6 }, end: { x: cellX, y: rowY + 18 }, thickness: 0.2, color: ink });
      if (day > daysInMonth) {
        pen.text('×', cellX + dayWidth / 2 - 2, rowY, 7, true);
        continue;
      }
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = byDate.get(iso);
      const code = record ? cellCode(record) : null;
      if (code) {
        pen.text(code, cellX + dayWidth / 2 - 3.5, rowY, 7, true);
        counts[code]++;
      }
    }
  }

  pen.text(`Totals (known days only): P ${counts.P}   W ${counts.W}   CR ${counts.CR}   A ${counts.A}`, MARGIN + 4, 184, 8, true);
  page.drawRectangle({ x: MARGIN, y: 178, width: monthWidth + 31 * dayWidth, height: 16, borderWidth: 0.3, borderColor: ink });
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
 * WFS Capital Area Monthly Training Attendance Sheet, landscape.
 * Six Sunday-Saturday weeks, Class Hrs and Lab Hrs, four course blocks.
 * Unknown days stay blank. Sign, send and archive stay pending.
 */
function drawMonthly(pdf: PDFDocument, snapshot: AttendanceSnapshot, font: PDFFont, bold: PDFFont) {
  const pen = penFor(pdf, font, bold, [792, 612]);
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  const grid = buildMonthlyGrid(snapshot.days[0]?.date ?? snapshot.academicLabel.slice(0, 10), snapshot.days);
  pen.text('DRAFT', 700, 590, 12, true);
  pen.text('Workforce Solutions Capital Area', MARGIN, 590, 8, true);
  pen.text('Monthly Training Attendance Sheet', MARGIN, 574, 14, true);
  pen.text('not WFS approved; not institutionally approved', MARGIN, 560, 8, true);
  pen.text(pen.fit(`Academic label: ${snapshot.academicLabel}`, 500, 7), MARGIN, 548, 7);

  const monthLabel = snapshot.academicLabel.slice(0, 7);
  const meta = [
    `Month / Year of Attendance: ${monthLabel}`,
    `Participant Name: ${snapshot.profile.name}`,
    `TWIST ID: ${snapshot.enrollment.twistId ?? ''}`,
    `Career Counselor: ${snapshot.enrollment.counselor ?? ''}`,
    `Training program: ${snapshot.enrollment.program}`,
  ];
  let y = 534;
  for (const row of meta) {
    pen.text(pen.fit(row, 720, 8), MARGIN, y, 8);
    y -= 11;
  }
  pen.text('Enter Class Hrs and Lab Hrs only for days staff have recorded. Unknown days stay blank. Weekly totals use known days only.', MARGIN, y, 7);
  y -= 12;

  const blockTop = y;
  const blockHeight = 78;
  for (let block = 0; block < COURSE_BLOCKS; block++) {
    const top = blockTop - block * blockHeight;
    page.drawRectangle({ x: MARGIN, y: top - blockHeight + 8, width: 720, height: blockHeight - 4, borderWidth: 0.4, borderColor: ink });
    const course = block === 0 ? snapshot.enrollment.program : '';
    pen.text(pen.fit(`Course ${block + 1} Name: ${course}`, 340, 7, true), MARGIN + 4, top - 4, 7, true);
    pen.text('Days / Time:', 390, top - 4, 7, true);
    pen.text('Instructor Signature:', 520, top - 4, 7, true);
    pen.text('pending', 620, top - 4, 7);
    pen.text('Is the participant making acceptable progress as defined by the educational institution?', MARGIN + 4, top - 16, 6);
    pen.text('Yes', 470, top - 16, 6);
    pen.text('No', 510, top - 16, 6);
    box(page, 456, top - 18);
    box(page, 496, top - 18);
    pen.text('Will the course / training be completed on time?', 540, top - 16, 6);
    pen.text('Yes', 700, top - 16, 6);
    pen.text('No', 730, top - 16, 6);
    box(page, 686, top - 18);
    box(page, 716, top - 18);
    pen.text('unanswered', 620, top - 26, 6);
    if (block === 0) drawMonthGrid(pen, grid, top - 36);
    else pen.text('Additional course block is blank. Hours are not copied from activity signals.', MARGIN + 4, top - 40, 6);
  }

  const signalY = blockTop - COURSE_BLOCKS * blockHeight - 2;
  drawAssistiveStrip(pen, snapshot, signalY);
  pen.text('I affirm that the information provided concerning my attendance is accurate.', MARGIN, 78, 7);
  pen.text('Participant Signature:', MARGIN, 66, 8, true);
  page.drawLine({ start: { x: 140, y: 64 }, end: { x: 420, y: 64 }, thickness: 0.4, color: ink });
  pen.text('pending separate authenticated student act', 146, 68, 6);
  pen.text('Sign, send and archive are disabled. No official copy is stored.', 430, 66, 6);
  drawDraftFooter(pen, snapshot);
}

function drawMonthGrid(pen: Pen, grid: ReturnType<typeof buildMonthlyGrid>, top: number) {
  const { page } = pen;
  const ink = rgb(0, 0, 0);
  const x = MARGIN + 4;
  const labelWidth = 42;
    const cell = 13;
    const totalWidth = 18;
  let cursor = x + labelWidth;
  pen.text('Date', x, top, 5, true);
  for (let week = 0; week < grid.weeks.length; week++) {
    for (const label of WEEK_LABELS) {
      pen.text(label, cursor, top, 5);
      cursor += cell;
    }
    pen.text('Tot', cursor, top, 5, true);
          cursor += totalWidth;
  }
  const rows: Array<[string, (cell: { classHours: string | null; labHours: string | null } | null, week: number) => string | null]> = [
    ['Class Hrs', (item) => item?.classHours ?? null],
    ['Lab Hrs', (item) => item?.labHours ?? null],
  ];
  rows.forEach(([label, value], rowIndex) => {
    const y = top - 10 - rowIndex * 9;
    pen.text(label, x, y, 5, true);
    let col = x + labelWidth;
    grid.weeks.forEach((week, weekIndex) => {
      week.forEach(item => {
        const printed = value(item, weekIndex);
        if (printed) pen.text(pen.fit(printed, cell - 1, 4), col, y, 4);
        page.drawRectangle({ x: col - 1, y: y - 2, width: cell - 1, height: 8, borderWidth: 0.2, borderColor: ink });
        col += cell;
      });
      const total = rowIndex === 0 ? grid.weekTotals[weekIndex].classHours : grid.weekTotals[weekIndex].labHours;
      if (total) pen.text(pen.fit(total, totalWidth - 1, 4), col, y, 4);
            col += totalWidth;
    });
  });
  const totalY = top - 28;
  pen.text('Week total', x, totalY, 5, true);
  let col = x + labelWidth + 7 * cell;
  for (const week of grid.weekTotals) {
    if (week.totalHours) pen.text(pen.fit(week.totalHours, 20, 4), col, totalY, 4);
    col += 7 * cell + totalWidth;
  }
  const running = grid.running;
  pen.text(`Running Total Hrs: Class ${running.classHours ?? 'blank'}  Lab ${running.labHours ?? 'blank'}  Total ${running.totalHours ?? 'blank'}`, x, top - 38, 6, true);
}

function drawAssistiveStrip(pen: Pen, snapshot: AttendanceSnapshot, y: number) {
  const signals = snapshot.assistive;
  const coursera = snapshot.coursera ?? null;
  const estimate = programCourseEstimate(snapshot.enrollment.programSlug ?? null);
  const learning = coursera?.learningHours != null ? `${coursera.learningHours} learning hours` : 'learning hours not stored';
  const catalog = estimate ? `${estimate.estimatedHours} catalog hours` : 'catalog hours not stored';
  const courses = coursera ? `${coursera.coursesCompleted} courses completed` : 'completion not stored';
  pen.text(pen.fit(`${CUMULATIVE_ESTIMATE_LABEL}: ${catalog}; ${learning}; ${courses}.`, 720, 6), MARGIN, y, 6);
  const observed = signals && signals.days.length > 0
    ? signals.days.map(day => `${day.date.slice(8)} C${day.courseraPoints}/S${day.sitePoints}`).join(' ')
    : 'no dated points in this month';
  pen.text(pen.fit(`${ACTIVITY_OBSERVED_LABEL}: ${observed}. These counts are not Class Hrs or Lab Hrs.`, 720, 6), MARGIN, y - 8, 6);
}
