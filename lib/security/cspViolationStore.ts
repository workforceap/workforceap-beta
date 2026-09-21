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
import { CSP_VIOLATION_MAX_BUCKETS_PER_HOUR, type CspViolationCount } from './cspReport';
import {
  DAY_MS,
  advanceCspBucketEstimate,
  cspViolationBucketKey,
  bucketCspViolations,
  groupCspViolationBuckets,
  shouldRecountCspBuckets,
  sumCspViolationCounts,
  type CspBucketCountEstimate,
  type CspViolationBucketRow,
  type CspViolationBucketWrite,
  type CspViolationGroup,
} from './cspViolationBuckets';

/** Upper bound on bucket rows one viewer render reads (7 days × hourly × distinct keys). */
const VIEWER_MAX_BUCKETS = 5000;

export interface PersistCspViolationsResult {
  /** Distinct bucket keys written (0 when nothing was accepted or the write failed). */
  persisted: number;
  /** New keys dropped because the hour already holds CSP_VIOLATION_MAX_BUCKETS_PER_HOUR rows. */
  skipped: number;
  failed: boolean;
}

type BucketKey = Pick<CspViolationBucketWrite, 'hourBucket' | 'directive' | 'blockedHost' | 'documentPath' | 'disposition'>;

function keyOf(write: BucketKey): BucketKey {
  return {
    hourBucket: write.hourBucket,
    directive: write.directive,
    blockedHost: write.blockedHost,
    documentPath: write.documentPath,
    disposition: write.disposition,
  };
}

/**
 * Last observed distinct-row count for the current hour bucket, per process
 * (see `shouldRecountCspBuckets`). Null until the first batch after boot.
 */
let bucketCountEstimate: CspBucketCountEstimate | null = null;

/** Test seam: forget the cached count so a spec starts like a freshly booted process. */
export function resetCspBucketCountEstimateForTests(): void {
  bucketCountEstimate = null;
}

/**
 * Split a batch into the writes that may run and the new keys to drop so the
 * hour never holds more than CSP_VIOLATION_MAX_BUCKETS_PER_HOUR distinct rows.
 *
 * The distinct-row `count()` does not run per batch: the last count is cached
 * in module memory per hour bucket and advanced by every key a batch may have
 * created, and a real count runs again only when the bucket changed or the
 * estimate lands within CSP_BUCKET_CEILING_RECOUNT_MARGIN (100) rows of the
 * ceiling. Fast path (the normal case): the estimate has room for every key
 * in the batch, so nothing is read at all. Near the ceiling, the count is
 * fresh and one indexed read tells which keys already exist — those still
 * increment — and only the first `ceiling - distinct` new keys are created.
 *
 * Soft bound, not a quota: within one process the estimate is an upper bound,
 * so this process alone never creates a row past the ceiling. Rows other
 * instances insert are invisible until this instance's next count, so with K
 * concurrent instances an hour can grow to at most K × (ceiling − margin) +
 * one batch (20 keys) before every instance has recounted and stopped; the
 * count and the insert were never one atomic step either (the old bound was
 * one batch per concurrent request).
 */
async function applyBucketCeiling(writes: CspViolationBucketWrite[]): Promise<{ allowed: CspViolationBucketWrite[]; skipped: number }> {
  const hourBucket = writes[0].hourBucket;
  let estimate = bucketCountEstimate;
  if (!estimate || shouldRecountCspBuckets(estimate, hourBucket, writes.length)) {
    const distinct = await prisma.cspViolationBucket.count({ where: { hourBucket } });
    estimate = { hourBucketMs: hourBucket.getTime(), distinct };
  }
  const distinct = estimate.distinct;
  if (distinct + writes.length <= CSP_VIOLATION_MAX_BUCKETS_PER_HOUR) {
    bucketCountEstimate = advanceCspBucketEstimate(estimate, writes.length);
    return { allowed: writes, skipped: 0 };
  }

  const existing = await prisma.cspViolationBucket.findMany({
    where: { hourBucket, OR: writes.map((write) => keyOf(write)) },
    select: { hourBucket: true, directive: true, blockedHost: true, documentPath: true, disposition: true },
  });
  const existingKeys = new Set(existing.map((row) => cspViolationBucketKey(row)));

  let room = Math.max(0, CSP_VIOLATION_MAX_BUCKETS_PER_HOUR - distinct);
  const allowed: CspViolationBucketWrite[] = [];
  let skipped = 0;
  let created = 0;
  for (const write of writes) {
    if (existingKeys.has(cspViolationBucketKey(write))) {
      allowed.push(write);
    } else if (room > 0) {
      room -= 1;
      created += 1;
      allowed.push(write);
    } else {
      skipped += 1;
    }
  }
  bucketCountEstimate = advanceCspBucketEstimate(estimate, created);
  return { allowed, skipped };
}

/**
 * Increment the hourly bucket for every counted violation in a batch.
 * Only the redacted summary fields are written — the caller has already
 * passed the rows through `countCspViolations`, so no raw URL, IP, user agent
 * or report body can reach this function — and every column is either an
 * allowlisted value or a shape-checked host / capped route path
 * (lib/security/cspReport.ts). The per-hour ceiling on distinct rows is the
 * last line against a client minting keys on purpose.
 */
export async function persistCspViolationCounts(
  rows: readonly CspViolationCount[],
  seenAt: Date = new Date(),
): Promise<PersistCspViolationsResult> {
  const writes = bucketCspViolations(rows, seenAt);
  if (writes.length === 0) return { persisted: 0, skipped: 0, failed: false };

  try {
    const { allowed, skipped } = await applyBucketCeiling(writes);
    if (skipped > 0) {
      logger.warn('csp.violation.bucket_ceiling', {
        hourBucket: writes[0].hourBucket.toISOString(),
        ceiling: CSP_VIOLATION_MAX_BUCKETS_PER_HOUR,
        skipped,
        kept: allowed.length,
      });
    }
    if (allowed.length > 0) {
      await prisma.$transaction(
        allowed.map((write) => {
          const key = keyOf(write);
          return prisma.cspViolationBucket.upsert({
            where: { bucketKey: key },
            create: { ...key, count: write.count, firstSeenAt: write.seenAt, lastSeenAt: write.seenAt },
            update: { count: { increment: write.count }, lastSeenAt: write.seenAt },
            select: { id: true },
          });
        }),
      );
    }
    return { persisted: allowed.length, skipped, failed: false };
  } catch (err) {
    logger.error('csp.violation.persist_failed', {
      buckets: writes.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { persisted: 0, skipped: 0, failed: true };
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
