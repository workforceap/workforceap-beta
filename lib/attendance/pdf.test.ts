import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { periodDates, summarize, type SheetKind } from './evidence';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';

for (const kind of ['weekly', 'monthly', 'yearly'] as SheetKind[]) {
  for (const variant of ['normal', 'long-names', 'missing', 'partial']) {
    test(`render synthetic ${kind} ${variant} PDF`, async () => {
      const dates = periodDates(kind, '2026-11-09', 8);
      const rows = variant === 'missing' ? [] : [{ sourceKey: 'synthetic-reviewed-register', date: dates[0], kind: 'verified-duration' as const, minutes: 240, verifiedBy: 'synthetic-admin', reference: 'synthetic-only', reason: 'Synthetic dated attendance register reviewed' }];
      const snapshot: AttendanceSnapshot = {
        schemaVersion: 1, kind, academicLabel: '2026-2027',
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
      if (process.env.ATTENDANCE_FIXTURE_DIR) {
        await mkdir(process.env.ATTENDANCE_FIXTURE_DIR, { recursive: true });
        await writeFile(`${process.env.ATTENDANCE_FIXTURE_DIR}/${kind}-${variant}.pdf`, bytes);
      }
    });
  }
}
