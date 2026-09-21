/**
 * Email failure evidence snapshot.
 *
 * `workflow_diagnostics` is the only record of the 818 outbound emails that
 * failed in 2026, and its retention purge (WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
 * default 90; WAP-17 lowers it to 60 only after this snapshot has run) deletes more of it every
 * day. `email_failure_snapshots` keeps a verbatim copy of every `email_send`
 * failure row for a year. This module holds the pure mapping from a
 * diagnostic row to a snapshot row *and* the two copy paths built on it, so
 * there is exactly one definition of what the evidence is:
 *
 * - `snapshotEmailFailuresByDiagnosticId` — used by the retention cleanup
 *   (`lib/retention/cleanup.ts`) inside the same transaction as the delete it
 *   guards, so no row is purged that was not copied first;
 * - `snapshotEmailFailures` — the paging catch-up used by
 *   `scripts/snapshot-email-failures.ts` for rows that have not reached the
 *   retention cutoff yet.
 *
 * The metadata JSON is copied as written. Historical rows carry the raw
 * recipient and subject (`{ to, subject }`); the snapshot is an evidence copy
 * and does not rewrite them. New failure records (see `failureRecord.ts`)
 * store a recipient hash and domain instead of the address.
 */
import {
  EMAIL_SEND_WORKFLOW,
  parseEmailFailureMetadata,
  recipientDomain,
} from '@/lib/email/failureRecord';

/** `WorkflowDiagnostic.status` values the send path and its callers have written for a failed send. */
export const EMAIL_FAILURE_STATUSES: readonly string[] = Object.freeze(['error', 'errored', 'failed']);

export type EmailFailureDiagnosticSource = {
  id: string;
  workflow: string;
  status: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  provider: string | null;
  method: string | null;
  fallbackPath: string | null;
  failureReason: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type EmailFailureSnapshotRow = {
  sourceDiagnosticId: string;
  workflow: string;
  status: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  provider: string | null;
  method: string | null;
  fallbackPath: string | null;
  failureReason: string | null;
  metadata: unknown;
  templateKey: string | null;
  errorClass: string;
  retryable: boolean;
  recipientHash: string | null;
  recipientDomain: string | null;
  diagnosticCreatedAt: Date;
  snapshotRun: string;
};

/** True for a diagnostic row the snapshot must keep: an `email_send` row in a failure status. */
export function isEmailFailureDiagnostic(row: Pick<EmailFailureDiagnosticSource, 'workflow' | 'status'>): boolean {
  return row.workflow === EMAIL_SEND_WORKFLOW && EMAIL_FAILURE_STATUSES.includes(row.status);
}

/**
 * Map one diagnostic row to its snapshot row. Verbatim copy of every column
 * plus derived fields read defensively from the metadata: legacy rows with
 * only `{ to, subject }` still yield a hash and domain from `to`.
 */
export function toEmailFailureSnapshotRow(
  row: EmailFailureDiagnosticSource,
  snapshotRun: string,
): EmailFailureSnapshotRow {
  const failure = parseEmailFailureMetadata(row.metadata);
  const templateKey = failure.template ?? row.entityId ?? null;
  return {
    sourceDiagnosticId: row.id,
    workflow: row.workflow,
    status: row.status,
    actorUserId: row.actorUserId,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    provider: row.provider,
    method: row.method,
    fallbackPath: row.fallbackPath,
    failureReason: row.failureReason,
    metadata: row.metadata ?? null,
    templateKey,
    errorClass: failure.errorClass,
    retryable: failure.retryable,
    recipientHash: failure.recipientHash,
    recipientDomain: failure.recipientDomain ?? recipientDomain(failure.to),
    diagnosticCreatedAt: row.createdAt,
    snapshotRun,
  };
}

/** Stable run label so a re-run can be told apart in the table: `snapshot-<ISO timestamp>`. */
export function snapshotRunLabel(now: Date = new Date()): string {
  return `snapshot-${now.toISOString()}`;
}

/**
 * Columns copied out of `workflow_diagnostics`. Exported so the retention
 * cleanup and the catch-up script select exactly the same shape and cannot
 * drift into copying different evidence.
 */
export const EMAIL_FAILURE_DIAGNOSTIC_SELECT = Object.freeze({
  id: true,
  workflow: true,
  status: true,
  actorUserId: true,
  entityType: true,
  entityId: true,
  summary: true,
  provider: true,
  method: true,
  fallbackPath: true,
  failureReason: true,
  metadata: true,
  createdAt: true,
});

/**
 * `where` matching every diagnostic row the snapshot must keep — an
 * `email_send` row in one of the failure statuses. One definition so the
 * cron and the script can never disagree about what counts as evidence.
 */
export function emailFailureDiagnosticWhere(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workflow: EMAIL_SEND_WORKFLOW,
    status: { in: [...EMAIL_FAILURE_STATUSES] },
    ...extra,
  };
}

/**
 * `createMany` payload. Prisma wants an absent optional Json column to be
 * `undefined`, not `null`, so the key is dropped rather than nulled.
 */
export type EmailFailureSnapshotCreateData = Omit<EmailFailureSnapshotRow, 'metadata'> & { metadata?: object };

export function toEmailFailureSnapshotCreateData(
  rows: readonly EmailFailureSnapshotRow[],
): EmailFailureSnapshotCreateData[] {
  return rows.map((row) => {
    const { metadata, ...rest } = row;
    return metadata === null || metadata === undefined ? rest : { ...rest, metadata: metadata as object };
  });
}

/**
 * The slice of a Prisma client (or of an interactive transaction client) the
 * snapshot needs. Structural so the cleanup path can hand in its `tx` and the
 * tests can hand in a fake without a database.
 */
export type EmailFailureSnapshotClient = {
  workflowDiagnostic: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: typeof EMAIL_FAILURE_DIAGNOSTIC_SELECT;
      orderBy?: Record<string, unknown>;
      take?: number;
      cursor?: { id: string };
      skip?: number;
    }) => Promise<EmailFailureDiagnosticSource[]>;
  };
  emailFailureSnapshot: {
    createMany: (args: {
      data: EmailFailureSnapshotCreateData[];
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
};

export type EmailFailureSnapshotWriteResult = {
  /** Source rows that matched the failure predicate. */
  scanned: number;
  /** Rows actually inserted; re-runs skip the ones already keyed by `source_diagnostic_id`. */
  inserted: number;
};

/**
 * Copy into `email_failure_snapshots` every `email_send` failure row among
 * `diagnosticIds`.
 *
 * This is the call the retention cleanup makes for the batch of
 * `workflow_diagnostics` ids it is about to delete, inside the same
 * transaction as that delete: the copy either commits with the delete or is
 * rolled back with it, so "snapshotted half, deleted all" is not reachable.
 *
 * Idempotent: `email_failure_snapshots.source_diagnostic_id` is unique and the
 * insert is `skipDuplicates`, so a retry, a re-run, or an overlapping cleanup
 * adds nothing and raises nothing.
 *
 * Bounded: reads only the ids it was handed, so the work per batch is capped
 * by the caller's batch size.
 */
export async function snapshotEmailFailuresByDiagnosticId(
  client: EmailFailureSnapshotClient,
  diagnosticIds: readonly string[],
  snapshotRun: string,
): Promise<EmailFailureSnapshotWriteResult> {
  if (diagnosticIds.length === 0) return { scanned: 0, inserted: 0 };

  const rows = await client.workflowDiagnostic.findMany({
    where: emailFailureDiagnosticWhere({ id: { in: [...diagnosticIds] } }),
    select: EMAIL_FAILURE_DIAGNOSTIC_SELECT,
    take: diagnosticIds.length,
  });
  if (rows.length === 0) return { scanned: 0, inserted: 0 };

  const mapped = rows.map((row) => toEmailFailureSnapshotRow(row, snapshotRun));
  const result = await client.emailFailureSnapshot.createMany({
    data: toEmailFailureSnapshotCreateData(mapped),
    skipDuplicates: true,
  });
  return { scanned: rows.length, inserted: result.count ?? 0 };
}

export type SnapshotEmailFailuresOptions = {
  /** Rows per page (1..2000, default 500). */
  batchSize?: number;
  /** Only rows created on/after this instant. */
  since?: Date | null;
  /** Read and classify, write nothing. */
  dryRun?: boolean;
  /** Called with each mapped page, for the script's reporting. */
  onBatch?: (rows: EmailFailureSnapshotRow[]) => void;
};

/**
 * Page over every `email_send` failure row and copy it, regardless of age.
 *
 * The retention cleanup only snapshots the rows it is about to delete, so this
 * remains the operator path for copying rows that have *not* yet reached the
 * cutoff — a catch-up before the window is shortened, or an evidence pull now.
 * Same predicate, same mapping and same idempotent insert as the cron.
 */
export async function snapshotEmailFailures(
  client: EmailFailureSnapshotClient,
  snapshotRun: string,
  options: SnapshotEmailFailuresOptions = {},
): Promise<EmailFailureSnapshotWriteResult> {
  const batchSize = Math.max(1, Math.min(2000, Math.trunc(options.batchSize ?? 500) || 500));
  const where = emailFailureDiagnosticWhere(options.since ? { createdAt: { gte: options.since } } : {});

  let scanned = 0;
  let inserted = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await client.workflowDiagnostic.findMany({
      where,
      select: EMAIL_FAILURE_DIAGNOSTIC_SELECT,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const mapped = rows.map((row) => toEmailFailureSnapshotRow(row, snapshotRun));
    options.onBatch?.(mapped);

    if (!options.dryRun) {
      const result = await client.emailFailureSnapshot.createMany({
        data: toEmailFailureSnapshotCreateData(mapped),
        skipDuplicates: true,
      });
      inserted += result.count ?? 0;
    }

    if (rows.length < batchSize) break;
  }

  return { scanned, inserted };
}
