/**
 * Course-completion mail interpolates the member first name and a provider
 * course title. Those fields must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { courseCompletedHtml } from './course-completed';

describe('courseCompletedHtml', () => {
  it('escapes the first name and course title', () => {
    const html = courseCompletedHtml({
      firstName: '<script>alert(1)</script>',
      courseName: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('Congratulations, &lt;script&gt;alert(1)&lt;/script&gt;!'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });
});
