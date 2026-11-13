import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jobSubmittedHtml } from './job-submitted';

describe('jobSubmittedHtml', () => {
  it('escapes employer-controlled job, company, contact, and id fields', () => {
    const html = jobSubmittedHtml({
      jobTitle: 'Clerk <script>alert(1)</script>',
      companyName: 'Acme & <Partners>',
      employerEmail: 'jobs+"<img src=x>"@example.test',
      jobId: 'job-"quoted"',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Clerk &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('jobs+&quot;&lt;img src=x&gt;&quot;@example.test'));
    assert.ok(html.includes('job-&quot;quoted&quot;'));
  });
});
