/**
 * Manual catch-up copy of every `email_send` failure row from
 * `workflow_diagnostics` into `email_failure_snapshots`.
 *
 * Since WAP-163 the daily retention cron does this automatically for the rows
 * it is about to delete: `lib/retention/cleanup.ts` snapshots each
 * `workflow_diagnostics` batch inside the same transaction as its delete, so
 * nothing ages out uncopied. This script stays for the jobs that cron cannot
 * do, because it is not bounded by the retention cutoff:
 *
 *   - pull the evidence for rows that have NOT reached the cutoff yet
 *     (e.g. before lowering WORKFLOW_DIAGNOSTIC_RETENTION_DAYS to 60, WAP-17);
 *   - `--dry-run` classification of the backlog by error class and template;
 *   - a catch-up after a window in which the cron was failing.
 *
 * It shares the cron's predicate, mapping and idempotent insert
 * (`lib/email/failureSnapshot.ts`) rather than keeping a second copy of them.
 *
 * Idempotent: rows are keyed by `source_diagnostic_id`, so re-running only
 * adds rows that appeared since the last run. Nothing is deleted or updated in
 * `workflow_diagnostics`. Read-only against the source; additive on the copy.
 *
 * This script PRESERVES; it does not re-send, and must not grow into a
 * re-sender. The copy is deliberately the whole failure set, because it is
 * evidence. The re-send scope is narrower and was ruled on separately: replay
 * only the course-paid and application-status failures, and send dormant
 * members one fresh "we miss you" message rather than replaying the queued
 * ones. Any future re-send tool reads `email_failure_snapshots`, filters to
 * `template_key` in that approved set, and goes through the existing admin
 * resend path (`lib/email/resendRegistry.ts`) — not through this file.
 *
 * Usage (against the database named by DATABASE_URL / POSTGRES_PRISMA_URL):
 *   node scripts/prisma-env.js npx tsx scripts/snapshot-email-failures.ts --dry-run
 *   node scripts/prisma-env.js npx tsx scripts/snapshot-email-failures.ts
 *
 * Options:
 *   --dry-run        count and classify, write nothing
 *   --since=<date>   only rows created on/after this ISO date (default: all)
 *   --batch=<n>      rows per page (default 500)
 */
import { PrismaClient } from '@prisma/client';

import {
  emailFailureDiagnosticWhere,
  snapshotEmailFailures,
  snapshotRunLabel,
} from '../lib/email/failureSnapshot';

const prisma = new PrismaClient();

function readFlag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const since = readFlag('since');
  const sinceDate = since ? new Date(since) : null;
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    throw new Error(`--since is not a date: ${since}`);
  }
  const batchSize = Number(readFlag('batch') ?? 500) || 500;
  const run = snapshotRunLabel();

  const where = emailFailureDiagnosticWhere(sinceDate ? { createdAt: { gte: sinceDate } } : {});

  const [sourceTotal, alreadySnapshotted] = await Promise.all([
    prisma.workflowDiagnostic.count({ where }),
    prisma.emailFailureSnapshot.count(),
  ]);
  console.log(`[snapshot-email-failures] run=${run} dryRun=${dryRun}`);
  console.log(`[snapshot-email-failures] source email_send failure rows: ${sourceTotal}; snapshot rows before: ${alreadySnapshotted}`);

  const byClass = new Map<string, number>();
  const byTemplate = new Map<string, number>();
  let oldest: Date | null = null;
  let newest: Date | null = null;

  const { scanned, inserted } = await snapshotEmailFailures(
    prisma,
    run,
    {
      batchSize,
      since: sinceDate,
      dryRun,
      onBatch: (rows) => {
        for (const row of rows) {
          byClass.set(row.errorClass, (byClass.get(row.errorClass) ?? 0) + 1);
          const template = row.templateKey ?? '(untyped)';
          byTemplate.set(template, (byTemplate.get(template) ?? 0) + 1);
          if (!oldest || row.diagnosticCreatedAt < oldest) oldest = row.diagnosticCreatedAt;
          if (!newest || row.diagnosticCreatedAt > newest) newest = row.diagnosticCreatedAt;
        }
      },
    },
  );

  const after = dryRun ? alreadySnapshotted : await prisma.emailFailureSnapshot.count();
  console.log(`[snapshot-email-failures] scanned=${scanned} inserted=${inserted} skippedExisting=${scanned - inserted} snapshotRowsAfter=${after}`);
  const oldestIso = oldest ? (oldest as Date).toISOString() : '-';
  const newestIso = newest ? (newest as Date).toISOString() : '-';
  console.log(`[snapshot-email-failures] window: ${oldestIso} .. ${newestIso}`);
  console.log('[snapshot-email-failures] by error class:', Object.fromEntries([...byClass.entries()].sort()));
  console.log('[snapshot-email-failures] by template:', Object.fromEntries([...byTemplate.entries()].sort((a, b) => b[1] - a[1])));
  if (!dryRun && after < sourceTotal) {
    console.warn(`[snapshot-email-failures] snapshot holds ${after} rows but the source has ${sourceTotal}; re-run to catch rows added during the copy.`);
  }
}

main()
  .catch((error) => {
    console.error('[snapshot-email-failures] failed', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
