/**
 * Email failure evidence snapshot.
 *
 * `workflow_diagnostics` is the only record of the 818 outbound emails that
 * failed in 2026, and its retention purge (WORKFLOW_DIAGNOSTIC_RETENTION_DAYS,
 * 60 days since WAP-17) deletes more of it every
 * day. `email_failure_snapshots` keeps a verbatim copy of every `email_send`
 * failure row for a year. This module holds the pure mapping from a
 * diagnostic row to a snapshot row so the copy script and its tests share
 * one definition; the script (`scripts/snapshot-email-failures.ts`) does the
 * I/O.
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
