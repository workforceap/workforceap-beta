import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendEmployerPendingApplicantsEmail, sendAdminStaleApplicantsDigestEmail, getAdminAlertRecipients } from '@/lib/email';
import { isFixtureEmailRecipient } from '@/lib/email/send';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { operationalMemberWhere, cappedQueue, OPERATIONAL_QUEUE_CAP, employerResponseWaitStartedAt } from '@/lib/cron/operationalQueue';
import { queueDigest, loadQueueDigestHistory } from '@/lib/cron/queueDigest';

export const maxDuration = 300;
const JOB_NAME = 'cron_employer_pending_applicants';
const ADMIN_DIGEST_THRESHOLD = 10;
const STALE_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tuesday reminders for real members awaiting a recorded employer response.
 * Staff/QA/deleted/inactive applicants and unapproved/deleted employers are
 * excluded before the cap. Draft/pending jobs have no published applicant
 * queue; closed/filled posts can still have applications needing a response.
 * A status change or employer message starts a new wait. Same-day queue-state
 * dedup keeps successful notification and email history independent.
 */
async function handle(_request: Request) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_DAYS * MS_PER_DAY);
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const rows = await prisma.jobPostingApplication.findMany({
    where: {
      status: { in: ['pending', 'reviewing'] }, appliedAt: { lte: staleCutoff },
      AND: [
        { OR: [{ statusUpdatedAt: null }, { statusUpdatedAt: { lte: staleCutoff } }] },
        { OR: [{ lastEmployerMessageAt: null }, { lastEmployerMessageAt: { lte: staleCutoff } }] },
      ],
      student: operationalMemberWhere({ includePlaced: true }),
      job: { status: { in: ['approved', 'live', 'filled', 'closed'] }, employer: { status: 'active', user: { deletedAt: null } } },
    },
    select: {
      id: true, studentId: true, jobId: true, status: true, appliedAt: true, statusUpdatedAt: true, lastEmployerMessageAt: true,
      student: { select: { organizationId: true } },
      job: { select: { organizationId: true, employerId: true, employer: { select: {
        organizationId: true, userId: true, companyName: true, contactEmail: true,
        user: { select: { organizationId: true, email: true } },
      } } } },
    },
    orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }], take: OPERATIONAL_QUEUE_CAP + 1,
  });
  const queue = cappedQueue(rows);
  type Application = (typeof queue.rows)[number];
  type Employer = Application['job']['employer'];
  const byEmployer = new Map<string, { employer: Employer; applications: Application[] }>();
  let excludedOrganizationMismatch = 0;
  let excludedFixtureEmployer = 0;
  for (const application of queue.rows) {
    const { job } = application;
    const employer = job.employer;
    if (job.organizationId !== employer.organizationId || job.organizationId !== employer.user.organizationId
      || job.organizationId !== application.student.organizationId) { excludedOrganizationMismatch++; continue; }
    if (isFixtureEmailRecipient(employer.user.email)) { excludedFixtureEmployer++; continue; }
    const group = byEmployer.get(job.employerId) ?? { employer, applications: [] };
    group.applications.push(application);
    byEmployer.set(job.employerId, group);
  }

  const plans = [...byEmployer].map(([employerId, { employer, applications }]) => {
    const candidateCount = new Set(applications.map((application) => application.studentId)).size;
    const jobsAffected = new Set(applications.map((application) => application.jobId)).size;
    const waitStarted = Math.min(...applications.map((application) => employerResponseWaitStartedAt(application).getTime()));
    const oldestWaitingDays = Math.max(0, Math.floor((now.getTime() - waitStarted) / MS_PER_DAY));
    const params = { to: employer.contactEmail, candidateCount, jobsAffected, oldestWaitingDays, truncated: queue.truncated };
    const state = { applications: applications.map((application) => [application.id, application.status, application.statusUpdatedAt?.toISOString() ?? null,
      application.lastEmployerMessageAt?.toISOString() ?? null]).sort(), truncated: queue.truncated };
    const digest = queueDigest({ workflow: JOB_NAME, scope: employerId, recipients: [employer.contactEmail], state,
      payload: params, userId: employer.userId }, now);
    return { employer, candidateCount, jobsAffected, oldestWaitingDays, digest, params };
  });
  const history = await loadQueueDigestHistory(plans.map((plan) => plan.digest));
  let employersNotified = 0;
  let notificationsFailed = 0;
  let employerEmailsSent = 0;
  let emailsSkippedDuplicate = 0;
  let emailsSkipped = 0;
  let emailsFailed = 0;

  for (const plan of plans) {
    const { employer, candidateCount, jobsAffected, oldestWaitingDays, digest, params } = plan;
    if (!history.notified.has(employer.userId)) {
      try {
        await createNotification({
          userId: employer.userId, type: 'task_assigned',
          title: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} waiting on ${jobsAffected} of your job post${jobsAffected === 1 ? '' : 's'}`,
          body: `${queue.truncated ? 'The longest observed wait in this scan' : 'The longest wait since an application or recorded employer response'} is ${oldestWaitingDays} day${oldestWaitingDays === 1 ? '' : 's'}. Review your applicants to keep candidates engaged.${queue.truncated ? ' Queue scan capped; open your applicants for the full backlog.' : ''}`,
          data: { link: '/employer/applications', queueDigestKey: digest.key }, dedupeUnread: true,
        });
        employersNotified++;
      } catch (error) {
        notificationsFailed++;
        captureApiError(error, { route: 'cron/employer-pending-applicants/notification' });
      }
    }
    if (history.emailed.has(digest.key)) { emailsSkippedDuplicate++; continue; }
    if (!employer.contactEmail.trim() || isFixtureEmailRecipient(employer.contactEmail)) { emailsSkipped++; continue; }
    try {
      const result = await emailPacer.run(() => sendEmployerPendingApplicantsEmail({ ...params, ...digest }));
      if (result.ok) employerEmailsSent++;
      else if (result.skipped) emailsSkipped++;
      else emailsFailed++;
    } catch (err) {
      emailsFailed++;
      captureApiError(err, { route: 'cron/employer-pending-applicants/email' });
    }
  }

  const employers = plans.filter((plan) => plan.candidateCount >= ADMIN_DIGEST_THRESHOLD)
    .map((plan) => ({ companyName: plan.employer.companyName, candidateCount: plan.candidateCount }));
  let adminDigestSent = false;
  let adminDigestSkippedDuplicate = false;
  if (employers.length > 0) {
    // The established admin-alert wrapper owns this internal recipient list.
    const digest = queueDigest({ workflow: JOB_NAME + '_admin', scope: 'staff_alert', recipients: getAdminAlertRecipients(),
      state: plans.filter((plan) => plan.candidateCount >= ADMIN_DIGEST_THRESHOLD).map((plan) => plan.digest.key).sort(),
      payload: { employers, truncated: queue.truncated }, }, now);
    const adminHistory = await loadQueueDigestHistory([digest]);
    if (adminHistory.emailed.has(digest.key)) adminDigestSkippedDuplicate = true;
    else {
      try {
        const result = await emailPacer.run(() => sendAdminStaleApplicantsDigestEmail({ employers, truncated: queue.truncated, ...digest }));
        adminDigestSent = result.ok;
        if (!result.ok && !result.skipped) emailsFailed++;
        else if (result.skipped) emailsSkipped++;
      } catch (err) {
        emailsFailed++;
        captureApiError(err, { route: 'cron/employer-pending-applicants/admin-digest' });
      }
    }
  }

  const oldestScannedEmployerResponseDays = plans.length ? Math.max(...plans.map((plan) => plan.oldestWaitingDays)) : null;
  const runResult = {
    ok: emailsFailed === 0 && notificationsFailed === 0, checkedAt: now.toISOString(), staleGroups: plans.reduce((count, plan) => count + plan.jobsAffected, 0),
    staleApplications: [...byEmployer.values()].reduce((count, group) => count + group.applications.length, 0),
    // Existing notification helper swallows DB failures; resolved calls are
    // attempts, while only observed notification rows prove persistence.
    employersNotified, notificationsFailed, notificationAccounting: 'helper_resolved_attempts', employerEmailsSent, emailsSkippedDuplicate, emailsSkipped, emailsFailed,
    adminDigestSent, adminDigestSkippedDuplicate, employersOverThreshold: employers.length, queueTruncated: queue.truncated,
    excludedOrganizationMismatch, excludedFixtureEmployer,
    oldestEmployerResponseDays: queue.truncated ? null : oldestScannedEmployerResponseDays, oldestScannedEmployerResponseDays,
    emailPacing: emailPacer.summary(),
  };
  await setCronRecordsProcessed(employersNotified);
  await logCronRun(JOB_NAME, runResult, runResult.ok ? 'ok' : 'error');
  return NextResponse.json(runResult, { status: runResult.ok ? 200 : 500 });
}
export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
