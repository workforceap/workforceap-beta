import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANALYTICS_COHORT_DETAIL_CAP,
  ANALYTICS_SAMPLE_CAP,
  COURSERA_B4B_REPORT_CAP,
  COURSERA_B4B_USER_LOOKUP_CAP,
  CRON_SCOPED_LOOKUP_CAP,
  LOOKUP_CATALOG_CAP,
  MEMBER_PROGRESS_CAP,
  ONET_SYNC_OCCUPATION_CAP,
  REPORT_SAMPLE_CAP,
  UNBOUNDED_SCAN_TAKE_FLOOR,
  WORK_QUEUE_CAP,
  clampScanTake,
  sqlCount,
} from './scanCaps';

// The former "claimed leftover files no longer hydrate 5k/10k/20k rows" source
// sweep is now the repo-wide ESLint ban on `take: <literal >= 5000>`
// (UNBOUNDED_TAKE_BAN in eslint.config.mjs). The SQL-aggregate, B4B resume
// cursor and O*NET ordering guarantees are exercised behaviourally in
// tests/lib/boardOutcomes.snapshot.test.ts, tests/lib/onet-sync-cap.spec.ts
// and lib/coursera/b4bSync.test.ts.

test('leftover scan caps stay below the old silent 5k floor', () => {
  assert.equal(UNBOUNDED_SCAN_TAKE_FLOOR, 5000);
  for (const [name, cap] of Object.entries({
    ANALYTICS_SAMPLE_CAP,
    ANALYTICS_COHORT_DETAIL_CAP,
    REPORT_SAMPLE_CAP,
    WORK_QUEUE_CAP,
    LOOKUP_CATALOG_CAP,
    MEMBER_PROGRESS_CAP,
    COURSERA_B4B_REPORT_CAP,
    COURSERA_B4B_USER_LOOKUP_CAP,
    ONET_SYNC_OCCUPATION_CAP,
    CRON_SCOPED_LOOKUP_CAP,
  })) {
    assert.ok(Number.isInteger(cap) && cap > 0, `${name} must be a positive integer`);
    assert.ok(cap < UNBOUNDED_SCAN_TAKE_FLOOR, `${name} (${cap}) must stay below the ${UNBOUNDED_SCAN_TAKE_FLOOR} floor`);
  }
});

test('clampScanTake never exceeds the cap and never returns a non-positive take', () => {
  assert.equal(clampScanTake(Number.NaN, 10), 1);
  assert.equal(clampScanTake(Number.POSITIVE_INFINITY, 10), 1);
  assert.equal(clampScanTake(0, 10), 1);
  assert.equal(clampScanTake(-4, 10), 1);
  assert.equal(clampScanTake(99, 10), 10);
  assert.equal(clampScanTake(7.9, 10), 7);
  assert.equal(clampScanTake(UNBOUNDED_SCAN_TAKE_FLOOR * 4, ANALYTICS_SAMPLE_CAP), ANALYTICS_SAMPLE_CAP);
});

test('sqlCount normalizes bigint / number / null aggregate results', () => {
  assert.equal(sqlCount(BigInt(12)), 12);
  assert.equal(sqlCount(4), 4);
  assert.equal(sqlCount(null), 0);
  assert.equal(sqlCount(undefined), 0);
});
