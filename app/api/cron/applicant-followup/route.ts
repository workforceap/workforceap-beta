import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendApplicantFollowupEmail, sendAdminPendingApplicantsEmail, sendApplicantChaseEmail } from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { trackEvent } from '@/lib/events/track';
import { eventNameReadCandidates } from '@/lib/events/names';
import {
  APPLICANT_CHASE_EVENT,
  APPLICANT_CHASE_STAGES,
  APPLICATION_ENTITY_TYPE,
  chaseLedgerFromEvents,
  chaseLedgerKey,
  chaseWindow,
  type ApplicantChaseStageId,
} from '@/lib/cron/applicantChase';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;

const ROUTE = 'cron/applicant-followup';
const STAGE_TAKE = 500;

type StaleApplication = {
  id: string;
  user: { id: string; email: string; fullName: string };
};

type StageResult = { matched: number; sent: number; skippedAlreadySent: number; skippedSeen: number; failed: number };

/**
 * Cron endpoint that chases pending applicants at day 3, day 10 and day 20
 * (WAP-167) and pings staff with the count of the fresh (3–6 day) queue.
 * Runs every 3 days (scheduled via Vercel Cron).
 *
 * Dedupe, two layers:
 *  1. Each stage queries a submission window as wide as the cron cadence, so
 *     an application is matched by a stage exactly once as it ages through.
 *  2. Every successful send records an `application_reminder_sent` MemberEvent
 *     with `{ stage }`; a re-run inside a window skips what was already sent.
 *     The ledger read is best-effort: if it fails, the window bound still holds
 *     and the run continues rather than leaving applicants unchased.
 *
 * Nothing older than the day-20 window is emailed automatically: the
 * applicants who aged past that before this shipped are a staff decision.
 * Protected with CRON_SECRET header.
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const now = new Date();

  const matches = new Map<ApplicantChaseStageId, StaleApplication[]>();
  for (const stage of APPLICANT_CHASE_STAGES) {
    const rows = await prisma.application.findMany({
      where: {
        status: 'PENDING',
        submittedAt: chaseWindow(stage, now),
        user: { deletedAt: null, notificationsReminders: true },
      },
      take: STAGE_TAKE,
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });
    matches.set(stage.stage, rows);
  }

  const allApplicationIds = [...matches.values()].flat().map((app) => app.id);
  let ledger = new Set<string>();
  let ledgerAvailable = true;
  if (allApplicationIds.length > 0) {
    try {
      const events = await prisma.memberEvent.findMany({
        where: {
          eventName: { in: eventNameReadCandidates(APPLICANT_CHASE_EVENT) },
          entityType: APPLICATION_ENTITY_TYPE,
          entityId: { in: allApplicationIds },
        },
        select: { entityId: true, metadata: true },
      });
      ledger = chaseLedgerFromEvents(events);
    } catch (err) {
      ledgerAvailable = false;
      captureApiError(err, { route: ROUTE, extra: { phase: 'chase_ledger' } });
    }
  }

  // No response-date promise in these emails (2026-09-19): the queue does
  // not clear in five business days, so the copy only says a counselor
  // will email once the application is reviewed.

  let applicantEmailsSent = 0;
  const stages: Record<ApplicantChaseStageId, StageResult> = {
    day3: { matched: 0, sent: 0, skippedAlreadySent: 0, skippedSeen: 0, failed: 0 },
    day10: { matched: 0, sent: 0, skippedAlreadySent: 0, skippedSeen: 0, failed: 0 },
    day20: { matched: 0, sent: 0, skippedAlreadySent: 0, skippedSeen: 0, failed: 0 },
  };

  // One email per applicant per run, earliest stage wins.
  const seenUsers = new Set<string>();
  for (const stage of APPLICANT_CHASE_STAGES) {
    const rows = matches.get(stage.stage) ?? [];
    const tally = stages[stage.stage];
    tally.matched = rows.length;
    for (const app of rows) {
      if (seenUsers.has(app.user.id)) {
        tally.skippedSeen++;
        continue;
      }
      seenUsers.add(app.user.id);
      if (ledger.has(chaseLedgerKey(app.id, stage.stage))) {
        tally.skippedAlreadySent++;
        continue;
      }

      try {
        const result = await emailPacer.run(() => stage.stage === 'day3'
          ? sendApplicantFollowupEmail({
              to: app.user.email,
              fullName: app.user.fullName,
            })
          : sendApplicantChaseEmail({
              to: app.user.email,
              fullName: app.user.fullName,
              stage: stage.stage,
            }));
        if (!result.ok) {
          tally.failed++;
          continue;
        }
        applicantEmailsSent++;
        tally.sent++;
        await trackEvent({
          userId: app.user.id,
          eventName: APPLICANT_CHASE_EVENT,
          entityType: APPLICATION_ENTITY_TYPE,
          entityId: app.id,
          metadata: { stage: stage.stage },
        });
      } catch (err) {
        tally.failed++;
        captureApiError(err, { route: ROUTE, extra: { userId: app.user.id, stage: stage.stage } });
      }
    }
  }

  // Staff alert about the fresh queue (3–6 days), unchanged in meaning.
  const staleApplications = matches.get('day3') ?? [];
  let adminEmailSent = false;
  if (staleApplications.length > 0) {
    try {
      const result = await emailPacer.run(() => sendAdminPendingApplicantsEmail({
        pendingCount: staleApplications.length,
      }));
      adminEmailSent = result.ok;
    } catch (err) {
      captureApiError(err, { route: `${ROUTE}/admin-alert` });
    }
  }

  const runResult = {
    ok: true,
    checkedAt: now.toISOString(),
    staleApplications: staleApplications.length,
    uniqueApplicants: seenUsers.size,
    applicantEmailsSent,
    adminEmailSent,
    stages,
    ledgerAvailable,
    emailPacing: emailPacer.summary(),
  };
  await setCronRecordsProcessed(applicantEmailsSent);
  await logCronRun('cron_applicant_followup', runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_applicant_followup', handle);
export const POST = withCronLogging('cron_applicant_followup', handle);
