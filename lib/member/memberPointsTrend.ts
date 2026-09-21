/**
 * Weekly points history for the member home "Points" stat tile.
 *
 * The tile's number is `member_points.total_points`; the line under it is
 * **points earned per week**, not the running total — a cumulative total only
 * rises, so its line is a monotone ramp that says nothing about momentum.
 *
 * ## One definition of "this week"
 *
 * `/dashboard` already prints a "+N this week" chip beside these tiles, and
 * that chip is a **rolling 7 days** (`Date.now() - WEEK_MS`), not an ISO week.
 * The buckets here are therefore rolling 7-day windows ending *now*, so the
 * last point of the line is exactly the number in the chip. There is no second
 * definition of "this week" on the screen: `loadMemberDashboardHome` renders
 * the chip from {@link MemberPointsTrend.thisWeek} returned here, so the two
 * cannot drift apart by construction.
 *
 * A week the member earned nothing in is a `0`, never a missing point — a gap
 * that is silently dropped makes the line lie about the shape.
 *
 * Pure: no Prisma, no clock of its own (callers pass `now`). The rows come
 * from the `points_transactions` read the loader already issues, so the series
 * costs no extra database round trip.
 */

/** Rolling week length used by every "this week" number on the member home. */
export const MEMBER_TREND_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Buckets drawn in the tile's sparkline (8 weeks ≈ two months of momentum). */
export const MEMBER_TREND_WEEKS = 8;

export type PointsTrendTransaction = {
  points: number;
  createdAt: Date;
};

/** Structural twin of the kit's `StatSpark` (kept here so `lib` never imports a component). */
export type MemberStatSpark = {
  series?: number[];
  delta?: string;
  direction?: 'up' | 'down';
};

export type MemberPointsTrend = {
  /**
   * Points earned in each rolling 7-day window, oldest first, exactly
   * {@link MEMBER_TREND_WEEKS} long — or `[]` when the supplied rows cannot
   * cover the window honestly (see `truncated`).
   */
  series: number[];
  /** Points earned in the last rolling 7 days. Same window as the chip. */
  thisWeek: number;
  /** Points earned in the 7 days before that, for the delta chip. */
  previousWeek: number;
};

type TrendWindow = { start: number; end: number };

/**
 * The rolling windows the series buckets into, oldest first.
 *
 * Half-open `[start, end)` so no transaction lands in two buckets, with two
 * deliberate edges:
 *  - the newest window has **no upper bound**, so a row stamped a moment in the
 *    future (clock skew between app servers) still counts, exactly as the
 *    existing chip's bare `createdAt >= weekAgo` filter counts it;
 *  - `start` is inclusive, so a row at exactly `now - 7 days` is "this week"
 *    here and in the chip, rather than falling between them.
 */
export function memberTrendWindows(now: number, weeks: number = MEMBER_TREND_WEEKS): TrendWindow[] {
  return Array.from({ length: weeks }, (_, index) => ({
    start: now - (weeks - index) * MEMBER_TREND_WEEK_MS,
    end:
      index === weeks - 1
        ? Number.POSITIVE_INFINITY
        : now - (weeks - 1 - index) * MEMBER_TREND_WEEK_MS,
  }));
}

/**
 * Bucket a member's points transactions into weekly earned totals.
 *
 * `truncated` says the caller handed over a capped page of rows (the loader
 * reads the newest N). Rows are newest-first there, so a cap can only hide
 * *older* rows: when one may be hidden inside the window, the series is
 * dropped entirely rather than drawn with an under-reported early bucket. A
 * missing line is honest; a wrong shape is not. `thisWeek` / `previousWeek`
 * survive truncation because the newest rows are always present.
 */
export function buildMemberPointsTrend(args: {
  transactions: ReadonlyArray<PointsTrendTransaction>;
  /** Epoch ms the windows end at. Defaults to the current clock. */
  now?: number;
  weeks?: number;
  /** True when `transactions` is a capped page that may omit older rows. */
  truncated?: boolean;
}): MemberPointsTrend {
  const now = args.now ?? Date.now();
  const weeks = args.weeks ?? MEMBER_TREND_WEEKS;
  const windows = memberTrendWindows(now, weeks);
  const series = new Array<number>(weeks).fill(0);

  let oldestInWindow = Number.POSITIVE_INFINITY;
  for (const tx of args.transactions) {
    const at = tx.createdAt.getTime();
    if (Number.isNaN(at)) continue;
    const index = windows.findIndex((window) => at >= window.start && at < window.end);
    if (index === -1) continue;
    series[index] += tx.points;
    if (at < oldestInWindow) oldestInWindow = at;
  }

  const thisWeek = series[weeks - 1] ?? 0;
  const previousWeek = weeks > 1 ? (series[weeks - 2] ?? 0) : 0;

  // A capped page that never reached back past the first window's start may be
  // missing older rows, so every bucket before the oldest row we did see is
  // unproven. Report no series at all rather than a shape we cannot stand behind.
  const windowStart = windows[0]?.start ?? now;
  const incomplete = Boolean(args.truncated) && oldestInWindow > windowStart;

  return { series: incomplete ? [] : series, thisWeek, previousWeek };
}

/**
 * The tile's spark props, or `undefined` when there is nothing honest to draw.
 *
 * Nothing is drawn when the window is unproven, when the kit's own
 * `series.length > 1` gate would hide it anyway, or when every bucket is `0`
 * — a flat rule along the axis reads as a real trend sitting at zero, which is
 * worse than an empty slot.
 *
 * The delta chip is the change against the previous week, omitted when the two
 * weeks are equal so the chip's arrow never claims a direction the data has not
 * moved in.
 */
export function memberPointsSpark(trend: MemberPointsTrend): MemberStatSpark | undefined {
  const drawable = trend.series.length > 1 && trend.series.some((value) => value !== 0);
  if (!drawable) return undefined;

  const change = trend.thisWeek - trend.previousWeek;
  if (change === 0) return { series: trend.series };
  return {
    series: trend.series,
    delta: String(Math.abs(change)),
    direction: change > 0 ? 'up' : 'down',
  };
}

export type PointsLedgerReconciliation = {
  /** Sum of every `points_transactions.points` row for the member. */
  ledgerTotal: number;
  /** The `member_points.total_points` counter the tile prints. */
  storedTotal: number;
  /** `storedTotal - ledgerTotal`. Positive means the counter over-reports. */
  drift: number;
  reconciled: boolean;
};

/**
 * Compare the append-only ledger against the stored counter the tile prints.
 *
 * These are two different writers: `awardPoints` inserts a transaction and
 * then `increment`s `member_points.total_points` in a *separate*,
 * un-transacted statement, and `mergeMembers` repoints every transaction row
 * onto the primary member while leaving the counter alone. So they can drift,
 * and a trend drawn from the ledger under a number taken from the counter can
 * disagree with it.
 *
 * `transactions` must be the member's **complete** ledger — pass a capped page
 * and this reports a drift that is only the cap. `scripts/audit-points-ledger-drift.ts`
 * is the caller that reads the whole thing.
 */
export function reconcilePointsLedger(args: {
  transactions: ReadonlyArray<{ points: number }>;
  storedTotal: number;
}): PointsLedgerReconciliation {
  const ledgerTotal = args.transactions.reduce((sum, tx) => sum + tx.points, 0);
  const drift = args.storedTotal - ledgerTotal;
  return { ledgerTotal, storedTotal: args.storedTotal, drift, reconciled: drift === 0 };
}
