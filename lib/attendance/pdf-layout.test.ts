import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize, type SheetKind } from './evidence';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';

const LEFT = 36;
const RIGHT = 612 - 36;

function snapshot(kind: SheetKind, over: Partial<AttendanceSnapshot> = {}): AttendanceSnapshot {
  const rows: never[] = [];
  return {
    schemaVersion: 1, kind, academicLabel: '2026-2027',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic Participant', email: null, phone: null },
    enrollment: { program: 'Synthetic', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    days: summarize(periodDates(kind, '2026-11-09', 8), rows),
    ...over,
  };
}

async function textBoxes(bytes: Uint8Array) {
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

// 64 capital Ws is the widest label the 64-character bound allows. Unwrapped it ran past the page edge.
for (const kind of ['weekly', 'monthly', 'yearly'] as SheetKind[]) {
  test(`${kind}: widest bounded academic label wraps inside both margins on every page`, async () => {
    const pages = await textBoxes(await renderAttendancePdf(snapshot(kind, { academicLabel: 'W'.repeat(64) })));
    assert.ok(pages.length >= 1);
    pages.forEach((boxes, pageIndex) => {
      const header = boxes.filter(box => /Academic label|^W+$/.test(box.str));
      assert.ok(header.length >= 1, `page ${pageIndex + 1} shows the academic label`);
      for (const box of boxes) {
        assert.ok(box.x >= LEFT - 0.5, `left edge ${box.x} "${box.str.slice(0, 30)}"`);
        assert.ok(box.right <= RIGHT + 0.5, `right edge ${box.right.toFixed(1)} "${box.str.slice(0, 30)}"`);
      }
    });
  });
}

test('wrapped header lines never overlap each other or the body', async () => {
  const [first] = await textBoxes(await renderAttendancePdf(snapshot('monthly', { academicLabel: 'W'.repeat(64) })));
  const baselines = [...new Set(first.map(box => Math.round(box.y * 10) / 10))].sort((a, b) => b - a);
  for (let index = 1; index < baselines.length; index++) {
    assert.ok(baselines[index - 1] - baselines[index] >= 5.9, `baselines ${baselines[index - 1]} / ${baselines[index]} collide`);
  }
});

test('footer hash and page notice stay inside the margins on a long-name multi-page sheet', async () => {
  const pages = await textBoxes(await renderAttendancePdf(snapshot('yearly', {
    academicLabel: 'W'.repeat(64), profile: { name: 'Synthetic Participant '.repeat(30), email: null, phone: null } })));
  assert.ok(pages.length >= 8);
  for (const boxes of pages) {
    assert.ok(boxes.some(box => box.str.includes('Snapshot SHA-256')));
    for (const box of boxes) assert.ok(box.right <= RIGHT + 0.5 && box.x >= LEFT - 0.5, `${box.str.slice(0, 30)} ${box.right}`);
  }
});

test('day columns share fixed x positions and the lowest footer line sits at 36pt or higher', async () => {
  const pages = await textBoxes(await renderAttendancePdf(snapshot('weekly')));
  const [first] = pages;
  const header = first.find(box => box.str.startsWith('Date'));
  assert.ok(header, 'column header is drawn');
  const dateX = header.x;
  const adminX = first.find(box => box.str.startsWith('Admin-entered'))?.x;
  const estimatedX = first.find(box => box.str.startsWith('Estimated hours'))?.x;
  const codesX = first.find(box => box.str === 'Codes')?.x;
  for (const x of [dateX, adminX, estimatedX, codesX]) assert.equal(typeof x, 'number');
  assert.ok(dateX < adminX! && adminX! < estimatedX! && estimatedX! < codesX!, 'columns run left to right');
  const dayRows = first.filter(box => /^\d{4}-\d{2}-\d{2}$/.test(box.str));
  assert.ok(dayRows.length >= 2, 'at least two day rows');
  for (const row of dayRows) {
    assert.equal(row.x, dateX, 'date column is a fixed x, not padEnd drift');
    const sameLine = first.filter(box => Math.abs(box.y - row.y) < 0.5);
    const values = sameLine.filter(box => box !== row).sort((a, b) => a.x - b.x);
    assert.equal(values.length, 2, 'admin-entered and estimated values are separate drawn cells');
    assert.equal(values[0]?.x, adminX, 'admin-entered column is a fixed x');
    assert.equal(values[1]?.x, estimatedX, 'estimated column is a fixed x');
  }
  for (const boxes of pages) {
    const footer = boxes.filter(box => /Snapshot SHA-256|Page \d+ \|/.test(box.str));
    assert.ok(footer.length >= 2, 'hash and page notice are both drawn');
    const lowest = Math.min(...footer.map(box => box.y));
    assert.ok(lowest >= 36, `lowest footer baseline ${lowest} is inside the 0.5in margin`);
    const body = boxes.filter(box => !footer.includes(box));
    const lowestBody = Math.min(...body.map(box => box.y));
    assert.ok(lowestBody >= lowest + 8, `body baseline ${lowestBody} collides with footer ${lowest}`);
  }
});

test('a printed code sits on the codes column x, not inside the estimated cell', async () => {
  const base = snapshot('weekly');
  base.days[0].codes = ['P'];
  const [first] = await textBoxes(await renderAttendancePdf(base));
  const codesX = first.find(box => box.str === 'Codes')?.x;
  const row = first.find(box => box.str === base.days[0].date);
  assert.ok(row && typeof codesX === 'number');
  const code = first.find(box => box.str === 'P' && Math.abs(box.y - row.y) < 0.5);
  assert.equal(code?.x, codesX);
});

test('label bound and unsupported configuration are still rejected', async () => {
  await assert.rejects(renderAttendancePdf(snapshot('weekly', { academicLabel: 'W'.repeat(65) })), /INVALID_ACADEMIC_LABEL/);
  await assert.rejects(renderAttendancePdf(snapshot('weekly', { academicLabel: '   ' })), /INVALID_ACADEMIC_LABEL/);
});
