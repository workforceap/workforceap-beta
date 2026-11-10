import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize } from './evidence';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';

const MIN_FOOTER_Y = 36;

function snapshot(kind: 'weekly' | 'yearly', over: Partial<AttendanceSnapshot> = {}): AttendanceSnapshot {
  const dates = periodDates(kind, kind === 'yearly' ? '2026-09-01' : '2026-11-09', kind === 'yearly' ? 8 : null);
  const rows = [{ sourceKey: 'synthetic-reviewed-register', date: dates[0], kind: 'verified-duration' as const, minutes: 240, verifiedBy: 'synthetic-admin', reference: 'synthetic-only', reason: 'Synthetic dated attendance register reviewed' }];
  return {
    schemaVersion: 1, kind, academicLabel: '2026-2027',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic Participant', email: 'synthetic@example.invalid', phone: '555-0100' },
    enrollment: { program: 'Synthetic Program', twistId: 'TWIST-000', counselor: null, abbreviation: 'SYN', pathway: 'Synthetic Pathway', classStart: dates[0], classEnd: dates.at(-1)! },
    days: summarize(dates, rows),
    ...over,
  };
}

async function boxes(bytes: Uint8Array) {
  const loaded = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const pages: Array<Array<{ str: string; x: number; right: number; y: number }>> = [];
    for (let index = 1; index <= loaded.numPages; index++) {
      const content = await (await loaded.getPage(index)).getTextContent();
      pages.push(content.items.flatMap(item => 'str' in item && item.str.trim()
        ? [{ str: item.str, x: item.transform[4] as number, right: (item.transform[4] as number) + item.width, y: item.transform[5] as number }] : []));
    }
    return pages;
  } finally { await loaded.destroy(); }
}

const textOf = (page: Array<{ str: string }>) => page.map(box => box.str).join(' ');

test('weekly sheet matches the WFS form on one landscape page', async () => {
  const bytes = await renderAttendancePdf(snapshot('weekly'));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 792, height: 612 });
  const [page] = await boxes(bytes);
  const text = textOf(page);
  for (const required of [
    'Weekly Training Attendance Sheet', "Participant's Name", 'TWIST ID', 'Training or Educational Program',
    'Day of Week', 'Date', 'Time In', 'Time Out', 'Total Hours',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'satisfactory progress', 'completed on time',
    'Instructor Signature', 'Participant Signature',
    'I affirm that the information provided concerning my attendance is accurate.',
    'Workforce Solutions Capital Area', 'Fax: 512-491-7563', 'www.wfscapitalarea.com',
    'Equal Opportunity', 'Relay Texas: 1.800.735.2989 (TDD) / 711 (Voice)',
    '10_Training Attendance Sheet.v10.20.20',
    'DRAFT', 'not WFS approved', 'Admin-entered (unverified)',
  ]) assert.ok(text.includes(required), required);
  assert.doesNotMatch(text, /\bP\b.*\bW\b.*\bCR\b.*\bA\b/);
  assert.equal(page.filter(box => box.str === '4.00').length, 1, 'only the known day prints hours');
  assert.equal(page.filter(box => box.str === '0.00' || box.str === '0').length, 0, 'unknown days never print zero');

  const headerY = page.find(box => box.str === 'Day of Week')!.y;
  for (const column of ['Date', 'Time In', 'Time Out', 'Total Hours']) {
    const cell = page.find(box => box.str === column)!;
    assert.ok(Math.abs(cell.y - headerY) < 1, `${column} shares the header row`);
  }
  const xs = ['Day of Week', 'Date', 'Time In', 'Time Out', 'Total Hours'].map(name => page.find(box => box.str === name)!.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.ok(new Set(xs.map(value => Math.round(value))).size === 5, 'five distinct fixed columns');
  const monday = page.find(box => box.str === 'Monday')!;
  const date = page.filter(box => /^\d{4}-\d{2}-\d{2}$/.test(box.str)).find(box => Math.abs(box.y - monday.y) < 1);
  assert.ok(date, 'Monday prints its date in the date column');
  assert.ok(Math.abs(date!.x - xs[1]) < 1, 'the date uses the fixed date column, not padded text');

  const lowest = Math.min(...page.map(box => box.y));
  assert.ok(lowest >= MIN_FOOTER_Y - 0.5, `footer baseline ${lowest} is below 36pt`);
});

test('yearly sheet matches the spreadsheet grid on one landscape page', async () => {
  const bytes = await renderAttendancePdf(snapshot('yearly'));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 792, height: 612 });
  const [page] = await boxes(bytes);
  const text = textOf(page);
  for (const required of [
    'Workforce Advancement Project Student Attendance Record', '2026-2027',
    'Name of Student', 'Class Abbrv.', 'Student Phone Number', 'Student Email Address',
    'Class Start Date', 'Class End Date', 'Name of Class Pathway', 'Class Schedule',
    'Total Class Hours', 'Name of Instructors',
    'not stored',
    'P = Present (4 hrs)', 'W = Class by Webinar', 'CR = Watched Class Recordings', 'A = Absent',
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
    'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    'Signature of WorkforceAP Student', 'Signature of WorkforceAP representative',
    'DRAFT', 'not WFS approved', 'Admin-entered (unverified)',
  ]) assert.ok(text.includes(required), required);

  const january = page.find(box => box.str === 'JANUARY')!;
  const dayHeaders = page.filter(box => box.str === '1' || box.str === '31').filter(box => box.y > january.y);
  assert.ok(dayHeaders.some(box => box.str === '1') && dayHeaders.some(box => box.str === '31'), 'day headers 1 through 31');
  assert.equal(new Set(dayHeaders.map(box => Math.round(box.y))).size, 1, 'day numbers share one header row');
  for (const month of ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']) {
    assert.ok(Math.abs(page.find(box => box.str === month)!.x - january.x) < 1, `${month} shares the month column`);
  }
  const present = page.filter(box => box.str === 'P');
  assert.ok(present.length >= 1, 'the legend names P');
  assert.ok(page.some(box => box.str.includes('P 1')), 'the P total counts the one known day');
  assert.equal(page.filter(box => box.str === '0').length, 0, 'unknown days never print zero');

  const lowest = Math.min(...page.map(box => box.y));
  assert.ok(lowest >= MIN_FOOTER_Y - 0.5, `footer baseline ${lowest} is below 36pt`);
});

test('monthly stays an adapted draft because no monthly form exists', async () => {
  const dates = periodDates('monthly', '2026-11-09', null);
  const rows: never[] = [];
  const bytes = await renderAttendancePdf({
    schemaVersion: 1, kind: 'monthly', academicLabel: '2026-2027',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic Participant', email: null, phone: null },
    enrollment: { program: 'Synthetic Program', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    days: summarize(dates, rows),
  });
  const [page] = await boxes(bytes);
  const text = textOf(page);
  assert.match(text, /MONTHLY ADAPTED DRAFT/);
  assert.match(text, /original monthly template unavailable/);
  assert.match(text, /DRAFT/);
  assert.match(text, /Not WFS approved/);
  assert.equal(page.filter(box => box.str === '0.00' || box.str === '0').length, 0);
});
