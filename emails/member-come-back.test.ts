/**
 * Member come-back nudge HTML escaping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { memberComeBackHtml, memberComeBackSubject } from './member-come-back';

test('escapes first name, counselor name and CTA label', () => {
  const html = memberComeBackHtml({
    firstName: '<img src=x onerror=1>',
    counselorName: '<b>Jordan</b>',
    nextBestActionUrl: 'https://evil.test/" onclick="alert(1)',
    nextBestActionLabel: '<script>alert(1)</script>',
  });
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<b>Jordan<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Hi &lt;img src=x onerror=1&gt;/);
  assert.match(html, /&lt;b&gt;Jordan&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/evil\.test\/&quot; onclick=&quot;alert\(1\)"/);
});

test('currently lets a javascript: nextBestActionUrl through escapeHtml (pinned)', () => {
  const html = memberComeBackHtml({
    firstName: 'Alex',
    counselorName: 'Jordan',
    nextBestActionUrl: 'javascript:alert(1)',
    nextBestActionLabel: 'Take the next step',
  });
  assert.match(html, /href="javascript:alert\(1\)"/);
});

test('subject interpolates the counselor name as typed', () => {
  assert.equal(memberComeBackSubject('Jordan <ops>'), 'Jordan <ops> has a question for you');
});
