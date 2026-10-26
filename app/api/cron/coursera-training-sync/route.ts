import { NextResponse } from 'next/server';

import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { replayPendingXapiStatements } from '@/lib/coursera/replayPendingXapi';
import { captureApiError } from '@/lib/observability/captureApiError';
import { createBulkEmailCronPacer, withBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;

/**
 * GET /api/cron/coursera-training-sync
 *
 * Hourly: replay pending xAPI rows into `CourseProgress`. Skillset progress
 * is pulled by `/api/cron/coursera-sync` on a 6h schedule.
 * Secured with `Authorization: Bearer ${CRON_SECRET}` (same as other crons).
 */
async function handle(_request: Request) {
  try {
    const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
    const xapi = await withBulkEmailCronPacer(pacer, () => replayPendingXapiStatements(200));
    const runResult = { xapi };
    // Count confirmed terminal outcomes conservatively, excluding unresolved
    // progress as well as pending completions. Unresolved completion attribution
    // stays pending; processing/outcome-read failures stay visible to cron
    // health checks after the rest of the batch finishes.
    await setCronRecordsProcessed(
      xapi.breakdown.completedOk + xapi.breakdown.ignored
      + xapi.breakdown.unmatched + xapi.skippedUnparsed,
    );
    const failed = xapi.breakdown.errored > 0;
    if (failed) {
      captureApiError(new Error('Pending xAPI replay had processing failures'), {
        route: 'cron/coursera-training-sync',
        extra: { scanned: xapi.scanned, replayed: xapi.replayed, errored: xapi.breakdown.errored },
      });
    }
    await logCronRun('cron_coursera_training_sync', runResult, failed ? 'error' : 'ok');
    return NextResponse.json(runResult, { status: failed ? 500 : 200 });
  } catch (err) {
    captureApiError(err, { route: 'cron/coursera-training-sync' });
    await logCronRun(
      'cron_coursera_training_sync',
      { error: err instanceof Error ? err.message : 'unknown' },
      'error',
    );
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

export const GET = withCronLogging('cron_coursera_training_sync', handle);
