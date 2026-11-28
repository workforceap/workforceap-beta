import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  calculateAllAtRiskScores,
  persistAtRiskAlert,
  THRESHOLDS,
} from '@/lib/member/atRiskScoring';
import {
  MEMBER_REPORTED_FACTOR_NAMES,
  hasMemberReportedFactor,
} from '@/lib/member/counselorEscalation';
import { logCronRun } from '@/lib/admin/logCronRun';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Nightly at-risk check — THE at-risk scorer (WAP-30 / TODO-006).
 *
 * Scores the enrolled, not-yet-placed member population (capped inside
 * `calculateAllAtRiskScores`), persists MEDIUM+ scores to `AtRiskAlert` — the
 * single risk source the admin command center, counselor command center,
 * at-risk dashboard and the weekly counselor alert all read — and resolves
 * alerts only for members this run scored below MEDIUM. Unscored members
 * (the scoring cap, or a thrown Coursera/B4B lookup) keep their open
 * alerts; treating them as "no longer at risk" would empty counselor
 * queues on a provider outage. Member-reported escalations
 * (see MEMBER_REPORTED_FACTOR_NAMES) stay until staff close them. Sends no email: the one at-risk email
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

  // Only members this run actually scored below MEDIUM. `notIn: tonight's
  // medium+ ids` also matches people the scorer never returned — the 500-cap
  // remainder, or anyone whose Coursera/B4B lookup threw and was swallowed.
  const scoredBelowMediumUserIds = scores
    .filter((s) => s.score < THRESHOLDS.MEDIUM)
    .map((s) => s.userId);

  let alertsResolved = 0;
  if (scoredBelowMediumUserIds.length > 0) {
    // Member-reported escalations (First 90 Days trouble, placement-survey job
    // loss) are never auto-resolved: a counselor must see them and staff close
    // them. They are excluded IN THE QUERY so preserved rows cannot fill the
    // take:100 batch and starve real stale alerts, then re-checked per row.
    const eligibleForResolution = {
      status: { in: ['open', 'acknowledged'] },
      userId: { in: scoredBelowMediumUserIds },
      // A staff action, escalation, or another scorer that changed an alert
      // after this run started is newer evidence than this score snapshot.
      updatedAt: { lt: new Date(startTime) },
      NOT: {
        OR: MEMBER_REPORTED_FACTOR_NAMES.map((name) => ({
          factors: { array_contains: [{ name }] },
        })),
      },
    };
    const staleCandidates = await prisma.atRiskAlert.findMany({
      where: eligibleForResolution,
      select: { id: true, factors: true, updatedAt: true },
      take: 100,
    });
    const staleAlerts = staleCandidates.filter((a) => !hasMemberReportedFactor(a.factors));

    if (staleAlerts.length > 0) {
      const resolved = await prisma.atRiskAlert.updateMany({
        where: {
          ...eligibleForResolution,
          // Recheck the exact read revisions and safety predicates atomically.
          // A new escalation between findMany and updateMany must stay open.
          OR: staleAlerts.map(({ id, updatedAt }) => ({ id, updatedAt })),
        },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
        },
      });
      alertsResolved = resolved.count;
    }
  }

  const durationMs = Date.now() - startTime;
  const runResult = {
    success: true,
    scored: scores.length,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    alertsCreated: atRiskScores.length,
    alertsResolved,
    durationMs,
  };
  await setCronRecordsProcessed(runResult.alertsCreated);
  await logCronRun('cron_at_risk_check', runResult, 'ok');
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_at_risk_check', handle);
export const POST = withCronLogging('cron_at_risk_check', handle);
