/**
 * Weekly admin recap interpolates four counts into an HTML table. Each count
 * is coerced to a non-negative integer so a bad payload cannot print "NaN"
 * or a negative total.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminWeeklyRecapHtml } from './admin-weekly-recap';

function recap(overrides: Partial<{
  newApplicants: number;
  placements: number;
  atRiskStudents: number;
  pendingApplications: number;
}> = {}) {
  return adminWeeklyRecapHtml({
    newApplicants: 4,
    placements: 1,
    atRiskStudents: 2,
    pendingApplications: 3,
    ...overrides,
  });
}

describe('adminWeeklyRecapHtml', () => {
  it('renders the four weekly totals', () => {
    const html = recap();
    assert.match(html, />4</);
    assert.match(html, />1</);
    assert.match(html, />2</);
    assert.match(html, />3</);
  });

  it('clamps non-numeric and negative counts to zero and floors fractions', () => {
    const html = recap({
      newApplicants: Number.NaN,
      placements: -2,
      atRiskStudents: 0,
      pendingApplications: 1.9,
    });
    assert.ok(!html.includes('NaN'));
    assert.ok(!html.includes('-2'));
    assert.match(html, />0</);
    assert.match(html, />1</);
  });
});
