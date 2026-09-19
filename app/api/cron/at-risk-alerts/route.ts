import { NextResponse } from 'next/server';
import {
  runDailyAtRiskCounselorAlerts,
  runMemberRetentionNudges,
} from '@/lib/cron/at-risk-alerts';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/cron/at-risk-alerts
 *
 * Daily counselor alert batcher + G5 member retention nudge sender.
 *  - Counselor alerts: groups CRITICAL at-risk members by counselor, sends
 *    one batched email per counselor, deduplicates against
 *    notifiedCounselorAt within the last 24h.
 *  - Member nudges: classifies active members green/yellow/red and sends
 *    tiered nudge emails (check-in / come-back / stuck). Idempotent: each
 *    tier is on a 7-day per-member cooldown via MemberNudgeLog.
 *
 * Vercel Cron schedule: 7 13 * * 1 (staggered off the top of the hour)
 *
 * Authorization is owned by `withCronLogging` → `authorizeCronRequest`, which
 * accepts the secret via either `Authorization: Bearer` (what Vercel Cron
 * sends) or `x-cron-secret`. This handler previously re-checked the secret
 * itself and read only `x-cron-secret`, so every Vercel invocation cleared the
 * wrapper and was then rejected 401 by the inner gate — the run was recorded
 * FAILED with "Cron handler returned HTTP 401" and no alerts or nudges were
 * sent. Do not reintroduce a second, narrower auth check here.
 */
async function handle(_request: Request) {
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const counselorResult = await runDailyAtRiskCounselorAlerts(pacer);
  const nudgeResult = await runMemberRetentionNudges(pacer);
  const recordsProcessed =
    (counselorResult.counselorsNotified ?? 0) +
    nudgeResult.sentCheckIn +
    nudgeResult.sentComeBack +
    nudgeResult.sentStuck;
  await setCronRecordsProcessed(recordsProcessed);
  const failed = counselorResult.success === false ||
    counselorResult.results?.some((result) => Boolean(result.error)) ||
    nudgeResult.errors > 0;
  return NextResponse.json({
    counselorAlerts: counselorResult,
    memberNudges: nudgeResult,
  }, { status: failed ? 500 : 200 });
}

export const GET = withCronLogging('cron_at_risk_alerts', handle);
export const POST = withCronLogging('cron_at_risk_alerts', handle);
