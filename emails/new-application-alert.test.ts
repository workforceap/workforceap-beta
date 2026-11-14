/**
 * Staff new-application alerts interpolate applicant name, email, phone,
 * program, notes, and id. Those fields must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newApplicationAlertHtml } from './new-application-alert';

describe('newApplicationAlertHtml', () => {
  it('escapes applicant fields and application notes', () => {
    const html = newApplicationAlertHtml({
      applicantName: '<script>alert(1)</script>',
      applicantEmail: 'evil@example.com<script>',
      applicantPhone: '<img src=x onerror=alert(1)>',
      programInterest: 'CNA & IT',
      applicationId: 'app-<id>',
      applicationNotes: 'Line 1\n<img src=x>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('evil@example.com&lt;script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('CNA &amp; IT'));
    assert.ok(html.includes('app-&lt;id&gt;'));
    assert.ok(html.includes('&lt;img src=x&gt;'));
    assert.ok(html.includes('<br>'));
  });

  it('omits the phone line when the number is blank', () => {
    const html = newApplicationAlertHtml({
      applicantName: 'Ada',
      applicantEmail: 'ada@example.com',
      applicantPhone: '   ',
      programInterest: 'CNA',
      applicationId: 'app-1',
    });
    assert.doesNotMatch(html, /<strong>Phone:<\/strong>/);
  });
});
