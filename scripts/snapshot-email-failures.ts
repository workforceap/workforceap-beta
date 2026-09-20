/**
 * Copy every `email_send` failure row from `workflow_diagnostics` into
 * `email_failure_snapshots` before the 90-day retention purge removes it.
 *
 * Idempotent: rows are keyed by `source_diagnostic_id`, so re-running only
 * adds rows that appeared since the last run. Nothing is deleted or updated in
 * `workflow_diagnostics`. Read-only against the source; additive on the copy.
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
  EMAIL_FAILURE_STATUSES,
  snapshotRunLabel,
  toEmailFailureSnapshotRow,
} from '../lib/email/failureSnapshot';
import { EMAIL_SEND_WORKFLOW } from '../lib/email/failureRecord';

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
  const batch = Math.max(1, Math.min(2000, Number(readFlag('batch') ?? 500) || 500));
  const run = snapshotRunLabel();

  const where = {
    workflow: EMAIL_SEND_WORKFLOW,
    status: { in: [...EMAIL_FAILURE_STATUSES] },
    ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
  };

  const [sourceTotal, alreadySnapshotted] = await Promise.all([
    prisma.workflowDiagnostic.count({ where }),
    prisma.emailFailureSnapshot.count(),
  ]);
  console.log(`[snapshot-email-failures] run=${run} dryRun=${dryRun}`);
  console.log(`[snapshot-email-failures] source email_send failure rows: ${sourceTotal}; snapshot rows before: ${alreadySnapshotted}`);

  let scanned = 0;
  let inserted = 0;
  const byClass = new Map<string, number>();
  const byTemplate = new Map<string, number>();
  let oldest: Date | null = null;
  let newest: Date | null = null;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.workflowDiagnostic.findMany({
      where,
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, workflow: true, status: true, actorUserId: true, entityType: true, entityId: true,
        summary: true, provider: true, method: true, fallbackPath: true, failureReason: true,
        metadata: true, createdAt: true,
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const mapped = rows.map((row) => toEmailFailureSnapshotRow(row, run));
    for (const row of mapped) {
      byClass.set(row.errorClass, (byClass.get(row.errorClass) ?? 0) + 1);
      const template = row.templateKey ?? '(untyped)';
      byTemplate.set(template, (byTemplate.get(template) ?? 0) + 1);
      if (!oldest || row.diagnosticCreatedAt < oldest) oldest = row.diagnosticCreatedAt;
      if (!newest || row.diagnosticCreatedAt > newest) newest = row.diagnosticCreatedAt;
    }

    if (!dryRun) {
      const result = await prisma.emailFailureSnapshot.createMany({
        data: mapped.map((row) => ({ ...row, metadata: row.metadata === null ? undefined : (row.metadata as object) })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    if (rows.length < batch) break;
  }

  const after = dryRun ? alreadySnapshotted : await prisma.emailFailureSnapshot.count();
  console.log(`[snapshot-email-failures] scanned=${scanned} inserted=${inserted} skippedExisting=${scanned - inserted} snapshotRowsAfter=${after}`);
  console.log(`[snapshot-email-failures] window: ${oldest?.toISOString() ?? '-'} .. ${newest?.toISOString() ?? '-'}`);
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
