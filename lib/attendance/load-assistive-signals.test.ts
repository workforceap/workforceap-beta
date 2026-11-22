import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMonthlyAssistiveSignals } from './load-assistive-signals';

const ORG = '00000000-0000-4000-8000-000000000003';
const ENROLLMENT = '00000000-0000-4000-8000-000000000005';

test('loader counts only this learner and never returns hours fields', async () => {
  const calls: string[] = [];
  const db = {
    courseEnrollment: { findFirst: async () => { calls.push('enrollment'); return { userId: 'member', programSlug: 'synthetic', user: { organizationId: ORG, email: 'synthetic@example.invalid', lastLoginAt: new Date('2026-11-09T15:00:00Z') } }; } },
    courseraIdentityMapping: { findMany: async () => [] },
    courseraCourseProgress: { findMany: async () => [{ isCompleted: false, learningHours: 3, lastActivityTime: new Date('2026-11-09T16:00:00Z'), completionTime: null }] },
    xapiStatement: { findMany: async () => { throw new Error('should not query without an identity'); } },
    courseProgress: { findMany: async () => [] },
    memberEvent: { findMany: async () => [{ createdAt: new Date('2026-11-10T15:00:00Z') }] },
  };
  const signals = await loadMonthlyAssistiveSignals(db, ORG, ENROLLMENT, '2026-11');
  assert.ok(signals);
  assert.equal(signals?.days.find(day => day.date === '2026-11-09')?.courseraPoints, 1);
  assert.equal(signals?.days.find(day => day.date === '2026-11-09')?.sitePoints, 1);
  assert.equal(signals?.days.find(day => day.date === '2026-11-10')?.sitePoints, 1);
  assert.equal(signals?.coursera?.learningHours, 3);
  assert.equal(calls.includes('enrollment'), true);
  assert.equal('minutes' in (signals ?? {}), false);
});

test('another organization returns nothing', async () => {
  const db = {
    courseEnrollment: { findFirst: async () => null },
    courseraIdentityMapping: { findMany: async () => [] },
    courseraCourseProgress: { findMany: async () => [] },
    xapiStatement: { findMany: async () => [] },
    courseProgress: { findMany: async () => [] },
    memberEvent: { findMany: async () => [] },
  };
  assert.equal(await loadMonthlyAssistiveSignals(db, ORG, ENROLLMENT, '2026-11'), null);
});
