import { NextResponse } from 'next/server';
import { generateWioaReport } from '@/lib/cron/wioa-report';
import { sendWioaReportEmail } from '@/lib/email';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * GET /api/cron/wioa-report
 *
 * Monthly WIOA grant reporting cron.
 * Runs 1st of every month at 9:00 AM CT (14:00 UTC).
 * Generates the previous month's report and emails it to admin.
 */
async function handle(_request: Request) {
  const report = await generateWioaReport();

  const periodLabel = new Date(report.periodStart).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const emailResult = await sendWioaReportEmail({
    periodLabel,
    totalActiveMembers: report.totalActiveMembers,
    totalCompleters: report.totalCompleters,
    totalPlacements: report.totalPlacements,
    overallAvgWage: report.overallAvgWage,
    programs: report.programs,
    reportJson: report.rawJson,
  });

  const runResult = {
    ok: emailResult.ok,
    periodLabel,
    totalActiveMembers: report.totalActiveMembers,
    totalCompleters: report.totalCompleters,
    totalPlacements: report.totalPlacements,
    overallAvgWage: report.overallAvgWage,
    programCount: report.programs.length,
    emailError: emailResult.error ?? null,
  };

  await setCronRecordsProcessed(report.totalActiveMembers);
  await logCronRun('cron_wioa_report', runResult, emailResult.ok ? 'ok' : 'error');

  if (!emailResult.ok) {
    return NextResponse.json(
      { error: 'Email failed', detail: emailResult.error, report },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, report });
}

export const GET = withCronLogging('cron_wioa_report', handle);
export const POST = withCronLogging('cron_wioa_report', handle);
