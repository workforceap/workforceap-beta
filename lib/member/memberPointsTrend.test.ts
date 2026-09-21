import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBER_TREND_WEEK_MS,
  MEMBER_TREND_WEEKS,
  buildMemberPointsTrend,
  memberPointsSpark,
  memberTrendWindows,
  reconcilePointsLedger,
  type PointsTrendTransaction,
} from './memberPointsTrend';

/** A fixed clock: bucket edges must be exact, so nothing here may read Date.now(). */
const NOW = new Date('2026-09-21T18:00:00.000Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function at(msAgo: number, points: number): PointsTrendTransaction {
  return { points, createdAt: new Date(NOW - msAgo) };
}

/** The chip printed beside the tiles: a bare rolling-7-day sum, no buckets. */
function chipThisWeek(transactions: PointsTrendTransaction[], now = NOW): number {
  const weekAgo = now - MEMBER_TREND_WEEK_MS;
  return transactions
    .filter((tx) => tx.createdAt.getTime() >= weekAgo)
    .reduce((sum, tx) => sum + tx.points, 0);
}

test('the windows tile the last 8 rolling weeks with no gap and no overlap', () => {
  const windows = memberTrendWindows(NOW);
  assert.equal(windows.length, MEMBER_TREND_WEEKS);
  assert.ok(windows.length > 1, 'need at least two windows to compare adjacent edges');
  assert.equal(windows[0].start, NOW - MEMBER_TREND_WEEKS * MEMBER_TREND_WEEK_MS);
  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(windows[i].start, windows[i - 1].end, `window ${i} must start where ${i - 1} ended`);
  }
  // The newest window is open at the top so a clock-skewed future row still
  // counts, exactly as the chip's bare `createdAt >= weekAgo` counts it.
  assert.equal(windows[windows.length - 1].start, NOW - MEMBER_TREND_WEEK_MS);
  assert.equal(windows[windows.length - 1].end, Number.POSITIVE_INFINITY);
});

test('a member with no transactions gets eight zeros, not an empty or short series', () => {
  const trend = buildMemberPointsTrend({ transactions: [], now: NOW });
  assert.deepEqual(trend.series, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(trend.thisWeek, 0);
  assert.equal(trend.previousWeek, 0);
  // Eight flat zeros is not a trend: the tile draws nothing rather than a
  // rule along the axis that reads as a real trend sitting at zero.
  assert.equal(memberPointsSpark(trend), undefined);
});

test('a member with one transaction gets that week only, and seven zeros before it', () => {
  const transactions = [at(2 * DAY_MS, 25)];
  const trend = buildMemberPointsTrend({ transactions, now: NOW });
  assert.deepEqual(trend.series, [0, 0, 0, 0, 0, 0, 0, 25]);
  assert.equal(trend.series.length, MEMBER_TREND_WEEKS);
  assert.equal(trend.thisWeek, 25);
  const spark = memberPointsSpark(trend);
  assert.ok(spark, 'a single real week still draws: the eight points are all true');
  assert.equal(spark.series?.length, MEMBER_TREND_WEEKS);
  assert.equal(spark.delta, '25');
  assert.equal(spark.direction, 'up');
});

test('a silent week is a 0 in place, never a dropped point', () => {
  // Weeks (newest last): this week 10, last week nothing, the week before 40.
  const transactions = [at(1 * DAY_MS, 10), at(16 * DAY_MS, 40)];
  const trend = buildMemberPointsTrend({ transactions, now: NOW });
  assert.equal(trend.series.length, MEMBER_TREND_WEEKS);
  assert.deepEqual(trend.series, [0, 0, 0, 0, 0, 40, 0, 10]);
  // The gap is the point of the line: dropping it would redraw a stall as a
  // continuous climb.
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 2], 0);
  assert.equal(trend.previousWeek, 0);
  const spark = memberPointsSpark(trend);
  assert.ok(spark);
  assert.equal(spark.delta, '10');
  assert.equal(spark.direction, 'up');
});

test('the week boundary is inclusive at the start, so a row on the edge is this week here and in the chip', () => {
  const onTheEdge = [at(MEMBER_TREND_WEEK_MS, 7)];
  const trend = buildMemberPointsTrend({ transactions: onTheEdge, now: NOW });
  assert.equal(trend.thisWeek, 7, 'exactly 7 days old is still "this week"');
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 1], 7);
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 2], 0);
  assert.equal(trend.thisWeek, chipThisWeek(onTheEdge));

  // One millisecond older falls into the previous bucket, and out of the chip.
  const justOver = [at(MEMBER_TREND_WEEK_MS + 1, 7)];
  const older = buildMemberPointsTrend({ transactions: justOver, now: NOW });
  assert.equal(older.thisWeek, 0);
  assert.equal(older.series[MEMBER_TREND_WEEKS - 2], 7);
  assert.equal(older.thisWeek, chipThisWeek(justOver));
});

test('bucketing across a week boundary splits the rows either side of it', () => {
  // Three rows straddling the 7-day edge, plus one straddling the 14-day edge.
  const transactions = [
    at(MEMBER_TREND_WEEK_MS - 1, 3), // a hair inside this week
    at(MEMBER_TREND_WEEK_MS + 1, 5), // a hair inside last week
    at(2 * MEMBER_TREND_WEEK_MS - 1, 11), // a hair inside last week, at its far edge
    at(2 * MEMBER_TREND_WEEK_MS + 1, 13), // a hair into the week before that
  ];
  const trend = buildMemberPointsTrend({ transactions, now: NOW });
  assert.equal(trend.series.length, MEMBER_TREND_WEEKS);
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 1], 3);
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 2], 5 + 11);
  assert.equal(trend.series[MEMBER_TREND_WEEKS - 3], 13);
  // Nothing was double-counted or lost on the way across the edges.
  assert.equal(
    trend.series.reduce((sum, value) => sum + value, 0),
    3 + 5 + 11 + 13,
  );
});

test('the last bucket equals the rolling-7-day chip for every shape, including a future-stamped row', () => {
  const shapes: Array<{ name: string; transactions: PointsTrendTransaction[] }> = [
    { name: 'empty', transactions: [] },
    { name: 'today only', transactions: [at(0, 9)] },
    { name: 'clock skew: stamped a minute ahead', transactions: [at(-60_000, 9), at(3 * DAY_MS, 1)] },
    { name: 'straddling the edge', transactions: [at(MEMBER_TREND_WEEK_MS, 4), at(MEMBER_TREND_WEEK_MS + 1, 4)] },
    { name: 'older than the window', transactions: [at(60 * DAY_MS, 500), at(DAY_MS, 2)] },
  ];
  assert.ok(shapes.length > 0, 'shapes must not be empty');
  for (const shape of shapes) {
    const trend = buildMemberPointsTrend({ transactions: shape.transactions, now: NOW });
    assert.equal(
      trend.series.length === 0 ? trend.thisWeek : trend.series[trend.series.length - 1],
      chipThisWeek(shape.transactions),
      `${shape.name}: the line must end on the number in the chip`,
    );
    assert.equal(trend.thisWeek, chipThisWeek(shape.transactions), shape.name);
  }
});

test('rows older than the window are ignored rather than folded into the first bucket', () => {
  const transactions = [at(MEMBER_TREND_WEEKS * MEMBER_TREND_WEEK_MS + 1, 999), at(DAY_MS, 6)];
  const trend = buildMemberPointsTrend({ transactions, now: NOW });
  assert.equal(trend.series[0], 0);
  assert.equal(
    trend.series.reduce((sum, value) => sum + value, 0),
    6,
  );
});

test('a truncated page that cannot prove the old weeks draws nothing, but still reports this week', () => {
  // Every row the caller got back is inside the last two weeks, and the page
  // was capped — so weeks 1..6 are unproven, not empty.
  const transactions = [at(DAY_MS, 10), at(8 * DAY_MS, 20)];
  const truncated = buildMemberPointsTrend({ transactions, now: NOW, truncated: true });
  assert.deepEqual(truncated.series, [], 'an unprovable shape must not be drawn');
  assert.equal(memberPointsSpark(truncated), undefined);
  assert.equal(truncated.thisWeek, 10, 'the newest rows are always present, so the chip survives');
  assert.equal(truncated.previousWeek, 20);

  // The same rows from an uncapped read are a complete, drawable picture.
  const complete = buildMemberPointsTrend({ transactions, now: NOW });
  assert.deepEqual(complete.series, [0, 0, 0, 0, 0, 0, 20, 10]);

  // A capped page that did reach back past the window start has nothing hidden
  // inside it, so it draws.
  const reachesBack = buildMemberPointsTrend({
    transactions: [...transactions, at(MEMBER_TREND_WEEKS * MEMBER_TREND_WEEK_MS, 1)],
    now: NOW,
    truncated: true,
  });
  assert.equal(reachesBack.series.length, MEMBER_TREND_WEEKS);
  assert.equal(reachesBack.series[0], 1);
});

test('the delta chip reports the change against last week, and claims no direction when flat', () => {
  const flat = buildMemberPointsTrend({ transactions: [at(DAY_MS, 30), at(8 * DAY_MS, 30)], now: NOW });
  const flatSpark = memberPointsSpark(flat);
  assert.ok(flatSpark);
  assert.equal(flatSpark.delta, undefined, 'an unchanged week must not render an arrow');
  assert.equal(flatSpark.direction, undefined);
  assert.equal(flatSpark.series?.length, MEMBER_TREND_WEEKS);

  const down = buildMemberPointsTrend({ transactions: [at(DAY_MS, 5), at(8 * DAY_MS, 30)], now: NOW });
  const downSpark = memberPointsSpark(down);
  assert.ok(downSpark);
  assert.equal(downSpark.delta, '25');
  assert.equal(downSpark.direction, 'down');
});

test('reconcilePointsLedger catches the counter drifting from the ledger', () => {
  const ledger = [{ points: 50 }, { points: 25 }, { points: 5 }];

  const clean = reconcilePointsLedger({ transactions: ledger, storedTotal: 80 });
  assert.equal(clean.ledgerTotal, 80);
  assert.equal(clean.drift, 0);
  assert.equal(clean.reconciled, true);

  // awardPoints inserts the transaction and increments the counter in two
  // un-transacted statements: a crash between them leaves the counter short.
  const short = reconcilePointsLedger({ transactions: ledger, storedTotal: 55 });
  assert.equal(short.drift, -25);
  assert.equal(short.reconciled, false);

  // mergeMembers repoints the loser's transactions onto the winner and leaves
  // the counter alone, which drifts the other way.
  const over = reconcilePointsLedger({ transactions: ledger, storedTotal: 130 });
  assert.equal(over.drift, 50);
  assert.equal(over.reconciled, false);

  assert.equal(reconcilePointsLedger({ transactions: [], storedTotal: 0 }).reconciled, true);
  assert.equal(reconcilePointsLedger({ transactions: [], storedTotal: 10 }).drift, 10);
});
