import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendCourseAccountabilityEmail } from '@/lib/email';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { logCronRun } from '@/lib/admin/logCronRun';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { filterNudgeEligibleUserIds, recordNudgeSent } from '@/lib/cron/nudgeThrottle';
import { createNotification } from '@/lib/notifications/create';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { persistEvent } from '@/lib/events/track';

export const maxDuration = 300;
/**
 * Day-5 reserved-seat funding update, using the existing scheduled endpoint.
 * Only primary assignments without a recorded funding source and without
 * Coursera enrollment approval are eligible. FundingSource is metadata, not
 * proof of a grant award; this route never claims funding has been approved.
 * Provider progress (including missing progress) is not a funding signal.
 * Prior sends and the shared seven-day outreach cooldown remain in force.
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);


  // Keep the existing 5–7 day send window; funding waits are not evidence
  // that a member failed to start training.
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo, lte: fiveDaysAgo },
      isPrimary: true,
      fundingSource: null,
      user: { deletedAt: null, courseraEnrollmentApproved: false },
    },
    select: {
      id: true,
      userId: true,
      programSlug: true,
      isPrimary: true,
      fundingSource: true,
      user: { select: { email: true, fullName: true, deletedAt: true, courseraEnrollmentApproved: true } },
    },
    take: 500,
  });

  if (enrollments.length === 0) {
    const empty = { sent: 0, scanned: 0, counselorFollowups: 0 };
    await setCronRecordsProcessed(0);
    await logCronRun('cron_course_accountability', empty);
    return NextResponse.json(empty);
  }

  // Bulk lookup of prior sends for these enrollments.
  const enrollmentIds = enrollments.map((e) => e.id);
  const alreadySent = await prisma.memberEvent.findMany({
    where: {
      eventName: 'course_accountability_sent',
      entityType: 'course_enrollment',
      entityId: { in: enrollmentIds },
    },
    select: { entityId: true },
  });
  const sentEnrollmentIds = new Set(alreadySent.map((r) => r.entityId).filter(Boolean) as string[]);

  // Shared cross-cron cooldown: skip anyone nudged by ANY of these crons in
  // the last 7 days (one shared query, not per-cron logic).
  const eligibleUserIds = await filterNudgeEligibleUserIds(
    [...new Set(enrollments.map((e) => e.userId))],
  );

  let sent = 0;
  let counselorFollowups = 0;

  for (const enrollment of enrollments) {
    if (sentEnrollmentIds.has(enrollment.id)) continue;
    if (!enrollment.user?.email) continue;
    // Re-check the selected facts before dispatch; never turn unknown flags
    // or a secondary assignment into a funding-pending notification.
    if (enrollment.isPrimary !== true || enrollment.fundingSource !== null || enrollment.user.deletedAt !== null || enrollment.user.courseraEnrollmentApproved !== false) continue;
    if (!eligibleUserIds.has(enrollment.userId)) continue;

    try {
      const program = getProgramBySlug(enrollment.programSlug);
      const programName = program ? getProgramDisplayTitle(program) : enrollment.programSlug;

      const result = await emailPacer.run(() => sendCourseAccountabilityEmail({
        to: enrollment.user.email,
        fullName: enrollment.user.fullName ?? enrollment.user.email,
        programName,
      }));

      if (result.ok) {
        sent++;
        await persistEvent({
          userId: enrollment.userId,
          eventName: 'course_accountability_sent',
          entityType: 'course_enrollment',
          entityId: enrollment.id,
          metadata: { programSlug: enrollment.programSlug, programName },
        }, prisma)
          .catch(() => { /* non-fatal */ });

        await recordNudgeSent({ userId: enrollment.userId, tier: 'yellow', kind: 'funding_update' });

        await createNotification({
          userId: enrollment.userId,
          type: 'nudge',
          title: `Your ${programName} training seat is reserved`,
          body: "We are working on funding and enrollment next steps. You will be notified when funding is approved and you can begin classes.",
          data: { link: '/dashboard/program' },
        });

        // Counselor follow-up queue: audit event the counselor view subscribes to.
        await persistEvent({
          userId: enrollment.userId,
          eventName: 'counselor_followup_needed',
          entityType: 'course_enrollment',
          entityId: enrollment.id,
          metadata: {
            reason: 'funding_enrollment_followup',
            programSlug: enrollment.programSlug,
            programName,
          },
        }, prisma)
          .then(() => { counselorFollowups++; })
          .catch(() => { /* non-fatal */ });
      }
    } catch (err) {
      captureApiError(err, {
        route: 'cron/course-accountability',
        extra: { enrollmentId: enrollment.id, userId: enrollment.userId },
      });
    }
  }

  const runResult = {
    sent,
    scanned: enrollments.length,
    counselorFollowups,
    emailPacing: emailPacer.summary(),
  };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_course_accountability', runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_course_accountability', handle);
export const POST = withCronLogging('cron_course_accountability', handle);
