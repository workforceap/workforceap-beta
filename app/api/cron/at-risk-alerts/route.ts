import { NextResponse } from 'next/server';
import {
  runAtRiskCounselorAlerts,
  runMemberRetentionNudges,
} from '@/lib/cron/at-risk-alerts';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/cron/at-risk-alerts — the weekly at-risk email + G5 nudges.
 *
 *  - Counselor alerts (WAP-30 / TODO-006): reads the CRITICAL `AtRiskAlert`
 *    rows the nightly `/api/cron/at-risk-check` persisted — no re-scoring —
 *    groups them by assigned counselor and sends one batched email per
 *    counselor; members with no counselor go to `AT_RISK_DIGEST_EMAILS`
 *    (fallback: admin inbox). Dedup against `notifiedCounselorAt` (24h).
 *    This is the only at-risk email; the old separate digest is gone.
 *  - Member nudges: classifies active members green/yellow/red and sends
 *    tiered nudge emails (check-in / come-back / stuck). Idempotent: each
 *    tier is on a 7-day per-member cooldown via MemberNudgeLog.
 *
 * Vercel Cron schedule: 7 13 * * 1 (Monday 13:07 UTC, staggered off :00).
 * Weekly cadence confirmed by Mike Brown 2026-09-20.
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
  const counselorResult = await runAtRiskCounselorAlerts(pacer);
  const nudgeResult = await runMemberRetentionNudges(pacer);
  const recordsProcessed =
    (counselorResult.counselorsNotified ?? 0) +
    nudgeResult.sentCheckIn +
    nudgeResult.sentComeBack +
    nudgeResult.sentStuck;
  await setCronRecordsProcessed(recordsProcessed);
  // Pacing/fixture skips are healthy outcomes; only a real provider failure fails the run.
  const SKIP_REASONS = new Set(['fixture_recipient', 'pacing_budget_exhausted', 'request_deadline_exhausted']);
  const failed = counselorResult.success === false ||
    counselorResult.results?.some((result) => Boolean(result.error) && !result.sent && !SKIP_REASONS.has(result.error ?? '')) ||
    nudgeResult.errors > 0;
  return NextResponse.json({
    counselorAlerts: counselorResult,
    memberNudges: nudgeResult,
  }, { status: failed ? 500 : 200 });
}

export const GET = withCronLogging('cron_at_risk_alerts', handle);
export const POST = withCronLogging('cron_at_risk_alerts', handle);
