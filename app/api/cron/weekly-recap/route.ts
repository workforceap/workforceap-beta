import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendWeeklyRecapEmail } from '@/lib/email';
import { buildWeeklyRecapEmailSummary } from '@/lib/recap/buildWeeklyRecapEmailSummary';
import { generateWeeklyRecaps } from '@/lib/recap/generate';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;
import { getWeeklyRecapCronStatus } from './_weeklyRecapCronStatus';


// One shared deadline covers selection, generation, pacing, and provider retries.

/**
 * GET /api/cron/weekly-recap
 *
 * Sends weekly recap emails to all active members who have not
 * received one this week. Secured by CRON_SECRET header.
 *
 * Deploy with Vercel Cron: schedule "0 18 * * 0" (Sunday 6PM UTC). Requires
 * `CRON_SECRET` in project env (Vercel invokes the route with that bearer token).
 *
 * Or trigger manually from admin at /admin/weekly-recap.
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const requestDeadlineAtMs = emailPacer.deadlineAtMs;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  // Get active members who have not had a recap opened this week.
  // Recipient is anyone with at least one row in `course_enrollments`
  // (multi-program members may not have `enrolledProgram` set), OR who
  // still has the legacy `enrolledProgram` denormalized pointer set
  // (covers unmigrated single-program users).
  const members = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { courseEnrollments: { some: {} } },
        { enrolledProgram: { not: null } },
      ],
      // A generated recap is not delivered until emailedAt is set. Failed or
      // deadline-skipped persisted rows therefore remain eligible on the next run.
      weeklyRecaps: {
        none: {
          weekStartDate: { gte: weekStart },
          emailedAt: { not: null },
        },
      },
    },
    select: { id: true, email: true, fullName: true, enrolledProgram: true },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let skipReason:
    | 'pacing_budget_exhausted'
    | 'request_deadline_exhausted'
    | 'fixture_recipient'
    | 'suppressed_recipient'
    | 'provider_rate_limited'
    | undefined;

  // Generated rows remain retryable until a provider-accepted send sets emailedAt.
  const recaps = await generateWeeklyRecaps(members, weekStart);
  const recapByUserId = new Map(recaps.map((r) => [r.userId, r.recapData]));
  const waitForSendSlot = emailPacer.waitForSendSlot;

  for (const [index, member] of members.entries()) {
    try {
      const recapData = recapByUserId.get(member.id) as Parameters<typeof buildWeeklyRecapEmailSummary>[0] | undefined;
      if (!recapData) { failed++; continue; }

      const recapSummary = buildWeeklyRecapEmailSummary(recapData);
      const pace = await waitForSendSlot();
      if (!pace.ok) {
        skipped += members.length - index;
        skipReason = pace.reason;
        break;
      }

      const result = await sendWeeklyRecapEmail({
        to: member.email,
        fullName: member.fullName ?? member.email,
        recapSummary,
        idempotencyKey: `weekly-recap:${member.id}:${weekStart.toISOString().slice(0, 10)}`,
        deadlineAtMs: requestDeadlineAtMs,
      });

      // sendWeeklyRecapEmail catches Resend failures internally and
      // returns `{ ok: false }` rather than throwing. Without this
      // check the previous version booked every recipient as `sent`,
      // making the metric meaningless and hiding deliverability
      // regressions from the cron dashboard.
      if (result?.ok === false) {
        if (result.skipped) {
          skipped++;
          skipReason = result.error === 'suppressed_recipient' ? 'suppressed_recipient' : 'fixture_recipient';
          continue;
        }
        // Resend 10 rps (and overlapping bulk crons) can still trip after
        // retries. Abort the remainder as skipped so recipients stay eligible
        // next run and we do not spam Sentry (JAVASCRIPT-NEXTJS-1J).
        if (result.rateLimited) {
          skipped += members.length - index;
          skipReason = 'provider_rate_limited';
          break;
        }
        captureApiError(new Error(result.error ?? 'sendWeeklyRecapEmail failed'), {
          route: 'cron/weekly-recap',
          extra: { userId: member.id },
        });
        failed++;
      } else {
        await prisma.weeklyRecap.update({
          where: { userId_weekStartDate: { userId: member.id, weekStartDate: weekStart } },
          data: { emailedAt: new Date() },
        });
        // Do not set openedAt here — that field means the member opened the recap in the portal.
        sent++;
      }
    } catch (e) {
      captureApiError(e, { route: 'cron/weekly-recap', extra: { userId: member.id } });
      failed++;
    }
  }

  const runResult = {
    sent,
    failed,
    total: members.length,
    ...(skipped > 0 ? { skipped, skipReason } : {}),
  };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_weekly_recap', runResult, getWeeklyRecapCronStatus(failed, skipped));
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_weekly_recap', handle);
export const POST = withCronLogging('cron_weekly_recap', handle);
