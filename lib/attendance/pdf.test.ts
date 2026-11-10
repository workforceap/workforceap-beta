import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize, type SheetKind } from './evidence';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';

for (const kind of ['weekly', 'monthly', 'yearly'] as SheetKind[]) {
  for (const variant of ['normal', 'long-names', 'missing', 'partial']) {
    test(`render synthetic ${kind} ${variant} PDF`, async () => {
      const dates = periodDates(kind, '2026-11-09', 8);
      const rows = variant === 'missing' ? [] : [{ sourceKey: 'synthetic-reviewed-register', date: dates[0], kind: 'verified-duration' as const, minutes: 240, verifiedBy: 'synthetic-admin', reference: 'synthetic-only', reason: 'Synthetic dated attendance register reviewed' }];
      const snapshot: AttendanceSnapshot = {
        schemaVersion: 1, kind, provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240, ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION }, academicLabel: '2026-2027',
        profile: { name: variant === 'long-names' ? 'Synthetic Participant '.repeat(30) : 'Synthetic Participant', email: variant === 'missing' ? null : 'synthetic@example.invalid', phone: null },
        enrollment: { program: variant === 'long-names' ? 'Synthetic Program '.repeat(25) : 'Synthetic Program', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
        days: summarize(dates, rows),
      };
      if (variant === 'partial') snapshot.days[1].estimatedMinutes = 600;
      const before = structuredClone(snapshot);
      const bytes = await renderAttendancePdf(snapshot);
      assert.deepEqual(snapshot, before, 'render must not mutate frozen snapshot');
      const reopened = await PDFDocument.load(bytes);
      assert.match(reopened.getTitle() ?? '', /DRAFT/);
      assert.match(reopened.getSubject() ?? '', /not WFS approved/);
      assert.ok(reopened.getPageCount() >= (kind === 'yearly' ? 8 : 1));
      for (const page of reopened.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
      const loaded = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
      const texts: string[] = [];
      try {
        for (let pageIndex = 1; pageIndex <= loaded.numPages; pageIndex++) {
          const content = await (await loaded.getPage(pageIndex)).getTextContent();
          const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
          texts.push(text);
          assert.match(text, /Snapshot SHA-256:/);
          assert.ok(text.includes(digest(snapshot)), 'every page binds the full frozen snapshot');
          assert.match(text, /not institutionally approved/);
          if (pageIndex > 1) {
            assert.match(text, /Participant \(continued\): Synthetic Participant/);
            assert.match(text, /Admin-entered \(unverified\).*Estimated hours \(not certified\).*Codes/);
          }
        }
        const text = texts.join(' ');
        for (const required of ['Synthetic Participant', 'Synthetic Program', dates[0], dates.at(-1)!,
          'unknown', 'estimated, not certified', 'Unknown days excluded.', 'Missing telemetry is not absence.',
          'Time In/Out unavailable.', 'Student attestation: pending', 'Instructor signature: pending']) assert.ok(text.includes(required), required);
        assert.match(text, variant === 'missing' ? /Admin-entered \(unverified\) subtotal: 0\.00; coverage 0\// : /Admin-entered \(unverified\) subtotal: 4\.00; coverage 1\//);
        assert.match(text, variant === 'missing' ? /Code counts: P 0 \/ W 0 \/ CR 0 \/ A 0/ : /Code counts: P 1 \/ W 0 \/ CR 0 \/ A 0/);
        if (variant === 'partial') assert.ok(text.includes('10.00'));
        if (kind === 'monthly') assert.match(text, /MONTHLY ADAPTED DRAFT/);
      } finally { await loaded.destroy(); }
      if (process.env.ATTENDANCE_FIXTURE_DIR) {
        await mkdir(process.env.ATTENDANCE_FIXTURE_DIR, { recursive: true });
        await writeFile(`${process.env.ATTENDANCE_FIXTURE_DIR}/${kind}-${variant}.pdf`, bytes);
      }
    });
  }
}

test('academic label is bounded and whitespace is normalized before glyph fallback', async () => {
  const rows: never[] = [];
  const snapshot: AttendanceSnapshot = {
    schemaVersion: 1, kind: 'weekly', academicLabel: '2026',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic\nParticipant\tName', email: null, phone: null },
    enrollment: { program: 'Synthetic', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    days: summarize(periodDates('weekly', '2026-11-09', null), rows),
  };
  await assert.rejects(renderAttendancePdf({ ...snapshot, academicLabel: 'x'.repeat(65) }), /INVALID_ACADEMIC_LABEL/);
  const loaded = await getDocument({ data: await renderAttendancePdf(snapshot), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const text = (await (await loaded.getPage(1)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ');
    assert.match(text, /Synthetic Participant Name/);
    assert.doesNotMatch(text, /Synthetic\?Participant/);
  } finally { await loaded.destroy(); }
});
