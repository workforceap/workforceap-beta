/**
 * Kickoff mail interpolates the member first name and program title after a
 * saved selection. Hostile names must not become markup, and the body must
 * not confirm funding or class access.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { courseKickoffHtml } from './course-kickoff';

describe('courseKickoffHtml', () => {
  it('escapes the first name and program name', () => {
    const html = courseKickoffHtml({
      firstName: '<script>alert(1)</script>',
      programName: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('keeps funding and class access as counselor next steps', () => {
    const html = courseKickoffHtml({
      firstName: 'Jordan',
      programName: 'Google Cybersecurity Certificate',
    });
    assert.match(html, /has been saved in your WorkforceAP account/);
    assert.match(html, /does not confirm that funding is secured/);
    assert.match(html, /Google Cybersecurity Certificate/);
  });
});
