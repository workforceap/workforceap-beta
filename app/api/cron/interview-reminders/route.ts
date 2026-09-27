import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { sendInterviewDebriefPromptEmail, sendInterviewPrepReminderEmail } from '@/lib/email';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;
/**
 * Daily: (1) ~24h before nextInterviewDate — prep reminder; (2) ~24h after — debrief prompt.
 * Uses JobApplication.nextInterviewDate. Protected with CRON_SECRET.
 */
async function handle(_request: NextRequest) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const now = new Date();
  const preStart = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const preEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const postStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const postEnd = new Date(now.getTime() - 12 * 60 * 60 * 1000);


  let preSent = 0;
  let postSent = 0;

  try {
    const preRows = await prisma.jobApplication.findMany({
      where: {
        nextInterviewDate: { gte: preStart, lte: preEnd },
        interviewPreReminderSentAt: null,
        user: { deletedAt: null, notificationsReminders: true },
      },
      take: 200,
      orderBy: { nextInterviewDate: 'asc' },
      include: { user: { select: { email: true, fullName: true } } },
    });

    for (const row of preRows) {
      const when = row.nextInterviewDate
        ? row.nextInterviewDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : 'your scheduled time';
      const r = await emailPacer.run(() => sendInterviewPrepReminderEmail({
        to: row.user.email,
        recipientUserId: row.userId,
        firstName: row.user.fullName ?? 'there',
        company: row.company,
        role: row.role,
        interviewWhenLabel: when,
      }));
      if (r.ok) {
        preSent++;
        await prisma.jobApplication.update({
          where: { id: row.id },
          data: { interviewPreReminderSentAt: new Date() },
        });
      }
    }

    const postRows = await prisma.jobApplication.findMany({
      where: {
        nextInterviewDate: { gte: postStart, lte: postEnd },
        interviewPostFollowUpSentAt: null,
        user: { deletedAt: null, notificationsReminders: true },
      },
      take: 200,
      orderBy: { nextInterviewDate: 'asc' },
      include: { user: { select: { email: true, fullName: true } } },
    });

    for (const row of postRows) {
      const r = await emailPacer.run(() => sendInterviewDebriefPromptEmail({
        to: row.user.email,
        recipientUserId: row.userId,
        firstName: row.user.fullName ?? 'there',
        company: row.company,
        role: row.role,
      }));
      if (r.ok) {
        postSent++;
        await prisma.jobApplication.update({
          where: { id: row.id },
          data: { interviewPostFollowUpSentAt: new Date() },
        });
      }
    }
  } catch (err) {
    captureApiError(err, { route: 'cron/interview-reminders' });
    await logCronRun('cron_interview_reminders', { ok: false, error: String(err) });
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 });
  }

  const runResult = { ok: true, checkedAt: now.toISOString(), preSent, postSent, emailPacing: emailPacer.summary() };
  await setCronRecordsProcessed(preSent + postSent);
  await logCronRun('cron_interview_reminders', runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_interview_reminders', handle);
