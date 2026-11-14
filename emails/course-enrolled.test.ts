/**
 * Program-selection mail interpolates the member first name and program
 * title. Those fields must not become markup, and the copy must not claim
 * funded enrollment or course access.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { courseEnrolledHtml } from './course-enrolled';

describe('courseEnrolledHtml', () => {
  it('escapes the first name and program name', () => {
    const html = courseEnrolledHtml({
      firstName: '<script>alert(1)</script>',
      programName: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('treats the save as a program selection, not funded enrollment', () => {
    const html = courseEnrolledHtml({
      firstName: 'Jordan',
      programName: 'IT Support Professional Certificate',
    });
    assert.match(html, /program selection/);
    assert.match(html, /IT Support Professional Certificate/);
    assert.doesNotMatch(html, /you are enrolled/i);
    assert.doesNotMatch(html, /classes are ready/i);
  });
});
