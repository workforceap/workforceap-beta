// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { applicationReportFixture } from '../fixtures/applicationReport';
import { applicationReportHtml, buildApplicationReport } from '@/lib/apply/applicationReport';
import { applicationReportPdf } from '@/lib/apply/applicationReportPdf';
import { applicationReportFile } from '@/lib/apply/applicationReportFile';

describe('application filing report', () => {
  it('prints a complete synthetic application on one Letter page with searchable text', async () => {
    const report = applicationReportFixture();
    const bytes = await applicationReportPdf(report, '00000000-0000-4000-8000-000000000012');
    if (process.env.WAP_PDF_PREVIEW_DIR) await writeFile(path.join(process.env.WAP_PDF_PREVIEW_DIR, 'application-report.pdf'), bytes);
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
    try {
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      expect(page.view).toEqual([0, 0, 612, 792]);
      const content = await page.getTextContent();
      const text = content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ').replace(/\s+/g, ' ');
      for (const section of report.sections) for (const { value } of section.fields) expect(text).toContain(value);
      expect(text).toContain('10:30 AM Central');
      for (const item of content.items) if ('transform' in item && item.str.trim()) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(40);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(572);
        expect(item.transform[5]).toBeGreaterThan(25);
      }
    } finally { await pdf.destroy(); }
  });
  it('escapes user values in email while keeping apostrophes, accents and plus email intact', () => {
    const report = applicationReportFixture();
    report.sections[0].fields[0].value = '<img src=x onerror=alert(1)> José';
    const html = applicationReportHtml(report);
    expect(html).not.toContain('<img'); expect(html).toContain('&lt;img');
    expect(html).toContain('José'); expect(html).toContain('alex+training@example.test');
    expect(html).toContain('(512) 555-0123');
  });
  it('distinguishes unanswered questions from no and omits adult screening in school reports', () => {
    const input = { capturedAt: new Date(), submittedAt: null, name: 'Student', email: 'student@example.test', programInterest: 'Training', school: true, guardianName: 'Guardian', screening: { q1: 'yes', layoffCompany: 'Must not appear' } };
    const school = buildApplicationReport(input);
    expect(applicationReportHtml(school)).toContain('Guardian');
    expect(applicationReportHtml(school)).not.toContain('Must not appear');
    const adult = buildApplicationReport({ ...input, school: false, screening: { q1: 'no' } });
    const fields = adult.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.label === 'Unemployed / underemployed')?.value).toBe('No');
    expect(fields.find((field) => field.label === 'Authorized to work')?.value).toBe('Not provided');
  });
  it('preserves unsupported glyphs in printable HTML instead of changing the applicant name', async () => {
    const report = applicationReportFixture(); report.sections[0].fields[0].value = '李 🎓';
    const file = await applicationReportFile(report, 'synthetic');
    expect(file.filename).toBe('application-synthetic.html');
    expect(file.content.toString('utf8')).toContain('李 🎓');
  });
  it('falls back to complete escaped printable HTML for oversized historical data', async () => {
    const report = applicationReportFixture(); report.sections[0].fields[0].value = '<script>' + 'Long value '.repeat(2000);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const file = await applicationReportFile(report, 'synthetic');
      expect(file.filename).toBe('application-synthetic.html');
      expect(file.content.toString()).toContain('&lt;script&gt;');
      expect(file.content.toString()).toContain('Long value '.repeat(2000).trim());
    } finally { warning.mockRestore(); }
  });
  it('strips filename injection from the application id and escapes it in recovered HTML', async () => {
    const report = applicationReportFixture();
    report.source = 'recovered_record';
    report.sections[0].fields[0].value = '李';
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const file = await applicationReportFile(report, 'app-A"; filename="pwned.exe"><script>');
      expect(file.filename).toBe('application-app-Afilenamepwnedexescript.html');
      expect(file.filename).not.toContain('"');
      expect(file.filename).not.toContain('/');
      expect(file.content.toString()).toContain('may differ from the original submission');
      expect(file.content.toString()).toContain('Application ID: app-A&quot;; filename=&quot;pwned.exe&quot;&gt;&lt;script&gt;');
      expect(file.content.toString()).not.toContain('<script>');
    } finally { warning.mockRestore(); }
  });
});
