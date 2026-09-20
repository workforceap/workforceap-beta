import { NextResponse } from 'next/server';
import { runMemberRetentionNudges } from '@/lib/cron/at-risk-alerts';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/cron/at-risk-alerts — G5 member retention nudge sender.
 *
 * Classifies active members green/yellow/red and sends tiered nudge emails
 * (check-in / come-back / stuck) to MEMBERS. Idempotent: each tier is on a
 * 7-day per-member cooldown via MemberNudgeLog.
 *
 * Counselor at-risk alerts no longer run here (WAP-30 / TODO-006): they are
 * sent once, nightly, by `/api/cron/at-risk-check` on the scores it persists,
 * so counselors get one at-risk email from one schedule. The route path and
 * `cron_at_risk_alerts` workflow key are kept so cron run history and the
 * admin cron toggle stay continuous.
 *
 * Vercel Cron schedule: 7 13 * * 1 (staggered off the top of the hour)
 *
 * Authorization is owned by `withCronLogging` → `authorizeCronRequest`, which
 * accepts the secret via either `Authorization: Bearer` (what Vercel Cron
 * sends) or `x-cron-secret`. This handler previously re-checked the secret
 * itself and read only `x-cron-secret`, so every Vercel invocation cleared the
 * wrapper and was then rejected 401 by the inner gate — the run was recorded
 * FAILED with "Cron handler returned HTTP 401" and no nudges were sent. Do not
 * reintroduce a second, narrower auth check here.
 */
async function handle(_request: Request) {
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const nudgeResult = await runMemberRetentionNudges(pacer);
  const recordsProcessed =
    nudgeResult.sentCheckIn +
    nudgeResult.sentComeBack +
    nudgeResult.sentStuck;
  await setCronRecordsProcessed(recordsProcessed);
  const failed = nudgeResult.errors > 0;
  return NextResponse.json({
    memberNudges: nudgeResult,
  }, { status: failed ? 500 : 200 });
}

export const GET = withCronLogging('cron_at_risk_alerts', handle);
export const POST = withCronLogging('cron_at_risk_alerts', handle);
