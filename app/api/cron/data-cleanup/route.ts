import { NextResponse } from 'next/server';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { failStaleCronExecutions, type StaleCronSweepResult } from '@/lib/cron/staleExecutions';
import { captureApiError } from '@/lib/observability/captureApiError';
import { runDataCleanup } from '@/lib/retention/cleanup';

export const maxDuration = 300;

/**
 * GET /api/cron/data-cleanup
 *
 * Daily automated data retention cleanup.
 * Deletes expired log/telemetry rows in batches and hard-deletes
 * soft-deleted accounts past the legal-hold period.
 *
 * Also sweeps CronExecution rows left RUNNING for more than 15 minutes into
 * FAILED so a platform timeout cannot pose as a live job (WAP-177 fix 4).
 *
 * A run with any per-table error is recorded as an error and answers 500, so
 * the wrapper marks the execution FAILED instead of `ok` (WAP-177 fix 3).
 *
 * Secured by CRON_SECRET.
 */
async function handle(_request: Request) {
  const report = await runDataCleanup();

  let staleCronExecutions: StaleCronSweepResult | { failed: 0; error: string };
  try {
    staleCronExecutions = await failStaleCronExecutions();
  } catch (error) {
    captureApiError(error, { route: 'cron/data_cleanup', extra: { phase: 'stale_cron_sweep' } });
    staleCronExecutions = { failed: 0, error: error instanceof Error ? error.message : String(error) };
  }

  console.log('[data-cleanup] Report:', JSON.stringify({ ...report, staleCronExecutions }));

  const tableErrors = report.results.filter((result) => result.error).map((result) => result.model);
  const sweepError = 'error' in staleCronExecutions ? staleCronExecutions.error : null;
  const failed = tableErrors.length > 0 || sweepError !== null;

  await setCronRecordsProcessed(report.totalDeleted);
  await logCronRun(
    'data_cleanup',
    { ...report, staleCronExecutions, ...(failed ? { failedModels: tableErrors } : {}) },
    failed ? 'error' : 'ok',
  );

  return NextResponse.json({
    ok: !failed,
    totalDeleted: report.totalDeleted,
    deletedAccounts: report.deletedAccounts,
    blockedAccounts: report.blockedAccounts ?? [],
    results: report.results,
    staleCronExecutions,
    ...(failed ? { failedModels: tableErrors } : {}),
  }, { status: failed ? 500 : 200 });
}

export const GET = withCronLogging('data_cleanup', handle);
export const POST = withCronLogging('data_cleanup', handle);
