import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  calculateAllAtRiskScores,
  persistAtRiskAlert,
  THRESHOLDS,
} from '@/lib/member/atRiskScoring';
import { logCronRun } from '@/lib/admin/logCronRun';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Nightly at-risk check — THE at-risk scorer (WAP-30 / TODO-006).
 *
 * Scores every active member, persists MEDIUM+ scores to `AtRiskAlert` — the
 * single risk source the admin command center, counselor command center,
 * at-risk dashboard and the weekly counselor alert all read — and resolves
 * alerts for members no longer at risk. Sends no email: the one at-risk email
 * is the weekly `/api/cron/at-risk-alerts`, which reads these rows.
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
  };
  await setCronRecordsProcessed(runResult.alertsCreated);
  await logCronRun('cron_at_risk_check', runResult, 'ok');
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_at_risk_check', handle);
export const POST = withCronLogging('cron_at_risk_check', handle);
