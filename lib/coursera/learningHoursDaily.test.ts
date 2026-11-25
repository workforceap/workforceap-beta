import test from 'node:test';
import assert from 'node:assert/strict';

import {
  centralDateKey,
  dailyCourseraMinutes,
  pickGradebookLearningHours,
} from './learningHoursDaily';

test('consecutive days give exact minutes from the cumulative total', () => {
  const rows = dailyCourseraMinutes([
    { courseraCourseId: 'c1', snapshotDate: '2026-11-02', learningHours: 1.5 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-03', learningHours: 2.25 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-04', learningHours: 2.25 },
  ]);
  assert.deepEqual(rows, [
    { date: '2026-11-02', courseraCourseId: 'c1', status: 'unknown', reason: 'NO_PREVIOUS_SNAPSHOT' },
    { date: '2026-11-03', courseraCourseId: 'c1', status: 'known', minutes: 45, gapDays: 0 },
    { date: '2026-11-04', courseraCourseId: 'c1', status: 'known', minutes: 0, gapDays: 0 },
  ]);
});

test('a decreased total is unknown, never negative or zero', () => {
  const rows = dailyCourseraMinutes([
    { courseraCourseId: 'c1', snapshotDate: '2026-11-02', learningHours: 3 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-03', learningHours: 2 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-04', learningHours: 2.5 },
  ]);
  assert.deepEqual(rows.map((r) => [r.date, r.status, 'minutes' in r ? r.minutes : r.reason]), [
    ['2026-11-02', 'unknown', 'NO_PREVIOUS_SNAPSHOT'],
    ['2026-11-03', 'unknown', 'TOTAL_DECREASED'],
    ['2026-11-04', 'known', 30],
  ]);
});

test('a gap lands the accrued minutes on the next reading and flags the gap', () => {
  const rows = dailyCourseraMinutes([
    { courseraCourseId: 'c1', snapshotDate: '2026-11-06', learningHours: 4 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-03', learningHours: 1 },
  ]);
  assert.deepEqual(rows[1], { date: '2026-11-06', courseraCourseId: 'c1', status: 'known', minutes: 180, gapDays: 2 });
});

test('courses are independent and two readings on one day keep the larger', () => {
  const rows = dailyCourseraMinutes([
    { courseraCourseId: 'b', snapshotDate: '2026-11-02', learningHours: 0 },
    { courseraCourseId: 'a', snapshotDate: '2026-11-02', learningHours: 1 },
    { courseraCourseId: 'a', snapshotDate: '2026-11-03', learningHours: 1.2 },
    { courseraCourseId: 'a', snapshotDate: '2026-11-03', learningHours: 1.1 },
    { courseraCourseId: 'b', snapshotDate: '2026-11-03', learningHours: 0.5 },
  ]);
  assert.deepEqual(
    rows.filter((r) => r.status === 'known').map((r) => [r.date, r.courseraCourseId, r.status === 'known' && r.minutes]),
    [
      ['2026-11-03', 'a', 12],
      ['2026-11-03', 'b', 30],
    ],
  );
});

test('invalid hours are unknown and do not become the baseline', () => {
  const rows = dailyCourseraMinutes([
    { courseraCourseId: 'c1', snapshotDate: '2026-11-02', learningHours: 1 },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-03', learningHours: Number.NaN },
    { courseraCourseId: 'c1', snapshotDate: '2026-11-04', learningHours: 2 },
  ]);
  assert.deepEqual(rows.map((r) => r.status === 'known' ? r.minutes : r.reason), [
    'NO_PREVIOUS_SNAPSHOT',
    'INVALID_HOURS',
    60,
  ]);
  assert.equal(rows[2].status === 'known' && rows[2].gapDays, 1);
});

test('bad dates throw instead of guessing', () => {
  assert.throws(() => dailyCourseraMinutes([{ courseraCourseId: 'c', snapshotDate: '2026-02-30', learningHours: 1 }]));
  assert.throws(() => dailyCourseraMinutes([{ courseraCourseId: 'c', snapshotDate: '11/02/2026', learningHours: 1 }]));
});

test('centralDateKey uses the Central calendar day across DST', () => {
  // 03:30 UTC on Nov 3 is still Nov 2 in Chicago (CST, UTC-6).
  assert.equal(centralDateKey(new Date('2026-11-03T03:30:00Z')), '2026-11-02');
  // 04:45 UTC in July is 23:45 the previous day (CDT, UTC-5).
  assert.equal(centralDateKey(new Date('2026-07-15T04:45:00Z')), '2026-07-14');
  // The nightly run at 04:45 UTC in winter is 22:45 the previous day.
  assert.equal(centralDateKey(new Date('2026-12-15T04:45:00Z')), '2026-12-14');
});

test('pickGradebookLearningHours prefers the exact total and rejects junk', () => {
  assert.equal(pickGradebookLearningHours({ totalLearningHours: 3.4, approxTotalLearningHrs: 3 }), 3.4);
  assert.equal(pickGradebookLearningHours({ approxTotalLearningHrs: 2 }), 2);
  assert.equal(pickGradebookLearningHours({ approxTotalLearningHrs: '1.75' }), 1.75);
  assert.equal(pickGradebookLearningHours({ totalLearningHours: -1, approxTotalLearningHrs: null }), null);
  assert.equal(pickGradebookLearningHours({}), null);
});
