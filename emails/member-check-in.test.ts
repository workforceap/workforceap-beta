/**
 * Member check-in mail puts the first name in the greeting and the dashboard
 * URL / CTA in an href. Hostile values must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memberCheckInHtml } from './member-check-in';

const HOSTILE_NAME = '<script>alert(1)</script>';
const HOSTILE_URL = 'https://evil.test/" onclick="alert(1)';

describe('memberCheckInHtml', () => {
  it('escapes the first name, lead, CTA, and dashboard href', () => {
    const html = memberCheckInHtml({
      firstName: HOSTILE_NAME,
      dashboardUrl: HOSTILE_URL,
      ctaText: '<img src=x onerror=alert(1)>',
      leadText: '<svg onload=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<svg'));
    assert.ok(!html.includes('href="https://evil.test/" onclick='));
    assert.ok(html.includes('Hi &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('href="https://evil.test/&quot; onclick=&quot;alert(1)"'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
  });
});
