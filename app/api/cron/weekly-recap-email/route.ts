import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendAdminWeeklyRecapEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * Cron endpoint to send weekly admin recap email.
 * Runs Friday 4 PM CT (10 PM UTC: "0 22 * * 5").
 * Gathers: new applicants, placements, at-risk students, pending applications.
 * Protected with CRON_SECRET header.
 */
async function handle(_request: Request) {
  try {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // New applicants this week (users created in last 7 days)
  const newApplicants = await prisma.user.count({
    where: {
      deletedAt: null,
      createdAt: { gte: sevenDaysAgo },
    },
  });

  // Placements this week
  const placements = await prisma.placementRecord.count({
    where: {
      placedAt: { gte: sevenDaysAgo },
    },
  });

  // At-risk students: enrolled but no events in 14+ days.
  // SQL anti-join — do not materialize every recently-active userId.
  const atRiskStudents = await prisma.user.count({
    where: {
      deletedAt: null,
      enrolledProgram: { not: null },
      memberEvents: { none: { createdAt: { gte: fourteenDaysAgo } } },
    },
  });

  // Pending applications
  const pendingApplications = await prisma.application.count({
    where: { status: 'PENDING' },
  });

  const result = await sendAdminWeeklyRecapEmail({
    newApplicants,
    placements,
    atRiskStudents,
    pendingApplications,
  });

  const runResult = { ok: true, checkedAt: now.toISOString(), newApplicants, placements, atRiskStudents, pendingApplications, emailSent: result.ok };
  await setCronRecordsProcessed(newApplicants + placements + atRiskStudents + pendingApplications);
  await logCronRun('cron_weekly_recap_email', runResult, result.ok ? 'ok' : 'error');
  return NextResponse.json(runResult);
  } catch (err) {
    captureApiError(err, { route: 'cron/weekly-recap-email' });
    await logCronRun('cron_weekly_recap_email', { error: err instanceof Error ? err.message : 'unknown' }, 'error');
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

export const GET = withCronLogging('cron_weekly_recap_email', handle);
export const POST = withCronLogging('cron_weekly_recap_email', handle);
