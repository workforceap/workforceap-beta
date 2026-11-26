import { describe, expect, it } from 'vitest';

import { eligibilityScreeningAdminAlertHtml } from '@/emails/eligibility-screening-admin-alert';
import { eligibilityScreeningConfirmationHtml } from '@/emails/eligibility-screening-confirmation';
import { eligibilityScreeningSummaryHtml } from '@/emails/eligibility-screening-summary';

const HOSTILE = '<img src=x onerror=alert(1)>';
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';
const ANSWERS = {
  q1: 'I receive SNAP and live in public housing',
  q2: 'I was laid off from Acme',
  q3: 'Yes I want training',
  receivingUnemployment: 'yes',
  layoffCompany: 'Acme <script>steal()</script>',
  qualifies: true,
  yesCount: 3,
};

describe('eligibility screening email HTML', () => {
  it('escapes member identity in the admin alert and never repeats answers', () => {
    const html = eligibilityScreeningAdminAlertHtml({
      memberName: HOSTILE,
      memberEmail: 'pat+"onclick=alert(1)"@example.test',
      memberId: 'id"><script>x</script>',
      source: 'token',
      eligibility: ANSWERS,
      leadRecordId: '<b>lead-1</b>',
    });
    expect(html).toContain(ESCAPED);
    expect(html).toContain('pat+&quot;onclick=alert(1)&quot;@example.test');
    expect(html).toContain(`/admin/members/${encodeURIComponent('id"><script>x</script>')}`);
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain(ANSWERS.q1);
    expect(html).not.toContain(ANSWERS.q2);
    expect(html).not.toContain('Acme <script>steal()</script>');
    expect(html).toContain('this alert does not include the answers');
  });

  it('holds a no-account lead id escaped and links to the public screening store', () => {
    const html = eligibilityScreeningAdminAlertHtml({
      memberName: 'Pat',
      memberEmail: 'pat@example.test',
      source: 'apply',
      leadRecordId: HOSTILE,
    });
    expect(html).toContain(`record ${ESCAPED}`);
    expect(html).toContain('/admin/wioa-screening#public-wioa-screenings');
    expect(html).not.toContain(HOSTILE);
  });

  it('escapes the confirmation greeting and never repeats answers', () => {
    const html = eligibilityScreeningConfirmationHtml({
      firstName: HOSTILE,
      eligibility: ANSWERS,
    });
    expect(html).toContain(`Hi ${ESCAPED},`);
    expect(html).toContain('We saved');
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain(ANSWERS.q1);
    expect(html).not.toContain('Acme <script>');
  });

  it('summarises the quick-fit flag without embedding answer text', () => {
    const html = eligibilityScreeningSummaryHtml(ANSWERS, { heading: HOSTILE });
    expect(html).toContain(ESCAPED);
    expect(html).toContain('Quick eligibility fit');
    expect(html).toContain('yes (3/3)');
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain(ANSWERS.q1);
    expect(html).not.toContain(ANSWERS.layoffCompany);
  });
});
