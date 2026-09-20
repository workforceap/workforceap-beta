import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAdminAlertRecipients, sendApplicantAgingDigestEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { APPLICANT_AGING_SCAN_CAP, summarizeApplicationAging } from '@/lib/cron/applicantAging';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

const JOB_NAME = 'cron_applicant_aging_digest';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const QUEUE_LINK = '/admin/command-center';
const MEMBER_ADMIN_BASE = '/admin/members';

/**
 * Weekly staff digest of aging applications (WAP-167; Mondays, see
 * vercel.json). One email to the admin alert inboxes: pending + needs-info
 * applications counted by age bucket, the ten waiting longest with links, and
 * how many of them belong to members who already enrolled (those make the
 * queue look longer than it is). Sends nothing when the queue is empty.
 */
async function handle(_request: Request) {
  const now = new Date();

  const applications = await prisma.application.findMany({
    where: {
      status: { in: ['PENDING', 'NEEDS_INFO'] },
      user: { deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          courseEnrollments: { select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: [{ submittedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: APPLICANT_AGING_SCAN_CAP,
  });

  const summary = summarizeApplicationAging(applications, now);

  let emailSent = false;
  let emailSkipped: string | undefined;
  let recipients = 0;
  if (summary.total > 0) {
    const to = getAdminAlertRecipients();
    recipients = to.length;
    try {
      const result = await sendApplicantAgingDigestEmail({
        to,
        total: summary.total,
        buckets: summary.buckets,
        oldest: summary.oldest,
        enrolledButPending: summary.enrolledButPending,
        queueLink: `${SITE_URL}${QUEUE_LINK}`,
        memberAdminBaseUrl: `${SITE_URL}${MEMBER_ADMIN_BASE}`,
      });
      emailSent = result.ok;
      if (!result.ok) emailSkipped = result.skipped ? result.error : 'send_failed';
    } catch (err) {
      captureApiError(err, { route: 'cron/applicant-aging-digest/email' });
      emailSkipped = 'send_threw';
    }
  }

  const runResult = {
    ok: true,
    checkedAt: now.toISOString(),
    scanned: applications.length,
    scanCapReached: applications.length >= APPLICANT_AGING_SCAN_CAP,
    total: summary.total,
    oldestDays: summary.oldestDays,
    enrolledButPending: summary.enrolledButPending,
    buckets: Object.fromEntries(summary.buckets.map((b) => [b.key, b.count])),
    recipients,
    emailSent,
    ...(emailSkipped ? { emailSkipped } : {}),
  };
  await setCronRecordsProcessed(summary.total);
  await logCronRun(JOB_NAME, runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
