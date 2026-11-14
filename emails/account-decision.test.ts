import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applicationAcceptedHtml } from './application-accepted';
import { applicationRejectedHtml } from './application-rejected';
import { employerApprovedHtml } from './employer-approved';
import { employerRejectedHtml } from './employer-rejected';

describe('applicationAcceptedHtml', () => {
  it('escapes the greeting, org name, and support email', () => {
    const html = applicationAcceptedHtml({
      firstName: 'Ada <script>alert(1)</script>',
      branding: {
        orgId: 'org-1',
        name: 'Org <img src=x>',
        logoUrl: 'https://cdn.example.test/logo.png',
        primaryColor: '#000',
        supportEmail: 'help+"<b>"@example.test',
        domain: 'https://example.test',
        domainLabel: 'example.test',
      },
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Hi Ada &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('your Org &lt;img src=x&gt; membership'));
    assert.ok(html.includes('help+&quot;&lt;b&gt;&quot;@example.test'));
  });
});

describe('applicationRejectedHtml', () => {
  it('escapes the applicant first name', () => {
    const html = applicationRejectedHtml({ firstName: 'Ada <img src=x>' });
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Hello Ada &lt;img src=x&gt;,'));
  });
});

describe('employerApprovedHtml', () => {
  it('escapes contact and company names', () => {
    const html = employerApprovedHtml({
      contactName: 'Pat <script>alert(1)</script>',
      companyName: 'Acme & <Partners>',
    });
    assert.equal(html.includes('<script>'), false);
    assert.ok(html.includes('Hi Pat &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
  });
});

describe('employerRejectedHtml', () => {
  it('escapes contact, company, and optional staff reason', () => {
    const html = employerRejectedHtml({
      contactName: 'Pat <b>Lee</b>',
      companyName: 'Acme & Co',
      reason: 'Missing <img src=x> EIN',
    });
    assert.equal(html.includes('<b>Lee</b>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Hi Pat &lt;b&gt;Lee&lt;/b&gt;,'));
    assert.ok(html.includes('Acme &amp; Co'));
    assert.ok(html.includes('Missing &lt;img src=x&gt; EIN'));
  });

  it('omits the reason block when none is provided', () => {
    const html = employerRejectedHtml({
      contactName: 'Pat',
      companyName: 'Acme',
    });
    assert.equal(html.includes('Reason:'), false);
  });
});
