/**
 * Member check-in nudge HTML escaping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { memberCheckInHtml, memberCheckInSubject } from './member-check-in';

test('escapes first name, lead text, CTA label and quote-injected href', () => {
  const html = memberCheckInHtml({
    firstName: '<img src=x onerror=1>',
    dashboardUrl: 'https://evil.test/" onclick="alert(1)',
    ctaText: '<script>alert(1)</script>',
    leadText: '<b>Open me</b>',
  });
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<b>Open me<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Hi &lt;img src=x onerror=1&gt;/);
  assert.match(html, /&lt;b&gt;Open me&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/evil\.test\/&quot; onclick=&quot;alert\(1\)"/);
});

test('currently lets a javascript: dashboardUrl through escapeHtml (pinned)', () => {
  const html = memberCheckInHtml({
    firstName: 'Alex',
    dashboardUrl: 'javascript:alert(1)',
  });
  assert.match(html, /href="javascript:alert\(1\)"/);
});

test('subject is the fixed check-in line', () => {
  assert.equal(memberCheckInSubject, 'We saw you last week — keep going');
});
