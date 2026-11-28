import { NextResponse } from 'next/server';

import { logCronRun } from '@/lib/admin/logCronRun';
import { captureNightlyLearningHours } from '@/lib/coursera/learningHoursNightly.server';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { captureApiError } from '@/lib/observability/captureApiError';

export const maxDuration = 300;

const WORKFLOW_KEY = 'cron_coursera_hours_snapshot';

/**
 * GET /api/cron/coursera-hours-snapshot
 *
 * Nightly: record each learner's cumulative Coursera learning hours for the
 * Central-time day into `coursera_learning_hours_snapshots`. Daily study
 * minutes for the student sign-in timesheet are the difference between
 * consecutive days. Runs at 04:45 UTC, which is 22:45 CST / 23:45 CDT, so
 * the reading always lands on the day it describes. Read-only toward
 * Coursera; sends no email.
 * Secured with `Authorization: Bearer ${CRON_SECRET}` via withCronLogging.
 */
async function handle(_request: Request) {
  try {
    // Leave headroom under maxDuration for the database write.
    const result = await captureNightlyLearningHours({ budgetMs: 240_000 });
    await setCronRecordsProcessed(result.snapshotsWritten);
    const failed = result.programs > 0 && result.programErrors === result.programs;
    if (result.programErrors > 0) {
      captureApiError(new Error('Coursera hours snapshot had program fetch failures'), {
        route: 'cron/coursera-hours-snapshot',
        extra: { programs: result.programs, programErrors: result.programErrors },
      });
    }
    await logCronRun(WORKFLOW_KEY, result, failed ? 'error' : 'ok');
    return NextResponse.json(result, { status: failed ? 500 : 200 });
  } catch (err) {
    captureApiError(err, { route: 'cron/coursera-hours-snapshot' });
    await logCronRun(
      WORKFLOW_KEY,
      { error: err instanceof Error ? err.message : 'unknown' },
      'error',
    );
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

export const GET = withCronLogging(WORKFLOW_KEY, handle);
