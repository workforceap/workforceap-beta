/**
 * Job approval and rejection mail interpolates employer-controlled title,
 * company, org name, support email, and staff reason. Those fields must
 * not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jobApprovedHtml } from './job-approved';
import { jobRejectedHtml } from './job-rejected';

const branding = {
  orgId: 'org-1',
  name: 'Org <img src=x>',
  logoUrl: 'https://cdn.example.test/logo.png',
  primaryColor: '#000000',
  supportEmail: 'help+"<b>"@example.test',
  domain: 'https://example.test',
  domainLabel: 'example.test',
};

describe('jobApprovedHtml', () => {
  it('escapes job title, company name, and org name', () => {
    const html = jobApprovedHtml({
      jobTitle: 'Clerk <script>alert(1)</script>',
      companyName: 'Acme & <Partners>',
      branding,
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Clerk &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('the Org &lt;img src=x&gt; job board'));
  });
});

describe('jobRejectedHtml', () => {
  it('escapes title, company, reason, and the support mailto', () => {
    const html = jobRejectedHtml({
      jobTitle: 'Clerk <script>x</script>',
      companyName: 'Acme & Co',
      reason: 'Missing <img src=x> EIN',
      branding,
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Clerk &lt;script&gt;x&lt;/script&gt;'));
    assert.ok(html.includes('Acme &amp; Co'));
    assert.ok(html.includes('Missing &lt;img src=x&gt; EIN'));
    assert.ok(html.includes('mailto:help+&quot;&lt;b&gt;&quot;@example.test'));
  });
});
