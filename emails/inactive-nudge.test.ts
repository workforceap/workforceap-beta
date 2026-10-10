import test from 'node:test';
import assert from 'node:assert/strict';
import { inactiveNudgeHtml } from './inactive-nudge';

test('the inactive nudge still greets the member and offers help', () => {
  const html = inactiveNudgeHtml({ firstName: 'Jordan' });
  assert.match(html, /Hi Jordan/);
  assert.match(html, /info@workforceap\.org/);
});

test('the nudge tells a member who never started what to do first (ops 10/8/26)', () => {
  const html = inactiveNudgeHtml({ firstName: 'Jordan' });
  // "Pick up where you left off" means nothing to someone who never began.
  assert.match(html, /Start here/);
  assert.match(html, /WIOA Preassessment/);
  assert.match(html, /35 questions/);
  assert.ok(html.includes('https://www.workforceap.org/login?redirectTo=%2Fdashboard%2Fassessment'));
  assert.ok(html.includes('https://www.workforceap.org/login?redirectTo=%2Fdashboard%2Fai-tools'));
});

test('first names are escaped', () => {
  assert.doesNotMatch(inactiveNudgeHtml({ firstName: '<b>x</b>' }), /<b>x<\/b>/);
});
