import { NextResponse } from 'next/server';
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
import { persistEvent } from '@/lib/events/track';

export const maxDuration = 300;
/**
 * Cron endpoint to send inactive member nudge emails.
 * Weekly nudge to members inactive for 7+ days.
 * Runs Monday 10 AM UTC. Deduplicates against memberEvents from the
 * last 7 days so no one receives more than one nudge per week, AND against
 * `MemberNudgeLog` so a member doesn't also get double-nudged by
 * inactivity-nudge / course-accountability in the same window (see
 * lib/cron/nudgeThrottle.ts).
 * Secured with CRON_SECRET.
 *
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);


  // Anti-join instead of unbounded groupBy + notIn: one capped user scan.
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      notificationsReminders: true,
      AND: [
        { memberEvents: { none: { createdAt: { gte: sevenDaysAgo } } } },
        { memberEvents: { none: { eventName: 'inactive_nudge_sent', createdAt: { gte: sevenDaysAgo } } } },
      ],
    },
    select: { id: true, email: true, fullName: true },
    take: CRON_NUDGE_CANDIDATE_CAP,
  });

  // Shared cross-cron cooldown: skip anyone nudged by ANY of these crons in
  // the last 7 days (one shared query, not per-cron logic).
  const eligibleUserIds = await filterNudgeEligibleUserIds(candidates.map((m) => m.id));
  const members = candidates.filter((m) => eligibleUserIds.has(m.id));

  let sent = 0;
  let skipped = 0;
  for (const member of members) {
    try {
      const result = await emailPacer.run(() => sendInactiveNudgeEmail({
        to: member.email,
        fullName: member.fullName,
      }));
      if (!result.ok && 'skipped' in result && result.skipped) {
        skipped++;
        continue;
      }
      if (result.ok) {
        sent++;
        // Record that we sent a nudge so we don't email again this week.
        await persistEvent({
          userId: member.id,
          eventName: 'inactive_nudge_sent',
          entityType: 'cron',
          metadata: { source: 'inactive-nudge', weekOf: sevenDaysAgo.toISOString() },
        }, prisma).catch(() => { /* non-fatal */ });

        await recordNudgeSent({ userId: member.id, tier: 'yellow', kind: 'inactive' });

        await createNotification({
          userId: member.id,
          type: 'nudge',
          // One summary embed per run below; per-member posts hit Discord's 30/min limit.
          notifyOperator: false,
          title: "We miss you!",
          body: "It's been a week — pick up where you left off in your training plan.",
          data: { link: '/dashboard' },
        });
      }
    } catch (err) {
      captureApiError(err, { route: 'cron/inactive-nudge', extra: { userId: member.id } });
    }
  }

  if (sent > 0) {
    await notifyDiscord({
      title: 'Inactive-member nudges sent',
      body: `${sent} member${sent === 1 ? '' : 's'} nudged this run (${skipped} skipped).`,
      category: 'nudge',
      fields: [{ name: 'cron', value: 'inactive-nudge' }],
    });
  }

  const runResult = {
    ok: true,
    checkedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    eligibleCount: members.length,
    inactiveEmailsSent: sent,
    inactiveEmailsSkipped: skipped,
    emailPacing: emailPacer.summary(),
  };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_inactive_nudge', runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_inactive_nudge', handle);
export const POST = withCronLogging('cron_inactive_nudge', handle);
