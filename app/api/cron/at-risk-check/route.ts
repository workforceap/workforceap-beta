import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  calculateAllAtRiskScores,
  persistAtRiskAlert,
  THRESHOLDS,
} from '@/lib/member/atRiskScoring';
import { runDailyAtRiskCounselorAlerts } from '@/lib/cron/at-risk-alerts';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { logCronRun } from '@/lib/admin/logCronRun';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Nightly at-risk check — THE at-risk schedule (WAP-30 / TODO-006).
 *
 * 1. Scores every active member (`calculateAllAtRiskScores`).
 * 2. Persists MEDIUM+ scores to `AtRiskAlert` — the single risk source the
 *    admin command center, counselor command center and at-risk dashboard
 *    all read — and resolves alerts for members no longer at risk.
 * 3. Sends the one at-risk email on those same scores: a batched alert per
 *    counselor for their CRITICAL members (24h dedup via
 *    `notifiedCounselorAt`), with members who have no counselor routed to
 *    `AT_RISK_DIGEST_EMAILS` (fallback: admin inbox). No second scoring pass,
 *    no separate digest.
 *
 * Vercel Cron uses GET — both GET and POST are supported.
 */
async function handle(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const startTime = Date.now();
  const scores = await calculateAllAtRiskScores();

  const criticalCount = scores.filter((s) => s.score >= THRESHOLDS.CRITICAL).length;
  const highRiskBucket = scores.filter((s) => s.score >= THRESHOLDS.HIGH);
  const highCount = highRiskBucket.filter((s) => s.score < THRESHOLDS.CRITICAL).length;
  const mediumCount = scores.filter(
    (s) => s.score >= THRESHOLDS.MEDIUM && s.score < THRESHOLDS.HIGH,
  ).length;

  const atRiskScores = scores.filter((s) => s.score >= THRESHOLDS.MEDIUM);
  for (const score of atRiskScores) {
    await persistAtRiskAlert(score);
  }

  const activeAlertUserIds = new Set(atRiskScores.map((s) => s.userId));

  const staleAlerts = await prisma.atRiskAlert.findMany({
    where: {
      status: { in: ['open', 'acknowledged'] },
      userId: { notIn: Array.from(activeAlertUserIds) },
    },
    select: { id: true },
    take: 100,
  });

  if (staleAlerts.length > 0) {
    await prisma.atRiskAlert.updateMany({
      where: {
        id: { in: staleAlerts.map((a) => a.id) },
      },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
    });
  }

  // One sender, one schedule: counselor alerts run on the scores persisted above.
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const counselorAlerts = await runDailyAtRiskCounselorAlerts(pacer, scores);
  // Pacing/fixture skips are healthy outcomes (the pacer is bounding provider
  // load; fixtures never receive mail) — only a real provider failure is an error run.
  const SKIP_REASONS = new Set(['fixture_recipient', 'pacing_budget_exhausted', 'request_deadline_exhausted']);
  const alertDeliveryFailed =
    counselorAlerts.success === false ||
    counselorAlerts.results.some((result) => Boolean(result.error) && !result.sent && !SKIP_REASONS.has(result.error ?? ''));

  const durationMs = Date.now() - startTime;
  const runResult = {
    success: true,
    scored: scores.length,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    alertsCreated: atRiskScores.length,
    alertsResolved: staleAlerts.length,
    durationMs,
    counselorAlerts,
    emailPacing: pacer.summary(),
  };
  await setCronRecordsProcessed(runResult.alertsCreated);
  await logCronRun('cron_at_risk_check', runResult, alertDeliveryFailed ? 'error' : 'ok');
  return NextResponse.json(runResult, { status: alertDeliveryFailed ? 500 : 200 });
}

export const GET = withCronLogging('cron_at_risk_check', handle);
export const POST = withCronLogging('cron_at_risk_check', handle);
