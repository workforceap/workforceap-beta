import { NextResponse } from 'next/server';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { runDailyPlacementSurveyCron } from '@/lib/cron/placement-surveys';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

export const maxDuration = 300;

/**
 * POST /api/cron/placement-survey
 *
 * Daily cron: sends 30/60/90-day placement surveys and escalates
 * non-responders to counselors. Idempotent per wave per placement.
 *
 * Schedule: 0 14 * * * (2 PM UTC ~ 9 AM CDT)
 */
async function handle(_request: Request) {
  const result = await runDailyPlacementSurveyCron();

  const totalSent = result.waves.reduce((sum, w) => sum + w.sent.length, 0);
  const totalSkipped = result.waves.reduce((sum, w) => sum + w.skipped.length, 0);
  const totalEmailFailures = result.waves.reduce((sum, w) => sum + w.emailFailures.length, 0);

  const runResult = {
    ...result,
    summary: {
      totalSent,
      totalSkipped,
      totalEmailFailures,
      escalationsAlerted: result.escalations.alerted.length,
      escalationsSkipped: result.escalations.skipped.length,
      escalationsEmailFailures: result.escalations.emailFailures.length,
    },
  };

  // WAP-177 fix 3: any failed delivery is an error run (and a 500 so the
  // wrapper records FAILED); the former 'partial' string was never a valid
  // WorkflowDiagnostic status and the route always answered 200.
  const failures = totalEmailFailures + result.escalations.emailFailures.length;
  const status = failures > 0 ? 'error' : 'ok';

  await setCronRecordsProcessed(totalSent);
  await logCronRun('cron_placement_survey', runResult, status);

  return NextResponse.json(runResult, { status: failures > 0 ? 500 : 200 });
}

export const GET = withCronLogging('cron_placement_survey', handle);
export const POST = withCronLogging('cron_placement_survey', handle);
