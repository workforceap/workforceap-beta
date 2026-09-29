import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSERA_SYNC_STALE_HOURS,
  freshnessVerdict,
  latestDate,
  type CourseraFreshnessFacts,
} from './diagnoseMemberCourseraVerdict';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

function facts(overrides: Partial<CourseraFreshnessFacts> = {}): CourseraFreshnessFacts {
  return {
    orgLastB4BSyncAt: hoursAgo(2),
    memberLastSyncAt: hoursAgo(2),
    memberLastSyncSource: 'b4b_sync',
    lastXapiReceivedAt: null,
    lastLearnerActivityAt: hoursAgo(30),
    ...overrides,
  };
}

test('freshnessVerdict: no canonical enrollment gives no freshness verdict', () => {
  assert.equal(
    freshnessVerdict({ facts: facts(), hasCanonicalEnrollment: false, allProgramsComplete: false, now: NOW }),
    null,
  );
});

test('freshnessVerdict: org B4B sync older than the threshold is stale, not learner inactivity', () => {
  const v = freshnessVerdict({
    facts: facts({ orgLastB4BSyncAt: hoursAgo(COURSERA_SYNC_STALE_HOURS + 1), memberLastSyncAt: hoursAgo(40) }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_stale');
  assert.equal(v?.status, 'warn');
  assert.match(v!.detail, /not evidence that the learner is inactive/);
});

test('freshnessVerdict: a sync that never wrote a row in the org is stale', () => {
  const v = freshnessVerdict({
    facts: facts({ orgLastB4BSyncAt: null, memberLastSyncAt: null, memberLastSyncSource: null }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_stale');
  assert.match(v!.title, /never/i);
});

test('freshnessVerdict: stale sync mentions a recent xAPI receipt as the live channel', () => {
  const v = freshnessVerdict({
    facts: facts({ orgLastB4BSyncAt: hoursAgo(48), lastXapiReceivedAt: hoursAgo(1) }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_stale');
  assert.match(v!.detail, /xAPI/);
});

test('freshnessVerdict: exactly at the threshold still counts as current', () => {
  const v = freshnessVerdict({
    facts: facts({ orgLastB4BSyncAt: hoursAgo(COURSERA_SYNC_STALE_HOURS) }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_current_incomplete');
});

test('freshnessVerdict: sync is current but has never written this learner', () => {
  const v = freshnessVerdict({
    facts: facts({ memberLastSyncAt: null, memberLastSyncSource: null, lastLearnerActivityAt: null }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'not_seen_by_sync');
  assert.equal(v?.status, 'warn');
  assert.match(v!.detail, /roster/);
});

test('freshnessVerdict: current sync with unfinished courses is incomplete, not stale', () => {
  const v = freshnessVerdict({
    facts: facts(),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_current_incomplete');
  assert.equal(v?.status, 'ok');
  assert.match(v!.detail, /1d ago/);
  assert.match(v!.detail, /b4b_sync/);
});

test('freshnessVerdict: current sync with no recorded learner activity says so', () => {
  const v = freshnessVerdict({
    facts: facts({ lastLearnerActivityAt: null }),
    hasCanonicalEnrollment: true,
    allProgramsComplete: false,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_current_incomplete');
  assert.match(v!.detail, /no learner activity recorded/i);
});

test('freshnessVerdict: current sync with every program complete', () => {
  const v = freshnessVerdict({
    facts: facts(),
    hasCanonicalEnrollment: true,
    allProgramsComplete: true,
    now: NOW,
  });
  assert.equal(v?.state, 'sync_current_complete');
  assert.equal(v?.status, 'ok');
});

test('latestDate: picks the newest non-null date', () => {
  assert.equal(latestDate(null, undefined), null);
  assert.deepEqual(latestDate(hoursAgo(5), null, hoursAgo(1)), hoursAgo(1));
});
