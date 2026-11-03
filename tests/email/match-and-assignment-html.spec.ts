import { describe, expect, it } from 'vitest';

import { aiMatchSuggestionHtml } from '@/emails/ai-match-suggestion';
import { counselorAssignedHtml } from '@/emails/counselor-assigned';
import { jobApprovedHtml } from '@/emails/job-approved';
import { jobRejectedHtml } from '@/emails/job-rejected';
import { jobSubmittedHtml } from '@/emails/job-submitted';

const HOSTILE = '<img src=x onerror=alert(1)>';
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

describe('employer and assignment email HTML escaping', () => {
  it('escapes match names, programs, job titles and company names', () => {
    const html = aiMatchSuggestionHtml({
      jobTitle: HOSTILE,
      companyName: '<b>Acme</b>',
      matches: [
        { name: '<script>steal()</script>', program: 'IT & <Support>', score: 91.4 },
        { name: 'Safe', program: 'Cyber', score: Number.NaN },
      ],
    });
    expect(html).toContain(ESCAPED);
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
    expect(html).toContain('IT &amp; &lt;Support&gt;');
    expect(html).toContain('(match: 91%)');
    expect(html).toContain('(match: 0%)');
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain('<script>steal()</script>');
  });

  it('escapes member name, counselor name and message URL', () => {
    const html = counselorAssignedHtml({
      firstName: HOSTILE,
      counselorName: '<b>Jordan</b>',
      messagesUrl: 'https://example.org/messages" onclick="alert(1)',
    });
    expect(html).toContain(`Hi ${ESCAPED},`);
    expect(html).toContain('&lt;b&gt;Jordan&lt;/b&gt;');
    expect(html).toContain('href="https://example.org/messages&quot; onclick=&quot;alert(1)"');
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain('<b>Jordan</b>');
  });

  it('escapes job posting fields in approval, rejection and submitted alerts', () => {
    const approved = jobApprovedHtml({ jobTitle: HOSTILE, companyName: '<b>Acme</b>' });
    const rejected = jobRejectedHtml({
      jobTitle: HOSTILE,
      companyName: '<b>Acme</b>',
      reason: '<script>alert(1)</script>',
    });
    const submitted = jobSubmittedHtml({
      jobTitle: HOSTILE,
      companyName: '<b>Acme</b>',
      employerEmail: '" onclick="alert(1)',
      jobId: '<iframe src=evil>',
    });

    for (const html of [approved, rejected, submitted]) {
      expect(html).toContain(ESCAPED);
      expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
      expect(html).not.toContain(HOSTILE);
    }
    expect(rejected).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rejected).not.toContain('<script>alert(1)</script>');
    expect(submitted).toContain('&quot; onclick=&quot;alert(1)');
    expect(submitted).toContain('&lt;iframe src=evil&gt;');
    expect(submitted).not.toContain('<iframe src=evil>');
  });
});
