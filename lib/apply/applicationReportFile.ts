import { escapeHtml } from '@/lib/email/escapeHtml';
import { applicationReportDate, applicationReportHtml, type ApplicationReport } from './applicationReport';
import { applicationReportPdf } from './applicationReportPdf';

/** Both email attachment and profile download render the same saved snapshot. */
export async function applicationReportFile(report: ApplicationReport, applicationId: string) {
  const filename = `application-${applicationId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  try {
    return { filename: `${filename}.pdf`, content: Buffer.from(await applicationReportPdf(report, applicationId)), contentType: 'application/pdf' };
  } catch {
    // A font/rendering failure or unusually long record must not hide answers
    // or prevent the signup notification. Full Unicode text remains printable.
    console.warn('Application report PDF unavailable; using complete printable HTML');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Application report</title>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
      <style>body{font-family:Arial,sans-serif;max-width:7.5in;margin:24px auto;color:#111;font-size:13px}h1{font-size:22px}h3{break-after:avoid}tr{break-inside:avoid}td{overflow-wrap:anywhere}@page{size:letter;margin:.45in}@media print{body{margin:0;font-size:13px}h3{font-size:13px!important;margin:10px 0 3px!important}td{padding:2px 4px!important}}</style></head><body>
      <h1>WorkforceAP application report</h1><p>Complete printable HTML copy. Use your browser’s Print command; longer records may span more than one page.</p>
      <p>Application ID: ${escapeHtml(applicationId)}</p>
      <p>${report.source === 'submission' ? 'Saved at submission.' : `Recovered from current records on ${escapeHtml(applicationReportDate(report.capturedAt))}; may differ from the original submission.`}</p>
      ${applicationReportHtml(report).replace('<p>Print the attached application report for the applicant’s file. A saved copy is available on their profile.</p>', '')}</body></html>`;
    return { filename: `${filename}.html`, content: Buffer.from(html, 'utf8'), contentType: 'text/html; charset=utf-8' };
  }
}
