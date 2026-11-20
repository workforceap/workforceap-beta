/**
 * Employer signup admin-alert interpolates company, contact, email, and
 * optional phone. Those fields must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { employerSignupAdminAlertHtml } from './employer-signup-admin-alert';

describe('employerSignupAdminAlertHtml', () => {
  it('escapes company, contact, email, and phone', () => {
    const html = employerSignupAdminAlertHtml({
      companyName: 'Acme & <Partners>',
      contactName: 'Pat <script>alert(1)</script>',
      contactEmail: 'jobs+"<img src=x>"@example.test',
      contactPhone: '512-<b>555</b>-0100',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.equal(html.includes('<b>555</b>'), false);
    assert.ok(html.includes('Acme &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('Pat &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('jobs+&quot;&lt;img src=x&gt;&quot;@example.test'));
    assert.ok(html.includes('512-&lt;b&gt;555&lt;/b&gt;-0100'));
  });

  it('omits the phone row when none is supplied', () => {
    const html = employerSignupAdminAlertHtml({
      companyName: 'Acme',
      contactName: 'Pat',
      contactEmail: 'pat@example.test',
    });
    assert.equal(html.includes('Phone:'), false);
  });
});
