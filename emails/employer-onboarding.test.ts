/**
 * Employer signup emails interpolate contact and company fields into HTML
 * and put the verify URL in an href. Hostile names and URLs must not become
 * markup; the staff alert must omit a missing phone instead of printing
 * "undefined".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { employerWelcomeHtml } from './employer-welcome';
import { employerVerifyEmailHtml } from './employer-verify-email';
import { employerSignupAdminAlertHtml } from './employer-signup-admin-alert';

const HOSTILE_NAME = '<script>alert(1)</script>';
const HOSTILE_URL = 'https://evil.test/" onclick="alert(1)';

describe('employerWelcomeHtml', () => {
  it('escapes the contact name', () => {
    const html = employerWelcomeHtml({
      companyName: 'Acme',
      contactName: HOSTILE_NAME,
      loginUrl: 'https://www.workforceap.org/employer',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('Hi &lt;script&gt;alert(1)&lt;/script&gt;,'));
  });
});

describe('employerVerifyEmailHtml', () => {
  it('escapes the contact name and the verify href', () => {
    const html = employerVerifyEmailHtml({
      contactName: HOSTILE_NAME,
      verifyUrl: HOSTILE_URL,
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="https://evil.test/" onclick='));
    assert.ok(html.includes('Hi &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('href="https://evil.test/&quot; onclick=&quot;alert(1)"'));
  });
});

describe('employerSignupAdminAlertHtml', () => {
  it('escapes company, contact, email, and phone', () => {
    const html = employerSignupAdminAlertHtml({
      companyName: 'Acme <img src=x onerror=alert(1)>',
      contactName: HOSTILE_NAME,
      contactEmail: '" onclick="alert(1)',
      contactPhone: '<svg onload=alert(1)>',
    });
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<svg'));
    assert.ok(html.includes('Acme &lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&quot; onclick=&quot;alert(1)'));
    assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
  });

  it('omits the phone row when no phone is provided', () => {
    const html = employerSignupAdminAlertHtml({
      companyName: 'Acme',
      contactName: 'Pat',
      contactEmail: 'pat@acme.test',
    });
    assert.ok(!html.includes('Phone:'));
    assert.ok(!html.includes('undefined'));
  });
});
