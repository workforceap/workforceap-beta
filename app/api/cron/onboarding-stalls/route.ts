import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendOnboardingStallsDigestEmail } from '@/lib/email';
import { isFixtureEmailRecipient } from '@/lib/email/send';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { sendMemberStallNudges } from '@/lib/cron/onboardingStallNudges';
import { WIOA_AWAITING_REVIEW_STATUSES, WIOA_QUEUE_AGE_ALERT_DAYS, oldestWioaWaitDays } from '@/lib/wioa/wioaQueueAge';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

const JOB_NAME = 'cron_onboarding_stalls';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALL_DAYS = 5;
const NO_PROGRAM_DAYS = 7;
const MAX_NAMED_PER_BUCKET = 10;

const INTERVIEW_QUEUE_LINK = '/admin/members/interview-ready';
const WIOA_QUEUE_LINK = '/admin/wioa-screening';
const MEMBERS_QUEUE_LINK = '/admin/members';

type NamedMember = { id: string; fullName: string | null; email: string | null };

function toNamedMember(m: { id: string; fullName: string | null; email: string | null }): NamedMember {
  return { id: m.id, fullName: m.fullName, email: m.email };
}

/**
 * Weekly onboarding-stall digest (Tuesdays 15:30 — see vercel.json).
 *
 * Surfaces three places applicants/members get stuck between applying and
 * starting training where nobody is automatically pinged, modeled on
 * cron/applicant-followup's "one staff digest, not per-member spam" shape:
 *
 *  - Interview requested but never completed (5+ days).
 *  - WIOA screening stuck in pending/in_review (5+ days since last update —
 *    there's no dedicated "submitted at" timestamp, so `updatedAt` is the
 *    best queryable proxy without a schema change).
 *  - No program selected, no active counselor assignment, and the account
 *    is 7+ days old (the classic "signed up, then nothing" stall).
 *
 * One digest notification (type 'task_assigned') per admin + one staff
 * email listing counts and up to 10 named members per bucket, linking to
 * the relevant admin queue.
 *
 * WAP-92: after the staff digest, the same buckets feed the member-side
 * nudges in lib/cron/onboardingStallNudges.ts (one email per member per
 * bucket, ever; shared 7-day cross-cron cooldown). That path is OFF unless
 * `MEMBER_STALL_NUDGES_ENABLED=true` — see the module for the guard rails.
 *
 * WAP-166 item 2: the digest also names the oldest screening still awaiting
 * review ("oldest pending WIOA screening: N days"), measured from the
 * member's `submittedAt` in `wioa_qualification_json` across every
 * pending/in_review row — not only the `updatedAt`-stalled bucket above,
 * since a profile edit resets that proxy while the member keeps waiting.
 */
async function handle(_request: Request) {
  const now = new Date();
  const stallThreshold = new Date(now.getTime() - STALL_DAYS * MS_PER_DAY);
  const noProgramThreshold = new Date(now.getTime() - NO_PROGRAM_DAYS * MS_PER_DAY);

  const [interviewStalled, wioaStalled, noProgramCandidates, wioaAwaitingReview] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        interviewEligible: true,
        interviewRequestedAt: { not: null, lte: stallThreshold },
        interviewCompletedAt: null,
      },
      select: { id: true, fullName: true, email: true, interviewRequestedAt: true },
      orderBy: { interviewRequestedAt: 'asc' },
      take: 500,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        wioaReviewStatus: { in: ['pending', 'in_review'] },
        updatedAt: { lte: stallThreshold },
      },
      select: { id: true, fullName: true, email: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        enrolledProgram: null,
        createdAt: { lte: noProgramThreshold },
      },
      select: { id: true, fullName: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    // Every screening still waiting on staff, regardless of `updatedAt`, so
    // the oldest wait is measured from submission (see header).
    prisma.user.findMany({
      where: {
        deletedAt: null,
        wioaReviewStatus: { in: [...WIOA_AWAITING_REVIEW_STATUSES] },
      },
      select: { wioaQualificationJson: true, updatedAt: true },
      take: 500,
    }),
  ]);

  const wioaOldestPendingDays = oldestWioaWaitDays(wioaAwaitingReview, now);
  const wioaQueueOverdue = wioaOldestPendingDays !== null && wioaOldestPendingDays >= WIOA_QUEUE_AGE_ALERT_DAYS;

  // Exclude members who already have an active counselor from the
  // "no program" bucket — one batched query rather than N+1 lookups.
  let noProgramStalled: typeof noProgramCandidates = [];
  if (noProgramCandidates.length > 0) {
    const assignments = await prisma.counselorAssignment.findMany({
      where: { memberId: { in: noProgramCandidates.map((m) => m.id) }, active: true },
      select: { memberId: true },
    });
    const assignedIds = new Set(assignments.map((a) => a.memberId));
    noProgramStalled = noProgramCandidates.filter((m) => !assignedIds.has(m.id));
  }

  const interviewCount = interviewStalled.length;
  const wioaCount = wioaStalled.length;
  const noProgramCount = noProgramStalled.length;
  const totalStalled = interviewCount + wioaCount + noProgramCount;

  let notificationsSent = 0;
  let emailSent = false;

  if (totalStalled > 0) {
    const [profileAdmins, userRoleAdmins] = await Promise.all([
      prisma.profile.findMany({
        where: { role: { in: ['admin', 'super_admin'] } },
        select: { userId: true },
      }),
      prisma.userRole.findMany({
        where: { role: { name: 'admin' } },
        select: { userId: true },
      }),
    ]);
    const adminUserIds = Array.from(
      new Set([...profileAdmins.map((p) => p.userId), ...userRoleAdmins.map((r) => r.userId)])
    );
    const adminUsers = adminUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminUserIds }, deletedAt: null },
          select: { id: true, email: true },
        })
      : [];

    const title = `${totalStalled} onboarding stall${totalStalled === 1 ? '' : 's'} need attention`;
    const oldestLine =
      wioaOldestPendingDays !== null
        ? ` Oldest pending WIOA screening: ${wioaOldestPendingDays} day${wioaOldestPendingDays === 1 ? '' : 's'}${wioaQueueOverdue ? ' (over the ' + WIOA_QUEUE_AGE_ALERT_DAYS + '-day threshold)' : ''}.`
        : '';
    const body = `${interviewCount} interview${interviewCount === 1 ? '' : 's'} awaiting completion, ${wioaCount} WIOA screening${wioaCount === 1 ? '' : 's'} pending review, ${noProgramCount} member${noProgramCount === 1 ? '' : 's'} without a program or counselor.${oldestLine}`;

    for (const admin of adminUsers) {
      try {
        await createNotification({
          userId: admin.id,
          type: 'task_assigned',
          title,
          body,
          data: {
            link: MEMBERS_QUEUE_LINK,
            interviewCount,
            wioaCount,
            noProgramCount,
            wioaOldestPendingDays,
          },
        });
        notificationsSent++;
      } catch (err) {
        captureApiError(err, { route: 'cron/onboarding-stalls', extra: { adminUserId: admin.id } });
      }
    }

    // One fixture alias in the admin list must not skip the digest for the
    // real admins (the shared sender skips a send when ANY recipient is a
    // fixture), so drop fixtures here rather than at the envelope.
    const recipientEmails = Array.from(
      new Set(adminUsers.map((a) => a.email?.trim()).filter((e): e is string => !!e))
    ).filter((email) => !isFixtureEmailRecipient(email));
    if (recipientEmails.length > 0) {
      try {
        const result = await sendOnboardingStallsDigestEmail({
          to: recipientEmails,
          interviewCount,
          wioaCount,
          noProgramCount,
          interviewMembers: interviewStalled.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember),
          wioaMembers: wioaStalled.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember),
          wioaOldestPendingDays,
          noProgramMembers: noProgramStalled.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember),
          interviewQueueLink: `${SITE_URL}${INTERVIEW_QUEUE_LINK}`,
          wioaQueueLink: `${SITE_URL}${WIOA_QUEUE_LINK}`,
          membersQueueLink: `${SITE_URL}${MEMBERS_QUEUE_LINK}`,
          memberAdminBaseUrl: `${SITE_URL}${MEMBERS_QUEUE_LINK}`,
        });
        emailSent = result.ok;
      } catch (err) {
        captureApiError(err, { route: 'cron/onboarding-stalls/email' });
      }
    }
  }

  // Member-side nudges run after the staff digest so a slow or paced member
  // batch can never delay the digest. Flag-gated inside; counts only.
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const memberNudges = await sendMemberStallNudges(
    {
      interview: interviewStalled.map(toNamedMember),
      no_program: noProgramStalled.map(toNamedMember),
      wioa: wioaStalled.map(toNamedMember),
    },
    pacer,
  );

  const runResult = {
    ok: true,
    checkedAt: now.toISOString(),
    interviewStalled: interviewCount,
    wioaStalled: wioaCount,
    wioaOldestPendingDays,
    wioaQueueOverdue,
    noProgramStalled: noProgramCount,
    totalStalled,
    notificationsSent,
    emailSent,
    memberNudges,
  };
  await setCronRecordsProcessed(totalStalled);
  await logCronRun(JOB_NAME, runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
