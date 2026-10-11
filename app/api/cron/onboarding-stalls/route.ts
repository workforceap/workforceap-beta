import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendOnboardingStallsDigestEmail } from '@/lib/email';
import { isFixtureEmailRecipient } from '@/lib/email/send';
import { hasAdminAccess, hasSuperAdminAccess, resolveEffectiveRole } from '@/lib/auth/roleAccess';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { sendMemberStallNudges } from '@/lib/cron/onboardingStallNudges';
import { operationalMemberWhere, cappedQueue, OPERATIONAL_QUEUE_CAP } from '@/lib/cron/operationalQueue';
import { queueDigest, loadQueueDigestHistory } from '@/lib/cron/queueDigest';
import { WIOA_AWAITING_REVIEW_STATUSES, WIOA_QUEUE_AGE_ALERT_DAYS, oldestWioaWaitDays, wioaDaysWaiting } from '@/lib/wioa/wioaQueueAge';

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
const toNamedMember = (member: NamedMember): NamedMember => ({ id: member.id, fullName: member.fullName, email: member.email });
const memberSelect = { id: true, fullName: true, email: true, organizationId: true } as const;

/**
 * Tuesday staff digest of active members under the established roster/fixture
 * policy. Canonical enrollment and counselor exclusions happen before the cap.
 * WIOA age uses the existing submittedAt helper (updatedAt is only a fallback).
 * Org admins receive their organization; platform super admins receive all.
 * Same-day unchanged queue reminders are deduped separately by app persistence
 * and provider acceptance, so failures remain retryable. Member nudges retain
 * their independent opt-in flag, member filter and existing nudge ledgers.
 */
async function handle(_request: Request) {
  const now = new Date();
  const stallThreshold = new Date(now.getTime() - STALL_DAYS * MS_PER_DAY);
  const noProgramThreshold = new Date(now.getTime() - NO_PROGRAM_DAYS * MS_PER_DAY);
  const population = operationalMemberWhere();
  const [interviewRows, wioaRows, noProgramRows] = await Promise.all([
    prisma.user.findMany({
      where: { ...population, interviewEligible: true, interviewRequestedAt: { not: null, lte: stallThreshold }, interviewCompletedAt: null },
      select: { ...memberSelect, interviewRequestedAt: true },
      orderBy: [{ interviewRequestedAt: 'asc' }, { id: 'asc' }], take: OPERATIONAL_QUEUE_CAP + 1,
    }),
    prisma.user.findMany({
      where: { ...population, wioaReviewStatus: { in: [...WIOA_AWAITING_REVIEW_STATUSES] } },
      select: { ...memberSelect, wioaQualificationJson: true, wioaReviewStatus: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: OPERATIONAL_QUEUE_CAP + 1,
    }),
    prisma.user.findMany({
      where: {
        ...population, enrolledProgram: null, courseEnrollments: { none: {} },
        counselorAssignments: { none: { active: true } }, createdAt: { lte: noProgramThreshold },
      },
      select: { ...memberSelect, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: OPERATIONAL_QUEUE_CAP + 1,
    }),
  ]);
  const interviewQueue = cappedQueue(interviewRows);
  // Keep the oldest observed submission in the sample, including the lookahead
  // row. A capped updatedAt scan still cannot prove the full queue's oldest age.
  const wioaQueue = cappedQueue(wioaRows.sort((a, b) => (wioaDaysWaiting(b, now) ?? -1) - (wioaDaysWaiting(a, now) ?? -1)));
  const noProgramQueue = cappedQueue(noProgramRows);
  const interviewStalled = interviewQueue.rows;
  const wioaAwaitingReview = wioaQueue.rows;
  const wioaStalled = wioaAwaitingReview.filter((member) => (wioaDaysWaiting(member, now) ?? -1) >= STALL_DAYS)
    .sort((a, b) => (wioaDaysWaiting(b, now) ?? -1) - (wioaDaysWaiting(a, now) ?? -1));
  const noProgramStalled = noProgramQueue.rows;
  const queueTruncated = { interview: interviewQueue.truncated, wioa: wioaQueue.truncated, noProgram: noProgramQueue.truncated };
  const truncated = Object.values(queueTruncated).some(Boolean);
  const wioaOldestScannedPendingDays = oldestWioaWaitDays(wioaAwaitingReview, now);
  const wioaOldestPendingDays = queueTruncated.wioa ? null : wioaOldestScannedPendingDays;
  const wioaQueueOverdue = wioaOldestScannedPendingDays !== null && wioaOldestScannedPendingDays >= WIOA_QUEUE_AGE_ALERT_DAYS
    ? true : queueTruncated.wioa ? null : false;
  const interviewCount = interviewStalled.length;
  const wioaCount = wioaStalled.length;
  const noProgramCount = noProgramStalled.length;
  const totalStalled = interviewCount + wioaCount + noProgramCount;
  let notificationsSent = 0;
  let notificationsFailed = 0;
  let digestEmailsSent = 0;
  let digestsSkippedDuplicate = 0;
  let emailFailed = 0;
  let emailSkipped = 0;
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });

  if (totalStalled > 0) {
    const admins = await prisma.user.findMany({
      where: { deletedAt: null, OR: [
        { profile: { role: { in: ['admin', 'super_admin'] } } },
        { userRoles: { some: { role: { name: { in: ['admin', 'super_admin'] } } } } },
      ] },
      select: { id: true, email: true, organizationId: true, profile: { select: { role: true } }, userRoles: { select: { role: { select: { name: true } } } } },
      take: OPERATIONAL_QUEUE_CAP,
    });
    const groups = new Map<string, typeof admins>();
    for (const admin of admins) {
      const roles = admin.userRoles.map((entry) => entry.role.name);
      const role = resolveEffectiveRole({ deletedAt: null, profileRole: admin.profile?.role, userRoleNames: roles }).role;
      if (!hasAdminAccess(role, [])) continue;
      if (!hasSuperAdminAccess(role, []) && !admin.organizationId) continue;
      const scope = hasSuperAdminAccess(role, []) ? 'platform' : `organization/${admin.organizationId}`;
      groups.set(scope, [...(groups.get(scope) ?? []), admin]);
    }

    for (const [scope, staff] of groups) {
      const inScope = <T extends { organizationId: string }>(members: T[]) => scope === 'platform' ? members : members.filter((member) => member.organizationId === scope.slice('organization/'.length));
      const interview = inScope(interviewStalled);
      const wioa = inScope(wioaStalled);
      const noProgram = inScope(noProgramStalled);
      const scopedTotal = interview.length + wioa.length + noProgram.length;
      if (scopedTotal === 0) continue;
      const oldest = queueTruncated.wioa ? null : oldestWioaWaitDays(inScope(wioaAwaitingReview), now);
      const params = {
        interviewCount: interview.length, wioaCount: wioa.length, noProgramCount: noProgram.length,
        interviewMembers: interview.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember),
        wioaMembers: wioa.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember), wioaOldestPendingDays: oldest,
        noProgramMembers: noProgram.slice(0, MAX_NAMED_PER_BUCKET).map(toNamedMember), truncated,
        interviewQueueLink: SITE_URL + INTERVIEW_QUEUE_LINK, wioaQueueLink: SITE_URL + WIOA_QUEUE_LINK,
        membersQueueLink: SITE_URL + MEMBERS_QUEUE_LINK, memberAdminBaseUrl: SITE_URL + MEMBERS_QUEUE_LINK,
      };
      const state = {
        interview: interview.map((member) => member.id).sort(),
        wioa: wioa.map((member) => [member.id, member.wioaReviewStatus]).sort(),
        noProgram: noProgram.map((member) => member.id).sort(), truncated,
      };
      const plans = staff.map((admin) => {
        const email = admin.email.trim().toLowerCase();
        const payload = { ...params, to: [email] };
        const digest = queueDigest({ workflow: JOB_NAME, scope, recipients: [email], state, payload, userId: admin.id }, now);
        return { email, payload, digest };
      });
      const history = await loadQueueDigestHistory(plans.map((plan) => plan.digest));
      const oldestLine = oldest === null ? '' : ` Oldest pending WIOA screening: ${oldest} day${oldest === 1 ? '' : 's'}${oldest >= WIOA_QUEUE_AGE_ALERT_DAYS ? ` (over the ${WIOA_QUEUE_AGE_ALERT_DAYS}-day threshold)` : ''}.`;
      for (const { digest, email, payload } of plans) {
        if (!history.notified.has(digest.userId!)) {
          try {
            await createNotification({
              userId: digest.userId!, type: 'task_assigned', title: `${scopedTotal} onboarding stall${scopedTotal === 1 ? '' : 's'} need attention`,
              body: `${interview.length} interview${interview.length === 1 ? '' : 's'} awaiting completion, ${wioa.length} WIOA screening${wioa.length === 1 ? '' : 's'} pending review, ${noProgram.length} member${noProgram.length === 1 ? '' : 's'} without a program or counselor.${oldestLine}${truncated ? ' Queue scan capped; open the queues for the full backlog.' : ''}`,
              data: { link: MEMBERS_QUEUE_LINK, queueDigestKey: digest.key, interviewCount: interview.length, wioaCount: wioa.length, noProgramCount: noProgram.length, wioaOldestPendingDays: oldest },
              dedupeUnread: true,
            });
            notificationsSent++;
          } catch (error) {
            notificationsFailed++;
            captureApiError(error, { route: 'cron/onboarding-stalls/notification' });
          }
        }
        if (history.emailed.has(digest.key)) { digestsSkippedDuplicate++; continue; }
        if (!email || isFixtureEmailRecipient(email)) { emailSkipped++; continue; }
        try {
          const result = await pacer.run(() => sendOnboardingStallsDigestEmail({ ...payload, ...digest }));
          if (result.ok) digestEmailsSent++;
          else if (result.skipped) emailSkipped++;
          else emailFailed++;
        } catch (err) {
          emailFailed++;
          captureApiError(err, { route: 'cron/onboarding-stalls/email' });
        }
      }
    }
  }

  const memberNudges = await sendMemberStallNudges({
    interview: interviewStalled.map(toNamedMember), no_program: noProgramStalled.map(toNamedMember), wioa: wioaStalled.map(toNamedMember),
  }, pacer);
  const runResult = {
    ok: emailFailed === 0 && notificationsFailed === 0, checkedAt: now.toISOString(), interviewStalled: interviewCount, wioaStalled: wioaCount,
    wioaOldestPendingDays, wioaOldestScannedPendingDays, wioaQueueOverdue, wioaAgeUnknown: wioaAwaitingReview.filter((member) => wioaDaysWaiting(member, now) === null).length,
    noProgramStalled: noProgramCount, noProgramOldestAgeDays: noProgramStalled.length ? Math.floor((now.getTime() - noProgramStalled[0].createdAt.getTime()) / MS_PER_DAY) : null,
    totalStalled, distinctStalledMembers: new Set([...interviewStalled, ...wioaStalled, ...noProgramStalled].map((member) => member.id)).size,
    // Resolved helper calls are attempts, not proof of notification persistence.
    queueTruncated, notificationsSent, notificationsFailed, notificationAccounting: 'helper_resolved_attempts', emailSent: digestEmailsSent > 0, digestEmailsSent, digestsSkippedDuplicate, emailFailed, emailSkipped,
    memberNudges, emailPacing: pacer.summary(),
  };
  await setCronRecordsProcessed(totalStalled);
  await logCronRun(JOB_NAME, runResult, runResult.ok ? 'ok' : 'error');
  return NextResponse.json(runResult, { status: runResult.ok ? 200 : 500 });
}

export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
