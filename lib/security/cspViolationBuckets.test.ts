import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CSP_BUCKET_CEILING_RECOUNT_MARGIN,
  CSP_VIOLATION_PATH_SAMPLE_SIZE,
  advanceCspBucketEstimate,
  bucketCspViolations,
  groupCspViolationBuckets,
  shouldRecountCspBuckets,
  sumCspViolationCounts,
  truncateToHour,
  type CspViolationBucketRow,
} from './cspViolationBuckets';
import { CSP_REPORT_MAX_VIOLATIONS_PER_BATCH, CSP_VIOLATION_MAX_BUCKETS_PER_HOUR } from './cspReport';

const at = (iso: string) => new Date(iso);

test('truncateToHour drops minutes, seconds and milliseconds in UTC and does not mutate its input', () => {
  const input = at('2026-09-21T14:37:58.912Z');
  const bucket = truncateToHour(input);
  assert.equal(bucket.toISOString(), '2026-09-21T14:00:00.000Z');
  assert.equal(input.toISOString(), '2026-09-21T14:37:58.912Z');
  assert.equal(truncateToHour(at('2026-09-21T14:00:00.000Z')).toISOString(), '2026-09-21T14:00:00.000Z');
  // Just before midnight stays on its own day.
  assert.equal(truncateToHour(at('2026-09-21T23:59:59.999Z')).toISOString(), '2026-09-21T23:00:00.000Z');
});

test('bucketCspViolations dedupes on the five-field key, sums counts and skips empty rows', () => {
  const seenAt = at('2026-09-21T14:37:00Z');
  const base = { directive: 'script-src-elem', blockedHost: 'inline', documentPath: '/dashboard', disposition: 'report' as const };
  const writes = bucketCspViolations(
    [
      { ...base, count: 2 },
      { ...base, count: 3 },
      { ...base, documentPath: '/admin/members/:id', count: 1 },
      { ...base, count: 0 },
      { ...base, disposition: 'enforce', count: Number.NaN },
    ],
    seenAt,
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((w) => [w.documentPath, w.count, w.hourBucket.toISOString(), w.seenAt === seenAt]),
    [
      ['/dashboard', 5, '2026-09-21T14:00:00.000Z', true],
      ['/admin/members/:id', 1, '2026-09-21T14:00:00.000Z', true],
    ],
  );
  assert.deepEqual(bucketCspViolations([], seenAt), []);
});

const row = (over: Partial<CspViolationBucketRow>): CspViolationBucketRow => ({
  hourBucket: at('2026-09-21T14:00:00Z'),
  directive: 'script-src-elem',
  blockedHost: 'inline',
  documentPath: '/dashboard',
  disposition: 'report',
  count: 1,
  firstSeenAt: at('2026-09-21T14:05:00Z'),
  lastSeenAt: at('2026-09-21T14:50:00Z'),
  ...over,
});

test('sumCspViolationCounts totals every row, or only the buckets at/after `since`', () => {
  const rows = [
    row({ hourBucket: at('2026-09-20T10:00:00Z'), count: 4 }),
    row({ hourBucket: at('2026-09-21T13:00:00Z'), count: 2 }),
    row({ hourBucket: at('2026-09-21T14:00:00Z'), count: 1 }),
  ];
  assert.equal(sumCspViolationCounts(rows), 7);
  assert.equal(sumCspViolationCounts(rows, at('2026-09-21T13:00:00Z')), 3);
  assert.equal(sumCspViolationCounts(rows, at('2026-09-21T13:00:00.001Z')), 1);
  assert.equal(sumCspViolationCounts([], at('2026-01-01T00:00:00Z')), 0);
});

test('groupCspViolationBuckets folds hours and pages into (directive, host) groups, most reports first', () => {
  const groups = groupCspViolationBuckets([
    row({ documentPath: '/dashboard', count: 5, firstSeenAt: at('2026-09-21T14:05:00Z'), lastSeenAt: at('2026-09-21T14:50:00Z') }),
    row({ hourBucket: at('2026-09-21T15:00:00Z'), documentPath: '/dashboard', count: 2, firstSeenAt: at('2026-09-21T15:01:00Z'), lastSeenAt: at('2026-09-21T15:20:00Z') }),
    row({ hourBucket: at('2026-09-20T09:00:00Z'), documentPath: '/en/login', count: 1, firstSeenAt: at('2026-09-20T09:30:00Z'), lastSeenAt: at('2026-09-20T09:31:00Z') }),
    row({ documentPath: '/admin/members/:id', count: 3 }),
    row({ documentPath: '/jobs/:id', count: 3, disposition: 'enforce' }),
    row({ directive: 'connect-src', blockedHost: 'cdn.evil.example', documentPath: '/', count: 9 }),
    row({ directive: 'img-src', blockedHost: 'unknown', documentPath: '/', count: 9 }),
  ]);

  assert.deepEqual(
    groups.map((g) => [g.directive, g.blockedHost, g.count]),
    [
      ['script-src-elem', 'inline', 14],
      ['connect-src', 'cdn.evil.example', 9],
      ['img-src', 'unknown', 9],
    ],
  );

  const inline = groups[0];
  assert.equal(CSP_VIOLATION_PATH_SAMPLE_SIZE, 3);
  // Paths most-reported first; ties alphabetical; the sample is capped and the total is kept.
  assert.deepEqual(inline.documentPaths, ['/dashboard', '/admin/members/:id', '/jobs/:id']);
  assert.equal(inline.documentPathCount, 4);
  assert.deepEqual(inline.dispositions, ['enforce', 'report']);
  assert.equal(inline.firstSeenAt.toISOString(), '2026-09-20T09:30:00.000Z');
  assert.equal(inline.lastSeenAt.toISOString(), '2026-09-21T15:20:00.000Z');

  assert.deepEqual(groupCspViolationBuckets([], 3), []);
  assert.deepEqual(groupCspViolationBuckets([row({})], 0)[0].documentPaths, []);
});

test('shouldRecountCspBuckets: first batch, bucket change, or estimate within the margin of the ceiling', () => {
  const hour = at('2026-03-04T05:00:00.000Z');
  const ceiling = CSP_VIOLATION_MAX_BUCKETS_PER_HOUR;
  const margin = CSP_BUCKET_CEILING_RECOUNT_MARGIN;
  assert.ok(margin > CSP_REPORT_MAX_VIOLATIONS_PER_BATCH, 'margin covers a whole batch, so no single batch can jump from riding the cache to past the ceiling');

  assert.equal(shouldRecountCspBuckets(null, hour, 1), true, 'no estimate yet');
  const estimate = { hourBucketMs: hour.getTime(), distinct: 40 };
  assert.equal(shouldRecountCspBuckets(estimate, hour, 20), false, 'far below the ceiling');
  assert.equal(shouldRecountCspBuckets(estimate, at('2026-03-04T06:00:00.000Z'), 1), true, 'new hour bucket');
  // Boundary: estimate + batch == ceiling - margin still rides the cache; one more forces a count.
  assert.equal(shouldRecountCspBuckets({ hourBucketMs: hour.getTime(), distinct: ceiling - margin - 20 }, hour, 20), false);
  assert.equal(shouldRecountCspBuckets({ hourBucketMs: hour.getTime(), distinct: ceiling - margin - 19 }, hour, 20), true);
  assert.equal(shouldRecountCspBuckets({ hourBucketMs: hour.getTime(), distinct: ceiling }, hour, 1), true, 'at the ceiling');
  // Explicit ceiling/margin for callers that size their own bound.
  assert.equal(shouldRecountCspBuckets({ hourBucketMs: hour.getTime(), distinct: 5 }, hour, 5, 20, 10), false);
  assert.equal(shouldRecountCspBuckets({ hourBucketMs: hour.getTime(), distinct: 6 }, hour, 5, 20, 10), true);
});

test('advanceCspBucketEstimate adds the keys a batch may have created and never goes down', () => {
  const hour = at('2026-03-04T05:00:00.000Z');
  const start = { hourBucketMs: hour.getTime(), distinct: 40 };
  const next = advanceCspBucketEstimate(start, 20);
  assert.deepEqual(next, { hourBucketMs: hour.getTime(), distinct: 60 });
  assert.deepEqual(start, { hourBucketMs: hour.getTime(), distinct: 40 }, 'input not mutated');
  assert.equal(advanceCspBucketEstimate(next, 0).distinct, 60);
  assert.equal(advanceCspBucketEstimate(next, -3).distinct, 60, 'a negative creation count is a bug upstream, never a decrement');
  // Soft-bound arithmetic the store documents: from a fresh count of `real`, full batches ride
  // the cache floor((ceiling - margin - real) / batch) times before the next real count.
  let estimate = { hourBucketMs: hour.getTime(), distinct: 30 };
  let batches = 0;
  while (!shouldRecountCspBuckets(estimate, hour, CSP_REPORT_MAX_VIOLATIONS_PER_BATCH)) {
    estimate = advanceCspBucketEstimate(estimate, CSP_REPORT_MAX_VIOLATIONS_PER_BATCH);
    batches += 1;
  }
  assert.equal(batches, Math.floor((CSP_VIOLATION_MAX_BUCKETS_PER_HOUR - CSP_BUCKET_CEILING_RECOUNT_MARGIN - 30) / CSP_REPORT_MAX_VIOLATIONS_PER_BATCH));
  assert.equal(batches, 93);
});
