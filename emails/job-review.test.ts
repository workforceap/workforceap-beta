import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jobApprovedHtml } from './job-approved';
import { jobRejectedHtml } from './job-rejected';

describe('jobApprovedHtml', () => {
  it('escapes employer-controlled job, company, and branded org name', () => {
    const html = jobApprovedHtml({
      jobTitle: 'Clerk <script>alert(1)</script>',
      companyName: 'Acme & <Partners>',
      branding: {
        orgId: 'org-1',
        name: 'Org <img src=x>',
        logoUrl: 'https://cdn.example.test/logo.png',
        primaryColor: '#000',
        supportEmail: 'help@example.test',
        domain: 'https://example.test',
        domainLabel: 'example.test',
      },
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Clerk &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('Org &lt;img src=x&gt; job board'));
  });
});

describe('jobRejectedHtml', () => {
  it('escapes job, company, staff reason, and branded support email', () => {
    const html = jobRejectedHtml({
      jobTitle: 'Clerk <script>alert(1)</script>',
      companyName: 'Acme & <Partners>',
      reason: 'Wage <img src=x> missing',
      branding: {
        orgId: 'org-1',
        name: 'Org',
        logoUrl: 'https://cdn.example.test/logo.png',
        primaryColor: '#000',
        supportEmail: 'help+"<script>"@example.test',
        domain: 'https://example.test',
        domainLabel: 'example.test',
      },
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Clerk &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('Wage &lt;img src=x&gt; missing'));
    assert.ok(html.includes('help+&quot;&lt;script&gt;&quot;@example.test'));
    assert.ok(html.includes('mailto:help+&quot;&lt;script&gt;&quot;@example.test'));
  });
});
