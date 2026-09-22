/**
 * Does the Points tile's number agree with the ledger the trend line is drawn from?
 *
 * The member home prints `member_points.total_points` and, since the weekly
 * trend line shipped, draws the line underneath it from `points_transactions`.
 * Those are two different writers:
 *
 *  - `awardPoints` (`lib/member/points.ts`) inserts the transaction and *then*
 *    increments the counter, in two statements with no transaction around
 *    them. A crash between them leaves the counter short.
 *  - `mergeMembers` (`lib/admin/memberMerge.ts`) repoints every one of the
 *    secondary member's transactions onto the primary, but only moves the
 *    `member_points` row when the primary has none — so a merge into a member
 *    who already had points leaves the counter behind the ledger, permanently.
 *  - `referrals.ts` does both writes inside one serializable transaction and
 *    cannot drift on its own.
 *
 * A trend that disagrees with the number above it is worse than no trend, so
 * this reports the disagreement before anyone trusts either. It is **read
 * only** — it writes nothing and repairs nothing. Deciding whether the ledger
 * or the counter is the truth is a product call, not this script's.
 *
 * Usage:
 *   npm run audit:points-ledger
 *   npm run audit:points-ledger -- --limit 50   # only the worst 50 drifts
 */
import { PrismaClient } from '@prisma/client';

import { reconcilePointsLedger } from '../lib/member/memberPointsTrend';

const prisma = new PrismaClient();

function parseLimit(): number {
  const index = process.argv.indexOf('--limit');
  if (index === -1) return 25;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 25;
}

async function main() {
  const limit = parseLimit();

  // Soft-deleted members are merged-away accounts. They keep their counter and
  // any ledger rows that could not move, so counting them would report a
  // spurious drifted pair for every merge — noise about an account nobody can
  // see, on top of the real finding for the surviving member.
  const liveUsers = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  const liveUserIds = liveUsers.map((user) => user.id);

  const [ledgerRows, counters] = await Promise.all([
    prisma.pointsTransaction.groupBy({
      by: ['userId'],
      where: { userId: { in: liveUserIds } },
      _sum: { points: true },
      _count: { _all: true },
    }),
    prisma.memberPoints.findMany({
      where: { userId: { in: liveUserIds } },
      select: { userId: true, totalPoints: true },
    }),
  ]);

  const ledgerByUser = new Map(
    ledgerRows.map((row) => [row.userId, { total: row._sum.points ?? 0, rows: row._count._all }]),
  );
  const counterByUser = new Map(counters.map((row) => [row.userId, row.totalPoints]));
  const userIds = new Set([...ledgerByUser.keys(), ...counterByUser.keys()]);

  const drifted: Array<{ userId: string; ledgerTotal: number; storedTotal: number; drift: number; rows: number }> = [];
  let reconciled = 0;

  for (const userId of userIds) {
    const ledger = ledgerByUser.get(userId);
    const storedTotal = counterByUser.get(userId) ?? 0;
    // groupBy already summed the ledger; reconcile against that one figure so
    // this uses the same comparison the unit tests pin.
    const result = reconcilePointsLedger({
      transactions: ledger ? [{ points: ledger.total }] : [],
      storedTotal,
    });
    if (result.reconciled) {
      reconciled += 1;
      continue;
    }
    drifted.push({
      userId,
      ledgerTotal: result.ledgerTotal,
      storedTotal: result.storedTotal,
      drift: result.drift,
      rows: ledger?.rows ?? 0,
    });
  }

  drifted.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  console.log('points ledger vs member_points.total_points (live members only)');
  console.log(`  members with points          ${userIds.size}`);
  console.log(`  reconciled exactly           ${reconciled}`);
  console.log(`  drifted                      ${drifted.length}`);
  console.log(
    `  counter ahead of the ledger  ${drifted.filter((row) => row.drift > 0).length} (points added without a transaction row, or ledger rows deleted)`,
  );
  console.log(
    `  counter behind the ledger    ${drifted.filter((row) => row.drift < 0).length} (a merge moved the ledger and left the counter, or an increment never landed)`,
  );
  console.log(
    `  ledger rows with no counter  ${[...ledgerByUser.keys()].filter((id) => !counterByUser.has(id)).length}`,
  );

  if (drifted.length > 0) {
    console.log(`\nworst ${Math.min(limit, drifted.length)} by absolute drift:`);
    for (const row of drifted.slice(0, limit)) {
      const sign = row.drift > 0 ? '+' : '';
      console.log(
        `  ${row.userId}  ledger ${row.ledgerTotal} (${row.rows} rows)  counter ${row.storedTotal}  drift ${sign}${row.drift}`,
      );
    }
    console.log(
      '\nThe Points tile prints the counter; the sparkline under it is bucketed from the ledger.',
    );
    console.log(
      'For these members the last bar and the number above it describe different histories.',
    );
  }

  process.exitCode = 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
