import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize } from './evidence';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';
import { programCourseEstimate } from './coursera-estimate';

function snapshot(over: Partial<AttendanceSnapshot> = {}): AttendanceSnapshot {
  const dates = periodDates('yearly', '2026-09-01', 8);
  const rows: never[] = [];
  return {
    schemaVersion: 1, kind: 'yearly', academicLabel: '2026-2027',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic Participant', email: null, phone: null },
    enrollment: { program: 'Certified Production Technician (CPT)', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null, programSlug: 'certified-production-technician-cpt' },
    days: summarize(dates, rows),
    coursera: { coursesCompleted: 3, coursesTotal: 8, overallProgress: 37.5, learningHours: 22.5 },
    ...over,
  };
}

async function text(bytes: Uint8Array) {
  const loaded = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const out: string[] = [];
    for (let index = 1; index <= loaded.numPages; index++) {
      out.push((await (await loaded.getPage(index)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    return out.join(' ');
  } finally { await loaded.destroy(); }
}

test('CPT maps to the 160 estimated hours printed on the yearly form', () => {
  const estimate = programCourseEstimate('certified-production-technician-cpt');
  assert.deepEqual(estimate, { coursesTotal: 8, estimatedHours: 160 });
});

test('an alias slug resolves to the same catalog program', () => {
  assert.deepEqual(programCourseEstimate('production-technology-certificate-cpt'), { coursesTotal: 8, estimatedHours: 160 });
});

test('an unknown program stays unknown instead of a guessed total', () => {
  assert.equal(programCourseEstimate('not-a-program'), null);
  assert.equal(programCourseEstimate(null), null);
});

test('the sheet prints the Coursera estimate and never calls it attendance', async () => {
  const rendered = await text(await renderAttendancePdf(snapshot()));
  for (const required of ['Coursera estimate, not verified attendance', '160 estimated hours', '3 of 8 courses completed', '37.5%', '22.5 learning hours']) {
    assert.ok(rendered.includes(required), required);
  }
  assert.doesNotMatch(rendered, /Time In\s+22\.5/);
});

test('without a stored program the estimate line says not stored', async () => {
  const rendered = await text(await renderAttendancePdf(snapshot({ coursera: null, enrollment: { ...snapshot().enrollment, programSlug: null } })));
  assert.match(rendered, /Coursera estimate, not verified attendance: not stored/);
  assert.doesNotMatch(rendered, /estimated hours/);
});
