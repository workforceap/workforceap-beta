// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { newApplicationAlertHtml } from '@/emails/new-application-alert';
import { applicationReportFixture } from '../fixtures/applicationReport';

const report = applicationReportFixture();
const base = {
  applicantName: 'Alex Rivera',
  applicantEmail: 'alex@example.com',
  programInterest: 'IT Support',
  applicationId: 'app-1',
  applicationReport: report,
};

describe('staff application alert report body', () => {
  it('uses the filing report instead of the legacy submitted-application template', () => {
    const html = newApplicationAlertHtml(base);
    expect(html).toContain('Example Company');
    expect(html).toContain('<strong>Application ID:</strong> app-1');
    expect(html).not.toContain('A new application has been submitted');
    expect(html).not.toContain('Please review the application in the admin panel');
    expect(html).not.toContain('Staff routing notes');
  });

  it('appends escaped routing notes only when present', () => {
    const withNotes = newApplicationAlertHtml({
      ...base,
      applicationNotes: 'Route to counselor X\n<script>alert(1)</script>',
    });
    expect(withNotes).toContain('<strong>Staff routing notes:</strong> Route to counselor X<br>&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(withNotes).not.toContain('<script>alert(1)</script>');
    expect(newApplicationAlertHtml({ ...base, applicationNotes: '   ' })).not.toContain('Staff routing notes');
  });
});
