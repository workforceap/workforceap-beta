import test from 'node:test';
import assert from 'node:assert/strict';

import { STALE_TRAINING_ACTIVITY_DAYS, isTrainingActivityStale } from './trainingStaleness';

const NOW = new Date('2026-09-21T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

test('the threshold is the 14 days the training surfaces already use', () => {
  assert.equal(STALE_TRAINING_ACTIVITY_DAYS, 14);
});

test('recent activity is not stale, and neither is a member who just enrolled', () => {
  assert.equal(
    isTrainingActivityStale({ lastActivityAt: daysAgo(1), eligibleSince: daysAgo(40), now: NOW }),
    false,
  );
  // The 0%-an-hour-ago case: nothing saved yet, enrolled today.
  assert.equal(
    isTrainingActivityStale({ lastActivityAt: null, eligibleSince: daysAgo(0), now: NOW }),
    false,
  );
});

test('the threshold is exclusive at exactly the boundary and crosses just past it', () => {
  const exactly = daysAgo(STALE_TRAINING_ACTIVITY_DAYS);
  assert.equal(isTrainingActivityStale({ lastActivityAt: exactly, eligibleSince: null, now: NOW }), false);
  assert.equal(
    isTrainingActivityStale({ lastActivityAt: new Date(exactly.getTime() - 1), eligibleSince: null, now: NOW }),
    true,
  );
});

test('with nothing saved the clock runs from when the member could start', () => {
  assert.equal(isTrainingActivityStale({ lastActivityAt: null, eligibleSince: daysAgo(30), now: NOW }), true);
  assert.equal(isTrainingActivityStale({ lastActivityAt: null, eligibleSince: daysAgo(3), now: NOW }), false);
});

test('saved activity wins over the enrolment date in both directions', () => {
  // Enrolled long ago but active yesterday — not stale.
  assert.equal(isTrainingActivityStale({ lastActivityAt: daysAgo(1), eligibleSince: daysAgo(300), now: NOW }), false);
  // Enrolled yesterday is impossible with activity 30 days old, but the
  // predicate must still prefer the saved activity rather than the fallback.
  assert.equal(isTrainingActivityStale({ lastActivityAt: daysAgo(30), eligibleSince: daysAgo(1), now: NOW }), true);
});

test('nothing is claimed when neither date is on file', () => {
  assert.equal(isTrainingActivityStale({ lastActivityAt: null, eligibleSince: null, now: NOW }), false);
});

test('the cron flag short-circuits to stale even with no dates', () => {
  assert.equal(
    isTrainingActivityStale({ lastActivityAt: daysAgo(1), eligibleSince: null, staleDetectedAt: daysAgo(2), now: NOW }),
    true,
  );
  assert.equal(
    isTrainingActivityStale({ lastActivityAt: null, eligibleSince: null, staleDetectedAt: daysAgo(2), now: NOW }),
    true,
  );
});
