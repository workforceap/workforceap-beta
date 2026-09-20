import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { notifyDiscord } from '@/lib/notify/discord';
import { sendJobAlertDigestEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed, getCurrentCronExecutionId } from '@/lib/cron/cronExecution';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;
const JOB_NAME = 'cron_job_alerts';


/**
 * Weekly job alert digest.
 *
 * Members who are actively job searching (have a saved job, a job
 * application, or an AI job match on file) AND are enrolled in a program
 * get ONE digest notification + email when new live jobs matching their
 * program went up since the last successful run of this cron.
 * Runs Monday 9 AM UTC. Secured with CRON_SECRET (see withCronLogging).
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const currentExecutionId = getCurrentCronExecutionId();
  const lastSuccessfulRun = await prisma.cronExecution.findFirst({
    where: {
      jobName: JOB_NAME,
      status: 'SUCCESS',
      ...(currentExecutionId ? { id: { not: currentExecutionId } } : {}),
    },
    orderBy: { completedAt: 'desc' },
    select: { startedAt: true },
  });
  // First-ever run: only alert on jobs from the last 7 days so a cold start
  // doesn't dump the entire jobs table into everyone's inbox.
  const fallbackWindow = new Date();
  fallbackWindow.setDate(fallbackWindow.getDate() - 7);
  const since = lastSuccessfulRun?.startedAt ?? fallbackWindow;

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      enrolledProgram: { not: null },
      OR: [
        { savedJobs: { some: {} } },
        { jobPostingApplications: { some: {} } },
        { aiJobMatches: { some: {} } },
      ],
    },
    select: { id: true, email: true, fullName: true, enrolledProgram: true },
    take: 1000,
  });

  let notificationsCreated = 0;
  let emailsAccepted = 0;
  let emailsSkipped = 0;
  let emailFailures = 0;
  for (const member of candidates) {
    if (!member.enrolledProgram) continue;
    try {
      const programSlug = member.enrolledProgram.toLowerCase();
      const jobs = await prisma.job.findMany({
        where: {
          status: 'live',
          updatedAt: { gte: since },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          suggestedPrograms: { has: programSlug },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          location: true,
          employer: { select: { companyName: true } },
        },
      });
      if (jobs.length === 0) continue;

      const jobSummaries = jobs.map((j) => ({
        title: j.title,
        company: j.employer.companyName,
        location: j.location,
      }));
      const jobListText = jobSummaries
        .map((j) => `${j.title} at ${j.company}`)
        .join('; ');

      await createNotification({
        userId: member.id,
        type: 'job_match',
        // One summary embed per run below; per-member posts hit Discord's 30/min limit.
        notifyOperator: false,
        title: `${jobs.length} new job${jobs.length === 1 ? '' : 's'} match your program`,
        body: `New this week: ${jobListText}.`,
        data: { link: '/dashboard/jobs', jobIds: jobs.map((j) => j.id) },
      });

      notificationsCreated++;
      if (member.email) {
        const delivery = await emailPacer.run(() => sendJobAlertDigestEmail({
          to: member.email,
          firstName: (member.fullName ?? '').trim().split(/\s+/)[0] || 'there',
          jobs: jobSummaries,
        }));
        if (delivery.ok) emailsAccepted++;
        else if ('skipped' in delivery && delivery.skipped) emailsSkipped++;
        else emailFailures++;
      }
    } catch (err) {
      captureApiError(err, { route: 'cron/job-alerts', extra: { userId: member.id } });
    }
  }

  if (notificationsCreated > 0) {
    await notifyDiscord({
      title: 'Job alert digests sent',
      body: `${notificationsCreated} member${notificationsCreated === 1 ? '' : 's'} notified of new matching jobs (${emailsAccepted} emails accepted, ${emailFailures} failed).`,
      category: 'job_match',
      fields: [{ name: 'cron', value: 'job-alerts' }],
    });
  }

  const runResult = {
    ok: true,
    checkedAt: new Date().toISOString(),
    candidatesChecked: candidates.length,
    notificationsCreated,
    emailsAccepted,
    emailsSkipped,
    emailFailures,
    sinceIso: since.toISOString(),
    emailPacing: emailPacer.summary(),
  };
  await setCronRecordsProcessed(notificationsCreated);
  await logCronRun(JOB_NAME, runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
