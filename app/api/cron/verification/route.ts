import { prisma } from '@/lib/db/prisma';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * Daily verification that member-facing cron jobs actually executed.
 *
 * Checks cron run logs against schedule-aware freshness windows.
 * Daily crons get a 30h window; weekly crons get an 8-day window.
 */

type CriticalCron = {
  workflow: string;
  schedule: 'daily' | 'weekly';
  maxAgeHours: number;
};

async function handle(_request: Request) {
  const now = new Date();

  const criticalCrons: CriticalCron[] = [
    { workflow: 'cron_applicant_followup', schedule: 'daily', maxAgeHours: 30 },
    { workflow: 'cron_inactive_nudge', schedule: 'daily', maxAgeHours: 30 },
    { workflow: 'cron_milestone_celebration', schedule: 'daily', maxAgeHours: 30 },
    { workflow: 'cron_inactivity_nudge', schedule: 'weekly', maxAgeHours: 8 * 24 },
    { workflow: 'cron_partner_digest', schedule: 'weekly', maxAgeHours: 8 * 24 },
    { workflow: 'cron_weekly_recap_email', schedule: 'weekly', maxAgeHours: 8 * 24 },
    { workflow: 'cron_weekly_recap', schedule: 'weekly', maxAgeHours: 8 * 24 },
  ];
  const criticalKeys = criticalCrons.map((cron) => cron.workflow);
  const oldestWindow = new Date(
    now.getTime() - Math.max(...criticalCrons.map((cron) => cron.maxAgeHours)) * 60 * 60 * 1000,
  );

  const runs = await prisma.workflowDiagnostic.findMany({
    where: {
      workflow: { in: criticalKeys },
      createdAt: { gte: oldestWindow },
    },
    orderBy: { createdAt: 'desc' },
    select: { workflow: true, createdAt: true, status: true },
    take: 100,
  });

  const lastRunByWorkflow = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!lastRunByWorkflow.has(run.workflow)) {
      lastRunByWorkflow.set(run.workflow, run);
    }
  }

  const staleOrMissing = criticalCrons.filter((cron) => {
    const lastRun = lastRunByWorkflow.get(cron.workflow);
    if (!lastRun) return true;
    const ageHours = (now.getTime() - lastRun.createdAt.getTime()) / (60 * 60 * 1000);
    return ageHours > cron.maxAgeHours;
  });
  const failures = Array.from(lastRunByWorkflow.values()).filter(
    (run: { status: string }) => run.status === 'error',
  );

  const runResult = {
    ok: staleOrMissing.length === 0 && failures.length === 0,
    checked: criticalCrons.length,
    ran: lastRunByWorkflow.size,
    staleOrMissing: staleOrMissing.map((cron) => cron.workflow),
    failures: failures.map((f: { workflow: string }) => f.workflow),
    windows: criticalCrons.map((cron) => ({
      workflow: cron.workflow,
      schedule: cron.schedule,
      maxAgeHours: cron.maxAgeHours,
      lastRunAt: lastRunByWorkflow.get(cron.workflow)?.createdAt.toISOString() ?? null,
    })),
    checkedAt: now.toISOString(),
  };

  await setCronRecordsProcessed(criticalCrons.length);
  await logCronRun('cron_verification', runResult);
  return Response.json(runResult);
}

export const GET = withCronLogging('cron_verification', handle);
export const POST = withCronLogging('cron_verification', handle);
