/**
 * Prisma I/O for the aggregated CSP violation store (WAP-36 phase 2 prep).
 *
 * Writes come from `POST /api/csp-report`, which browsers call without a
 * session, so nothing here is tenant- or user-scoped: `csp_violation_buckets`
 * is platform-wide (no organization column — see the migration comment) and is
 * not in the tenant audit's scoped-model list. Reads happen only in the
 * super-admin viewer.
 *
 * Pool discipline (WAP-17): one `$transaction` per accepted batch carrying one
 * upsert per distinct bucket key, never one round-trip per report. Failures
 * are logged and swallowed — a database hiccup must never turn the beacon sink
 * into a 500, and the `csp.violation` log line the route already emits keeps
 * the evidence.
 */
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import type { CspViolationCount } from './cspReport';
import {
  DAY_MS,
  bucketCspViolations,
  groupCspViolationBuckets,
  sumCspViolationCounts,
  type CspViolationBucketRow,
  type CspViolationGroup,
} from './cspViolationBuckets';

/** Upper bound on bucket rows one viewer render reads (7 days × hourly × distinct keys). */
const VIEWER_MAX_BUCKETS = 5000;

export interface PersistCspViolationsResult {
  /** Distinct bucket keys written (0 when nothing was accepted or the write failed). */
  persisted: number;
  failed: boolean;
}

/**
 * Increment the hourly bucket for every counted violation in a batch.
 * Only the redacted summary fields are written — the caller has already
 * passed the rows through `countCspViolations`, so no raw URL, IP, user agent
 * or report body can reach this function.
 */
export async function persistCspViolationCounts(
  rows: readonly CspViolationCount[],
  seenAt: Date = new Date(),
): Promise<PersistCspViolationsResult> {
  const writes = bucketCspViolations(rows, seenAt);
  if (writes.length === 0) return { persisted: 0, failed: false };

  try {
    await prisma.$transaction(
      writes.map((write) => {
        const key = {
          hourBucket: write.hourBucket,
          directive: write.directive,
          blockedHost: write.blockedHost,
          documentPath: write.documentPath,
          disposition: write.disposition,
        };
        return prisma.cspViolationBucket.upsert({
          where: { bucketKey: key },
          create: { ...key, count: write.count, firstSeenAt: write.seenAt, lastSeenAt: write.seenAt },
          update: { count: { increment: write.count }, lastSeenAt: write.seenAt },
          select: { id: true },
        });
      }),
    );
    return { persisted: writes.length, failed: false };
  } catch (err) {
    logger.error('csp.violation.persist_failed', {
      buckets: writes.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { persisted: 0, failed: true };
  }
}

export interface CspViolationOverview {
  /** Reports whose hour bucket started within the last 24 hours. */
  total24h: number;
  /** Reports whose hour bucket started within the last 7 days. */
  total7d: number;
  /** Reports in the 7-day window with `disposition = 'enforce'` (should be 0 while Report-Only). */
  enforced7d: number;
  /** Number of stored hourly bucket rows the overview was built from. */
  bucketCount: number;
  groups: CspViolationGroup[];
  since24h: Date;
  since7d: Date;
  generatedAt: Date;
}

/**
 * Everything the viewer shows, from ONE indexed range read on `hour_bucket`.
 * Grouping and totals are computed in memory (`lib/security/cspViolationBuckets.ts`).
 */
export async function loadCspViolationOverview(now: Date = new Date()): Promise<CspViolationOverview> {
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since24h = new Date(now.getTime() - DAY_MS);

  const rows: CspViolationBucketRow[] = await prisma.cspViolationBucket.findMany({
    where: { hourBucket: { gte: since7d } },
    orderBy: [{ hourBucket: 'desc' }, { count: 'desc' }],
    take: VIEWER_MAX_BUCKETS,
    select: {
      hourBucket: true,
      directive: true,
      blockedHost: true,
      documentPath: true,
      disposition: true,
      count: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });

  return {
    total24h: sumCspViolationCounts(rows, since24h),
    total7d: sumCspViolationCounts(rows),
    enforced7d: sumCspViolationCounts(rows.filter((row) => row.disposition === 'enforce')),
    bucketCount: rows.length,
    groups: groupCspViolationBuckets(rows),
    since24h,
    since7d,
    generatedAt: now,
  };
}
