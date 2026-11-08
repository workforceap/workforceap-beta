/**
 * Reserved-seat mail interpolates the member first name and program title.
 * Hostile names must not become markup, and a reserved seat must not read
 * as funded enrollment.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { courseAccountabilityHtml } from './course-accountability';

describe('courseAccountabilityHtml', () => {
  it('escapes the first name and program name', () => {
    const html = courseAccountabilityHtml({
      firstName: '<script>alert(1)</script>',
      programName: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('describes a reserved seat while funding is still being identified', () => {
    const html = courseAccountabilityHtml({
      firstName: 'Jordan',
      programName: 'CompTIA Network+',
    });
    assert.match(html, /seat for the CompTIA Network\+ training program is reserved/);
    assert.match(html, /working to identify a WIOA training grant/);
    assert.match(html, /Once funding is secured and approved, you will be officially enrolled/);
  });
});
