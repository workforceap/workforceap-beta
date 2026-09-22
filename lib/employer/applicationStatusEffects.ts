import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { captureApiError } from '@/lib/observability/captureApiError';
import { recordPlacementFromApplication } from '@/lib/placement/recordPlacementFromApplication';

const APPLICATION_STATUS_MESSAGE: Record<string, { title: string; body: (jobTitle: string) => string }> = {
  interview: {
    title: 'You have an interview request',
    body: (jobTitle) => `The employer wants to move forward on your application for ${jobTitle}. Check the details and respond.`,
  },
  offered: {
    title: "You've got an offer",
    body: (jobTitle) => `Congratulations — you were offered the ${jobTitle} position. Review the details.`,
  },
  hired: {
    title: "You're hired!",
    body: (jobTitle) => `Congratulations on being hired for ${jobTitle}! Your counselor has been notified to help with onboarding.`,
  },
  rejected: {
    title: 'Update on your application',
    body: (jobTitle) => `The employer moved forward with another candidate for ${jobTitle}. Keep going — we've got more matched jobs waiting for you.`,
  },
};

/**
 * Shared side-effects for every route that writes JobPostingApplication.status
 * (app/api/employer/applications/[id]/route.ts and
 * app/api/employer/jobs/[id]/applicants/route.ts are the two writers as of
 * 2026-07 — grep `jobPostingApplication.update` before adding a third).
 *
 * Notifies the member on interview/offered/hired/rejected, and on 'hired'
 * stands up a PlacementRecord so the 30/60/90-day retention-survey pipeline
 * (lib/cron/placement-surveys.ts) and funder outcome reports pick up the
 * placement. Previously an employer marking an application 'hired' had zero
 * downstream effect — placements only existed if a counselor/admin
 * remembered to type one in manually. The record itself is written by
 * lib/placement/recordPlacementFromApplication.ts, shared with the member's
 * own confirm-offer action so both sides of a hire land on one row.
 */
export async function notifyAndRecordPlacement(args: {
  applicationId: string;
  studentId: string;
  employerId: string;
  nextStatus: string;
}): Promise<void> {
  const { applicationId, studentId, employerId, nextStatus } = args;
  const copy = APPLICATION_STATUS_MESSAGE[nextStatus];
  if (!copy) return;

  const application = await prisma.jobPostingApplication.findUnique({
    where: { id: applicationId },
    select: { job: { select: { title: true } } },
  });
  const jobTitle = application?.job.title ?? 'the role you applied to';

  await createNotification({
    userId: studentId,
    type: 'application_update',
    title: copy.title,
    body: copy.body(jobTitle),
    data: { link: '/dashboard/jobs', applicationId },
  });

  if (nextStatus !== 'hired') return;

  try {
    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { companyName: true, userId: true },
    });

    // Shared with the member's confirm-offer action
    // (app/(portal)/dashboard/placementAction.ts). PlacementRecord.userId is
    // @unique — one row per member — so a retry, a counselor-entered row or
    // a hire the member already self-reported all land on the same row:
    // 'created' stands a new unverified row up, 'corroborated' confirms the
    // member's self-report in place, 'unchanged' leaves staff-owned or
    // verified data alone. The helper writes the audit row, awards the
    // points and notifies the member and their counselor.
    const { outcome } = await recordPlacementFromApplication({
      userId: studentId,
      employerName: employer?.companyName ?? 'Unknown employer',
      jobTitle,
      source: 'employer_hired',
      applicationId,
      actorUserId: employer?.userId ?? null,
    });
    if (outcome === 'unchanged') return;

    // Congratulate the employer and nudge them toward their next hire. Inside
    // the same fail-soft try/catch — a notification hiccup must never fail
    // the employer's application status update.
    if (employer?.userId) {
      await createNotification({
        userId: employer.userId,
        type: 'placement',
        title: 'Great hire! Post your next role',
        body: `Congratulations on your hire${jobTitle ? ` for ${jobTitle}` : ''}! Ready to fill another position?`,
        data: { link: '/employer/jobs/new' },
      });
    }
  } catch (err) {
    // Notification/placement bookkeeping must never fail the employer's
    // status update — the application PATCH already succeeded.
    captureApiError(err, { route: 'employer/applications-status-effects', extra: { studentId, stage: 'auto-placement' } });
  }
}
