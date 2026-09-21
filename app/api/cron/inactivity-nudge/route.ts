import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendInactiveNudgeEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { filterNudgeEligibleUserIds, recordNudgeSent } from '@/lib/cron/nudgeThrottle';
import { createNotification } from '@/lib/notifications/create';
import { notifyDiscord } from '@/lib/notify/discord';
import { CRON_NUDGE_CANDIDATE_CAP } from '@/lib/cron/cronCaps';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;
/**
 * POST /api/cron/inactivity-nudge
 *
 * Sends a re-engagement nudge to members who have been inactive
 * for 14+ days. Capped per run to avoid spam. Secured by CRON_SECRET.
 * Shares a 7-day cross-cron cooldown (via `MemberNudgeLog`) with
 * inactive-nudge and course-accountability — see lib/cron/nudgeThrottle.ts.
 *
 * Deploy with Vercel Cron: schedule "0 10 * * 3" (Wednesday 10AM UTC)
 */
async function handle(_req: NextRequest) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);


  // Recipient is anyone with at least one row in `course_enrollments`
  // (covers multi-program users whose `enrolledProgram` may be null), OR
  // who still has the legacy `enrolledProgram` pointer set (covers
  // unmigrated single-program users). Anti-join replaces the old
  // `take: 100` active-user scan, which could misclassify members as
  // inactive once more than 100 people had recent events.
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { courseEnrollments: { some: {} } },
        { enrolledProgram: { not: null } },
      ],
      notificationsReminders: true,
      memberEvents: { none: { createdAt: { gte: fourteenDaysAgo } } },
    },
    select: { id: true, email: true, fullName: true, enrolledProgram: true, enrolledAt: true },
    take: CRON_NUDGE_CANDIDATE_CAP,
    orderBy: { enrolledAt: 'asc' },
  });

  // Shared cross-cron cooldown: skip anyone nudged by ANY of these crons in
  // the last 7 days (one shared query, not per-cron logic).
  const eligibleUserIds = await filterNudgeEligibleUserIds(candidates.map((m) => m.id));
  const members = candidates.filter((m) => eligibleUserIds.has(m.id));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const member of members) {
    try {
      const delivery = await emailPacer.run(() => sendInactiveNudgeEmail({
        to: member.email,
        fullName: member.fullName ?? member.email,
      }));
      if (!delivery.ok) {
        if ('skipped' in delivery && delivery.skipped) { skipped++; continue; }
        failed++;
        continue;
      }
      sent++;

      await recordNudgeSent({ userId: member.id, tier: 'yellow', kind: 'inactivity' });

      await createNotification({
        userId: member.id,
        type: 'nudge',
        // One summary embed per run below; per-member posts hit Discord's 30/min limit.
        notifyOperator: false,
        // Fortnightly cadence: refresh the unread nudge instead of stacking
        // an identical row every run.
        dedupeUnread: true,
        title: "We haven't seen you in a while",
        body: "It's been two weeks — let's get you back on track with your training.",
        data: { link: '/dashboard' },
      });
    } catch (e) {
      captureApiError(e, { route: 'cron/inactivity-nudge', extra: { userId: member.id } });
      failed++;
    }
  }

  if (sent > 0) {
    await notifyDiscord({
      title: 'Two-week inactivity nudges sent',
      body: `${sent} member${sent === 1 ? '' : 's'} nudged this run (${skipped} skipped, ${failed} failed).`,
      category: 'nudge',
      fields: [{ name: 'cron', value: 'inactivity-nudge' }],
    });
  }

  const runResult = { ok: failed === 0, sent, skipped, failed, total: members.length, emailPacing: emailPacer.summary() };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_inactivity_nudge', runResult, failed > 0 ? 'error' : 'ok');
  return NextResponse.json(runResult, { status: failed > 0 ? 503 : 200 });
}

export const GET = withCronLogging('cron_inactivity_nudge', handle);
export const POST = withCronLogging('cron_inactivity_nudge', handle);
