import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnelWaterfall } from './boardOutcomes';

/**
 * Number audit 2026-09-20, F5: the outcomes CSV printed "Approved 0 →
 * Enrolled 37, 0%" because Approved was hard-coded as Enrolled's previous
 * stage although approval is not a gate to enrolment.
 */
test('Enrolled converts from Applications; Approved is not a waterfall stage', () => {
  const stages = buildFunnelWaterfall({ accounts: 134, applications: 114, enrolled: 37, trainingCompleted: 4, placed: 0 });
  assert.deepEqual(stages.map((s) => s.stage), ['Accounts', 'Applications', 'Enrolled', 'Training completed', 'Placed']);
  const enrolled = stages.find((s) => s.stage === 'Enrolled');
  assert.deepEqual(enrolled, { stage: 'Enrolled', count: 37, previousCount: 114, conversionRate: 32 });
  assert.deepEqual(stages[0], { stage: 'Accounts', count: 134 });
  assert.deepEqual(stages.at(-1), { stage: 'Placed', count: 0, previousCount: 4, conversionRate: 0 });
});

test('no conversion rate is printed over an empty previous stage', () => {
  const stages = buildFunnelWaterfall({ accounts: 0, applications: 0, enrolled: 37, trainingCompleted: 0, placed: 0 });
  const enrolled = stages.find((s) => s.stage === 'Enrolled');
  assert.equal(enrolled?.previousCount, 0);
  assert.equal(enrolled?.conversionRate, undefined);
  assert.equal(stages.find((s) => s.stage === 'Placed')?.conversionRate, undefined);
});
