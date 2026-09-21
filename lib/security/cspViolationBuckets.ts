/**
 * Pure helpers for the aggregated CSP violation store (WAP-36 phase 2 prep).
 *
 * The sink (`app/api/csp-report/route.ts`) turns each accepted batch into
 * hourly bucket writes with `bucketCspViolations`; the super-admin viewer
 * (`app/admin/csp-report/page.tsx`) folds the stored buckets back into
 * per-source groups with `groupCspViolationBuckets`. No I/O here — the Prisma
 * calls live in `./cspViolationStore.ts` so this file runs under node:test.
 *
 * Privacy contract: every value that reaches these helpers is already the
 * redacted summary from `./cspReport.ts` (host or CSP keyword, route path with
 * dynamic segments collapsed to `:id`, directive, disposition). Nothing here
 * widens it.
 */
import type { CspViolationCount, CspViolationSummary } from './cspReport';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Default number of document paths shown per (directive, blockedHost) group in the viewer. */
export const CSP_VIOLATION_PATH_SAMPLE_SIZE = 3;

/** Truncate a timestamp to the start of its UTC hour. Never mutates the input. */
export function truncateToHour(at: Date): Date {
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}

/** The unique key of one `csp_violation_buckets` row. */
export interface CspViolationBucketKey extends CspViolationSummary {
  hourBucket: Date;
}

/** One upsert the sink issues: the key, how many reports to add, and when they were seen. */
export interface CspViolationBucketWrite extends CspViolationBucketKey {
  count: number;
  seenAt: Date;
}

export function cspViolationBucketKey(key: CspViolationBucketKey): string {
  return [key.hourBucket.toISOString(), key.directive, key.blockedHost, key.documentPath, key.disposition].join('|');
}

/**
 * Collapse a batch of counted violations into one write per distinct bucket
 * key. All reports in a batch land in the hour of `seenAt`, so the batch's
 * (directive, blockedHost, documentPath, disposition) rows map 1:1 onto
 * writes; the dedupe is kept so a caller that concatenates batches still gets
 * exactly one upsert per key.
 */
export function bucketCspViolations(rows: readonly CspViolationCount[], seenAt: Date): CspViolationBucketWrite[] {
  const hourBucket = truncateToHour(seenAt);
  const writes = new Map<string, CspViolationBucketWrite>();
  for (const row of rows) {
    if (!Number.isFinite(row.count) || row.count <= 0) continue;
    const key: CspViolationBucketKey = {
      hourBucket,
      directive: row.directive,
      blockedHost: row.blockedHost,
      documentPath: row.documentPath,
      disposition: row.disposition,
    };
    const id = cspViolationBucketKey(key);
    const existing = writes.get(id);
    if (existing) existing.count += row.count;
    else writes.set(id, { ...key, count: row.count, seenAt });
  }
  return Array.from(writes.values());
}

/** A stored bucket row as the viewer reads it. */
export interface CspViolationBucketRow {
  hourBucket: Date;
  directive: string;
  blockedHost: string | null;
  documentPath: string;
  disposition: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** One viewer row: a (directive, blocked host) source across every hour and page. */
export interface CspViolationGroup {
  directive: string;
  blockedHost: string;
  count: number;
  /** Up to `sampleSize` document paths, most-reported first. */
  documentPaths: string[];
  /** Total number of distinct document paths (so the viewer can say "+N more"). */
  documentPathCount: number;
  /** Distinct dispositions seen, `enforce` first when present. */
  dispositions: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** Sum of `count` over rows whose hour bucket starts at or after `since`. */
export function sumCspViolationCounts(rows: readonly CspViolationBucketRow[], since?: Date): number {
  let total = 0;
  for (const row of rows) {
    if (since && row.hourBucket.getTime() < since.getTime()) continue;
    total += row.count;
  }
  return total;
}

/**
 * Group stored buckets by (directive, blockedHost), most reports first, with a
 * bounded sample of document paths per group. Ties break on directive then
 * host so the order is stable across renders.
 */
export function groupCspViolationBuckets(
  rows: readonly CspViolationBucketRow[],
  sampleSize: number = CSP_VIOLATION_PATH_SAMPLE_SIZE,
): CspViolationGroup[] {
  type Acc = {
    directive: string;
    blockedHost: string;
    count: number;
    paths: Map<string, number>;
    dispositions: Set<string>;
    firstSeenAt: Date;
    lastSeenAt: Date;
  };
  const groups = new Map<string, Acc>();
  for (const row of rows) {
    const blockedHost = row.blockedHost ?? 'unknown';
    const id = `${row.directive}|${blockedHost}`;
    let acc = groups.get(id);
    if (!acc) {
      acc = {
        directive: row.directive,
        blockedHost,
        count: 0,
        paths: new Map(),
        dispositions: new Set(),
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      };
      groups.set(id, acc);
    }
    acc.count += row.count;
    acc.paths.set(row.documentPath, (acc.paths.get(row.documentPath) ?? 0) + row.count);
    acc.dispositions.add(row.disposition);
    if (row.firstSeenAt.getTime() < acc.firstSeenAt.getTime()) acc.firstSeenAt = row.firstSeenAt;
    if (row.lastSeenAt.getTime() > acc.lastSeenAt.getTime()) acc.lastSeenAt = row.lastSeenAt;
  }

  const byCountThenName = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const dispositionOrder = (value: string) => (value === 'enforce' ? 0 : value === 'report' ? 1 : 2);

  return Array.from(groups.values())
    .map((acc) => {
      const paths = Array.from(acc.paths.entries()).sort(byCountThenName);
      return {
        directive: acc.directive,
        blockedHost: acc.blockedHost,
        count: acc.count,
        documentPaths: paths.slice(0, Math.max(0, sampleSize)).map(([path]) => path),
        documentPathCount: paths.length,
        dispositions: Array.from(acc.dispositions).sort((a, b) => dispositionOrder(a) - dispositionOrder(b) || a.localeCompare(b)),
        firstSeenAt: acc.firstSeenAt,
        lastSeenAt: acc.lastSeenAt,
      };
    })
    .sort((a, b) => b.count - a.count || a.directive.localeCompare(b.directive) || a.blockedHost.localeCompare(b.blockedHost));
}
