import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProgramProgress } from './analytics';

/**
 * Number audit 2026-09-20, S24: legacy Analytics listed CompTIA A+ twice
 * (alias slug and canonical slug) and credited rollups for programs the
 * learner was not assigned to.
 */
test('alias slugs fold onto one canonical program with a member-weighted average', () => {
  const rows = summarizeProgramProgress([
    { programSlug: 'comptia-a-plus', enrolledProgram: 'comptia-a-plus', avgPercent: 20, memberCount: 2 },
    { programSlug: 'comptia-a-professional-certificate', enrolledProgram: 'comptia-a-professional-certificate', avgPercent: 50, memberCount: 2 },
    { programSlug: 'it-support', enrolledProgram: 'it-support', avgPercent: 10, memberCount: 5 },
  ]);
  assert.deepEqual(rows, [
    { programSlug: 'it-support', avgPercent: 10, activeMembers: 5 },
    { programSlug: 'comptia-a-professional-certificate', avgPercent: 35, activeMembers: 4 },
  ]);
});

test('a rollup for a program the learner is not assigned to is not that program\'s progress', () => {
  const rows = summarizeProgramProgress([
    { programSlug: 'comptia-a-plus', enrolledProgram: 'it-support', avgPercent: 0, memberCount: 12 },
    { programSlug: 'it-support', enrolledProgram: 'it-support', avgPercent: 40, memberCount: 3 },
  ]);
  assert.deepEqual(rows, [{ programSlug: 'it-support', avgPercent: 40, activeMembers: 3 }]);
});
