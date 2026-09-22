import { prisma } from '@/lib/db/prisma';
import {
  snapshotEmailFailuresByDiagnosticId,
  snapshotRunLabel,
  type EmailFailureSnapshotClient,
} from '@/lib/email/failureSnapshot';
import { anonymizeMember } from '@/lib/member/anonymizeMember';
import {
  RETENTION_TABLES,
  RETENTION_BATCH_SIZE,
  DELETED_ACCOUNT_RETENTION_DAYS,
  CRITICAL_AUDIT_ACTION_PREFIXES,
  RETENTION_AUDIT_DAYS as CRITICAL_AUDIT_RETENTION_DAYS,
  UNMATCHED_XAPI_EVENT_RETENTION_DAYS,
  UNMATCHED_XAPI_EVENT_RETENTION_LABEL,
  getCutoffDate,
  type RetentionTableConfig,
} from './config';

export type CleanupResult = {
  model: string;
  deleted: number;
  batchCount: number;
  /**
   * Rows copied into `email_failure_snapshots` before this model's delete ran.
   * Present only for `workflowDiagnostic` (see SNAPSHOT_BEFORE_DELETE_MODEL).
   */
  snapshotted?: number;
  /**
   * Rows that matched the email-failure predicate in the batches this model
   * purged, whether or not the copy inserted them. Reported next to
   * `snapshotted` so `snapshotted: 0` can be told apart: equal counts mean
   * "already copied", a zero `snapshotScanned` means "nothing matched".
   */
  snapshotScanned?: number;
  error?: string;
};

export type DataCleanupReport = {
  startedAt: string;
  completedAt: string;
  results: CleanupResult[];
  totalDeleted: number;
  /** WAP-163: email-failure diagnostics copied to `email_failure_snapshots` this run. */
  emailFailuresSnapshotted: number;
  /**
   * WAP-163: email-failure diagnostics the purge matched this run. Without it,
   * `emailFailuresSnapshotted: 0` is ambiguous between "nothing was eligible"
   * and "everything eligible was already copied" — which is exactly the
   * distinction the operator watching the 2026-10-01 run needs.
   */
  emailFailuresScanned: number;
  deletedAccounts?: number;
  /** Soft-deleted accounts past retention that a foreign key still holds. */
  blockedAccounts?: BlockedAccount[];
};

/**
 * WAP-163: the one model whose rows are evidence before they are noise.
 * `workflow_diagnostics` holds the only record of the 2026 failed outbound
 * emails, so every batch of it is copied into `email_failure_snapshots`
 * before it is deleted. See `snapshotBatchBeforeDelete` below.
 */
const SNAPSHOT_BEFORE_DELETE_MODEL = 'workflowDiagnostic';

/**
 * Copy the email-failure evidence out of the batch that is about to be
 * deleted. Called before that batch's `deleteMany`, in the same
 * `prisma.$transaction` callback.
 *
 * **The load-bearing property is ordering, not atomicity.** The copy is the
 * first statement and the delete the second, and the copy is `await`ed, so a
 * snapshot failure throws before the delete is ever issued. That holds in
 * every environment. It is deliberately not wrapped in a try/catch: the throw
 * propagates out of `cleanupTable`, `runDataCleanup` records it against the
 * model, and `/api/cron/data-cleanup` answers 500 and logs the run failed.
 *
 * Atomicity is a production-only bonus on top of that ordering, and must not
 * be relied on elsewhere: `installFlattenTxOverride` in lib/db/prisma.ts
 * replaces `$transaction(fn)` with a plain `fn(client)` whenever the policy is
 * `flattened` — `PRISMA_FLATTEN_TX=1`, or `VERCEL_ENV` of `preview` or
 * `development` (see lib/db/transactionPolicy.ts; production cannot be
 * flattened, the assert there refuses the flag). So in preview and dev there
 * is no transaction and no rollback.
 *
 * That is survivable because of which way the two failure modes point:
 *
 * - snapshot fails → no delete, in both modes. The rows stay.
 * - delete fails after the snapshot committed → in production both roll back;
 *   flattened, the snapshot rows are already committed and the source rows are
 *   still there. The result is a *surplus* copy, which the next run absorbs
 *   for free because the insert is `skipDuplicates` on the unique
 *   `source_diagnostic_id`.
 *
 * Both modes therefore make "deleted but not copied" unreachable, which is the
 * outcome that loses evidence. The worst case anywhere is a run that deletes
 * nothing, is loudly red, and has copied a few rows early.
 */
async function snapshotBatchBeforeDelete(
  tx: EmailFailureSnapshotClient,
  cfg: RetentionTableConfig,
  ids: readonly string[],
  snapshotRun: string | null,
): Promise<{ scanned: number; inserted: number }> {
  if (cfg.model !== SNAPSHOT_BEFORE_DELETE_MODEL || snapshotRun === null) {
    return { scanned: 0, inserted: 0 };
  }
  return snapshotEmailFailuresByDiagnosticId(tx, ids, snapshotRun);
}

/**
 * Delete rows older than the retention period in batches.
 *
 * Uses a simple loop because Prisma's `deleteMany` does not support
 * `limit`/`take` — we query a batch of IDs and then delete by ID.
 *
 * Never deletes member data directly; only log/telemetry tables
 * defined in RETENTION_TABLES.
 *
 * For `workflow_diagnostics` each batch is snapshotted before it is deleted,
 * in the same transaction (WAP-163).
 */
export async function cleanupTable(cfg: RetentionTableConfig): Promise<CleanupResult> {
  const cutoff = getCutoffDate(cfg.days);
  const delegate = (prisma as any)[cfg.model];
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(`Invalid Prisma model: ${cfg.model}`);
  }

  // AUDIT-2026-05-16 §H-B1: for the audit-log table, exclude rows whose
  // `action` matches a federally-mandated retention prefix. Those rows
  // remain until they pass CRITICAL_AUDIT_RETENTION_DAYS (3 years).
  const isAuditLog = cfg.model === 'auditLog';
  const criticalCutoff = isAuditLog ? getCutoffDate(CRITICAL_AUDIT_RETENTION_DAYS) : null;
  // SQL pattern for `LIKE`: `wioa.%` etc.
  const criticalLikes = CRITICAL_AUDIT_ACTION_PREFIXES.map((p) => `${p}%`);

  // One run label for every batch of this model, so a re-run of the cron is
  // distinguishable from the batches of a single run.
  const snapshotRun = cfg.model === SNAPSHOT_BEFORE_DELETE_MODEL ? snapshotRunLabel() : null;

  let totalDeleted = 0;
  let totalSnapshotted = 0;
  let totalSnapshotScanned = 0;
  let batchCount = 0;

  while (true) {
    const where: Record<string, unknown> = { [cfg.dateColumn]: { lt: cutoff } };
    if (isAuditLog && criticalCutoff) {
      // Default-bucket sweep: NOT a critical action OR older than the
      // 3-year critical-retention cutoff. Critical rows under 3 years
      // are excluded; the next pass (below) handles older critical rows.
      where.OR = [
        { NOT: { action: { in: [] } } }, // placeholder; replaced by AND below
      ];
      delete where.OR;
      where.AND = [
        { [cfg.dateColumn]: { lt: cutoff } },
        {
          OR: [
            { NOT: { OR: criticalLikes.map((pat) => ({ action: { startsWith: pat.replace('%', '') } })) } },
            { [cfg.dateColumn]: { lt: criticalCutoff } },
          ],
        },
      ];
      delete where[cfg.dateColumn];
    }

    // Find-then-delete-by-id is a read-then-write logical unit: the delete
    // targets exactly the IDs the read just selected, so both must run
    // inside the same $transaction to keep a consistent, GUC-tagged view.
    const batchResult: {
      deletedCount: number;
      batchSize: number;
      snapshotted: number;
      snapshotScanned: number;
    } | null =
      await prisma.$transaction(async (tx) => {
        const txDelegate = (tx as any)[cfg.model];
        const rows: { id: string }[] = await txDelegate.findMany({
          where,
          select: { id: true },
          take: RETENTION_BATCH_SIZE,
          orderBy: { [cfg.dateColumn]: 'asc' },
        });

        if (rows.length === 0) return null;

        const ids = rows.map((r) => r.id);

        // Evidence first: this is `await`ed before the delete is issued, so a
        // snapshot failure means no delete — in every environment, whether or
        // not the surrounding `$transaction` is a real one (WAP-163).
        const snapshot = await snapshotBatchBeforeDelete(tx, cfg, ids, snapshotRun);

        const deleteResult = await txDelegate.deleteMany({
          where: { id: { in: ids } },
        });

        return {
          deletedCount: deleteResult.count ?? rows.length,
          batchSize: rows.length,
          snapshotted: snapshot.inserted,
          snapshotScanned: snapshot.scanned,
        };
      });

    if (batchResult === null) break;

    totalDeleted += batchResult.deletedCount;
    totalSnapshotted += batchResult.snapshotted;
    totalSnapshotScanned += batchResult.snapshotScanned;
    batchCount += 1;

    if (batchResult.batchSize < RETENTION_BATCH_SIZE) break;
  }

  return {
    model: cfg.model,
    deleted: totalDeleted,
    batchCount,
    ...(snapshotRun !== null
      ? { snapshotted: totalSnapshotted, snapshotScanned: totalSnapshotScanned }
      : {}),
  };
}

/**
 * WAP-33: purge `coursera_xapi_events` rows that never matched a member and
 * are older than UNMATCHED_XAPI_EVENT_RETENTION_DAYS. Raw SQL because the
 * table has no Prisma model (created at runtime by lib/xapi/mappings.ts);
 * the existence probe keeps a fresh environment, where the table has not
 * been created yet, from erroring. Same batch-and-loop shape as
 * `cleanupTable`, keyed on `received_at`, and only rows with
 * `matched_user_id IS NULL AND completion_status = 'unmatched'` are eligible
 * — matched, ignored and errored events keep their existing lifetime.
 *
 * Rows whose `LOWER(actor_email)` equals a live member's `LOWER(users.email)`
 * are never purged: they are the replay handle `lib/xapi/reprocess.ts` uses
 * to credit a learner who enrolled after the Coursera work happened (see the
 * note on DEFAULT_UNMATCHED_XAPI_EVENT_RETENTION_DAYS in ./config.ts).
 */
export async function cleanupUnmatchedCourseraXapiEvents(): Promise<CleanupResult> {
  const cutoff = getCutoffDate(UNMATCHED_XAPI_EVENT_RETENTION_DAYS);
  let totalDeleted = 0;
  let batchCount = 0;

  const exists = await prisma.$transaction((tx) =>
    tx.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.coursera_xapi_events') IS NOT NULL AS present
    `,
  );
  if (!exists[0]?.present) {
    return { model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: 0, batchCount: 0 };
  }

  while (true) {
    const deleted = await prisma.$transaction((tx) =>
      tx.$executeRaw`
        DELETE FROM coursera_xapi_events
        WHERE id IN (
          SELECT id
          FROM coursera_xapi_events
          WHERE matched_user_id IS NULL
            AND completion_status = 'unmatched'
            AND received_at < ${cutoff}
            AND NOT EXISTS (
              SELECT 1
              FROM users u
              WHERE u.deleted_at IS NULL
                AND coursera_xapi_events.actor_email IS NOT NULL
                AND LOWER(u.email) = LOWER(coursera_xapi_events.actor_email)
            )
          ORDER BY received_at ASC
          LIMIT ${RETENTION_BATCH_SIZE}
        )
      `,
    );
    if (deleted === 0) break;
    totalDeleted += deleted;
    batchCount += 1;
    if (deleted < RETENTION_BATCH_SIZE) break;
  }

  return { model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: totalDeleted, batchCount };
}

/** A soft-deleted account the purge could not remove, and the constraint that stopped it. */
export type BlockedAccount = {
  id: string;
  constraint: string;
};

export type DeletedAccountsResult = {
  deleted: number;
  blocked: BlockedAccount[];
};

/**
 * `audit_events.actor_role` written by the member self-service routes
 * (`logAuditEvent({ user: { id, role: 'member' } })`). Rows a member wrote
 * about their own account are the account's data; rows written by staff
 * actors are the admin audit trail and are never touched here.
 */
const SELF_SERVICE_AUDIT_ACTOR_ROLE = 'member';

/**
 * Extract the constraint name from a Prisma P2003 (foreign key violated)
 * error, e.g. `audit_events_actor_user_id_fkey (index)` → `audit_events_actor_user_id_fkey`.
 * Returns null for any other error.
 */
export function foreignKeyConstraintName(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const { code, meta } = err as { code?: unknown; meta?: { field_name?: unknown; constraint?: unknown } };
  if (code !== 'P2003') return null;
  const raw = meta?.field_name ?? meta?.constraint;
  if (typeof raw === 'string' && raw.trim()) return raw.replace(/\s*\(index\)\s*$/, '').trim();
  if (Array.isArray(raw) && raw.length > 0) return raw.map(String).join(',');
  return 'unknown';
}

/**
 * Hard-delete users that have been soft-deleted for longer than
 * DELETED_ACCOUNT_RETENTION_DAYS.
 *
 * This is a GDPR compliance measure: after the legal hold period,
 * the account and all cascading relations are permanently removed.
 *
 * Most member tables cascade from `users`, but `audit_events.actor_user_id`
 * is `ON DELETE RESTRICT` with a required actor, and every member who used
 * the portal (or the self-delete button itself) has rows there. Deleting the
 * user row alone therefore fails with `audit_events_actor_user_id_fkey`, so
 * the member's own self-service rows are removed first, inside the same
 * transaction as the user row.
 *
 * Each account is purged in its own transaction. An account that is still
 * held by a foreign key (a subgroup they created, a table added later without
 * a delete rule) is reported by constraint name and skipped, so one held account can no longer
 * stop every other account in the batch from being purged. A held account is
 * passed through `anonymizeMember` (WAP-169) so the row that stays behind
 * carries no identifying or special-category data; the helper is idempotent
 * and keeps the existing `deleted_at`, so the account remains eligible for a
 * later purge once the holding row is gone.
 *
 * Since migration 20260920141800 `audit_events.actor_user_id` is
 * `ON DELETE SET NULL`, so the admin audit trail no longer holds an account,
 * and since 20260921150000 `chapter_members.user_id` cascades, so a chapter
 * membership no longer holds one either;
 * the member's own self-service rows are still removed with the account
 * because they are the account's data, not the staff trail.
 */
export async function cleanupDeletedAccounts(): Promise<DeletedAccountsResult> {
  const cutoff = getCutoffDate(DELETED_ACCOUNT_RETENTION_DAYS);

  let deleted = 0;
  const blocked: BlockedAccount[] = [];

  while (true) {
    const where: Record<string, unknown> = { deletedAt: { not: null, lt: cutoff } };
    if (blocked.length > 0) where.id = { notIn: blocked.map((b) => b.id) };

    // Read inside a transaction so the query runs under the same GUC-tagged
    // context the rest of the cron uses.
    const rows: { id: string }[] = await prisma.$transaction((tx) =>
      tx.user.findMany({
        where,
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
        orderBy: { deletedAt: 'asc' },
      }),
    );

    if (rows.length === 0) break;

    for (const { id } of rows) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.auditEvent.deleteMany({
            where: { actorUserId: id, actorRole: SELF_SERVICE_AUDIT_ACTOR_ROLE },
          });
          // deleteMany (not delete) so a row removed concurrently is a no-op,
          // not a P2025. Cascades run at the database level from here.
          await tx.user.deleteMany({ where: { id } });
        });
        deleted += 1;
      } catch (err) {
        const constraint = foreignKeyConstraintName(err);
        if (!constraint) throw err;
        console.error(`[data-cleanup] Soft-deleted account ${id} is still referenced by ${constraint}; skipped.`);
        blocked.push({ id, constraint });
        try {
          await anonymizeMember(id, { reason: 'retention_purge_blocked', actorUserId: null });
        } catch (anonymizeErr) {
          console.error(`[data-cleanup] Could not anonymise held account ${id}:`, anonymizeErr);
        }
      }
    }

    if (rows.length < RETENTION_BATCH_SIZE) break;
  }

  return { deleted, blocked };
}

/**
 * Run the full data cleanup sweep.
 *
 * Iterates every retention table and removes expired rows.
 * Errors for individual tables are captured and reported but do not
 * abort the entire sweep.
 *
 * A `workflow_diagnostics` snapshot failure surfaces here as that model's
 * `error`, which makes the whole run answer 500 from the cron route. The
 * model's rows are then still on disk: the failed batch's transaction rolled
 * back, and the loop stopped at the throw (WAP-163).
 */
export async function runDataCleanup(): Promise<DataCleanupReport> {
  const startedAt = new Date().toISOString();
  const results: CleanupResult[] = [];
  let totalDeleted = 0;
  let emailFailuresSnapshotted = 0;
  let emailFailuresScanned = 0;

  for (const cfg of RETENTION_TABLES) {
    try {
      const result = await cleanupTable(cfg);
      results.push(result);
      totalDeleted += result.deleted;
      emailFailuresSnapshotted += result.snapshotted ?? 0;
      emailFailuresScanned += result.snapshotScanned ?? 0;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[data-cleanup] Failed for ${cfg.model}:`, error);
      results.push({
        model: cfg.model,
        deleted: 0,
        batchCount: 0,
        error,
      });
    }
  }

  try {
    const result = await cleanupUnmatchedCourseraXapiEvents();
    results.push(result);
    totalDeleted += result.deleted;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[data-cleanup] Failed for ${UNMATCHED_XAPI_EVENT_RETENTION_LABEL}:`, error);
    results.push({ model: UNMATCHED_XAPI_EVENT_RETENTION_LABEL, deleted: 0, batchCount: 0, error });
  }

  let deletedAccounts = 0;
  let blockedAccounts: BlockedAccount[] = [];
  try {
    const accounts = await cleanupDeletedAccounts();
    deletedAccounts = accounts.deleted;
    blockedAccounts = accounts.blocked;
    totalDeleted += deletedAccounts;
    if (blockedAccounts.length > 0) {
      results.push({
        model: 'user (deleted accounts)',
        deleted: deletedAccounts,
        batchCount: 0,
        error: `${blockedAccounts.length} account(s) still referenced by: ${[...new Set(blockedAccounts.map((b) => b.constraint))].join(', ')}`,
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[data-cleanup] Failed for deleted accounts:', error);
    results.push({
      model: 'user (deleted accounts)',
      deleted: 0,
      batchCount: 0,
      error,
    });
  }

  const completedAt = new Date().toISOString();

  return {
    startedAt,
    completedAt,
    results,
    totalDeleted,
    emailFailuresSnapshotted,
    emailFailuresScanned,
    deletedAccounts,
    blockedAccounts,
  };
}
