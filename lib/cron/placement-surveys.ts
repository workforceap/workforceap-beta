/**
 * Placement survey automation core.
 *
 * Handles 30/60/90/180-day survey scheduling, sending, and escalation.
 * Called by the /api/cron/placement-survey route.
 */

import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { CRON_SCOPED_LOOKUP_CAP } from '@/lib/db/scanCaps';
import { issuePlacementSurveyToken } from '@/lib/security/placementSurveyToken';
import {
  preparePlacementSurveyEmail,
  sendPreparedPlacementSurveyEmail,
  sendPlacementSurveyEscalationEmail,
} from '@/lib/email';
import { createNotification } from '@/lib/notifications/create';
import type { PlacementSurveyWave } from '@prisma/client';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import {
  readPlacementSurveyDeliveryPayload,
  type PlacementSurveyDeliveryPayload,
} from '@/lib/placement-survey/deliveryPayload';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const SURVEY_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
// The row must exist before provider acceptance so its id can be signed into
// the survey URL. A null sentAt is the explicit pre-acceptance state.
const UNSENT_SURVEY_AT = null;

const WAVES: { wave: PlacementSurveyWave; days: number; windowHours: number }[] = [
  { wave: 'thirty_day', days: 30, windowHours: 24 },
  { wave: 'sixty_day', days: 60, windowHours: 24 },
  { wave: 'ninety_day', days: 90, windowHours: 24 },
  { wave: 'hundred_eighty_day', days: 180, windowHours: 24 },
];

/** Waves that still block escalation for a stale (no-response) survey. */
const ESCALATABLE_WAVES: PlacementSurveyWave[] = [
  'thirty_day',
  'sixty_day',
  'ninety_day',
  'hundred_eighty_day',
];

export type SurveySendResult = {
  wave: PlacementSurveyWave;
  sent: Array<{ userId: string; email: string; surveyId: string }>;
  skipped: Array<{ userId: string; reason: string }>;
  emailFailures: Array<{ userId: string; error: string }>;
};

export type EscalationResult = {
  alerted: Array<{ userId: string; counselorEmail: string }>;
  skipped: Array<{ userId: string; reason: string }>;
  emailFailures: Array<{ userId: string; error: string }>;
};

export type DailySurveyRunResult = {
  success: boolean;
  waves: SurveySendResult[];
  escalations: EscalationResult;
};

function getSurveyDueDate(placedAt: Date, days: number): Date {
  const d = new Date(placedAt);
  d.setDate(d.getDate() + days);
  return d;
}

function inWindow(target: Date, windowHours: number): { gte: Date; lte: Date } {
  const half = (windowHours * 60 * 60 * 1000) / 2;
  return {
    gte: new Date(target.getTime() - half),
    lte: new Date(target.getTime() + half),
  };
}

/**
 * Send surveys for placements that hit their 30/60/90-day mark today.
 */
type PlacementEmailPacer = ReturnType<typeof createBulkEmailCronPacer>;

export async function sendDuePlacementSurveys(
  emailPacer: PlacementEmailPacer = createBulkEmailCronPacer({ maxDurationSeconds: 300 }),
): Promise<SurveySendResult[]> {
  const results: SurveySendResult[] = [];

  for (const { wave, days, windowHours } of WAVES) {
    const now = new Date();
    const target = new Date();
    target.setDate(target.getDate() - days);
    const { gte, lte } = inWindow(target, windowHours);

    const placements = await prisma.placementRecord.findMany({
      where: {
        OR: [
          {
            placedAt: { gte, lte },
            placementSurveys: { none: { wave, sentAt: { not: null } } },
          },
          // Retry a prior pre-acceptance row even after its original due-date
          // window has passed.
          { placementSurveys: { some: { wave, sentAt: UNSENT_SURVEY_AT } } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            enrolledProgram: true,
          },
        },
      },
      take: 200,
    });

    const sent: SurveySendResult['sent'] = [];
    const skipped: SurveySendResult['skipped'] = [];
    const emailFailures: SurveySendResult['emailFailures'] = [];

    // Batch idempotency check: load all existing surveys for this wave + placement set
    const existingSurveys = await prisma.placementSurvey.findMany({
      take: CRON_SCOPED_LOOKUP_CAP,
      where: {
        placementId: { in: placements.map((p) => p.id) },
        wave,
      },
      select: {
        id: true,
        placementId: true,
        sentAt: true,
        tokenExpiresAt: true,
        deliveryAttempt: true,
        acceptedAttempt: true,
        deliveryPayload: true,
      },
    });
    const existingByPlacementId = new Map(
      existingSurveys.map((survey) => [survey.placementId, survey]),
    );

    for (const placement of placements) {
      const user = placement.user;

      // Resolve persisted state before consulting mutable profile fields. A
      // pre-acceptance row owns the complete provider request for its attempt,
      // including the recipient; retries must not depend on current contact data.
      const existingSurvey = existingByPlacementId.get(placement.id);
      if (existingSurvey?.sentAt) {
        skipped.push({ userId: placement.userId, reason: `Survey already exists for ${wave}` });
        continue;
      }

      // Create the row first because we need its id to mint the
      // signed token embedded in the email's survey URL. If the email
      // send subsequently fails, roll the row back (below) so the next
      // cron run will re-pick this user — otherwise the idempotency
      // filter above (`placementSurveys: { none: { wave } }` style)
      // would skip them forever despite never receiving their email.
      //
      // The in-memory idempotency check above keys on placementId+wave, but the
      // table's unique constraint is (userId, wave). A member with more than one
      // PlacementRecord in the same wave window (or a concurrent run) therefore
      // passed the check yet hit a P2002 on insert and crashed the cron. Treat
      // that collision as "already surveyed for this wave" and skip instead.
      let survey: {
        id: string;
        tokenExpiresAt: Date;
        deliveryAttempt: number;
        acceptedAttempt: number;
        deliveryPayload: unknown;
      };
      const createdThisRun = !existingSurvey;
      if (existingSurvey) {
        survey = existingSurvey;
      } else {
        if (!user?.email) {
          skipped.push({ userId: placement.userId, reason: 'No email on user' });
          continue;
        }
        const surveyId = randomUUID();
        const tokenExpiresAt = new Date(now.getTime() + SURVEY_TOKEN_TTL_MS);
        const token = await issuePlacementSurveyToken({
          surveyId,
          expiresAt: tokenExpiresAt,
        });
        const deliveryPayload = preparePlacementSurveyEmail({
          to: user.email,
          fullName: user.fullName ?? '',
          programName: user.enrolledProgram,
          surveyUrl: `${SITE_URL}/survey/placement/${encodeURIComponent(token)}`,
          wave,
          idempotencyKey: `placement-survey/${surveyId}/1`,
        });
        try {
          const created = await prisma.placementSurvey.create({
            data: {
              id: surveyId,
              userId: placement.userId,
              placementId: placement.id,
              wave,
              sentAt: UNSENT_SURVEY_AT,
              tokenExpiresAt,
              deliveryAttempt: 1,
              acceptedAttempt: 0,
              deliveryPayload,
            },
            select: {
              id: true,
              tokenExpiresAt: true,
              deliveryAttempt: true,
              acceptedAttempt: true,
              deliveryPayload: true,
            },
          });
          // Use the exact in-memory payload that was atomically persisted;
          // never reconstruct it from a later user/profile read.
          survey = { ...created, deliveryPayload };
        } catch (createErr) {
          const isUniqueViolation =
            typeof createErr === 'object' &&
            createErr !== null &&
            'code' in createErr &&
            (createErr as { code?: unknown }).code === 'P2002';
          if (isUniqueViolation) {
            skipped.push({
              userId: placement.userId,
              reason: `Survey already exists for ${wave} (userId+wave)`,
            });
            continue;
          }
          throw createErr;
        }
      }

      const deliveryPayload = readPlacementSurveyDeliveryPayload(survey.deliveryPayload);
      if (!deliveryPayload) {
        emailFailures.push({
          userId: placement.userId,
          error: 'Retryable survey is missing its frozen provider payload; no provider request was made.',
        });
        continue;
      }

      const result = await emailPacer.run(() => sendPreparedPlacementSurveyEmail(deliveryPayload, placement.userId));

      if (!result.ok && 'skipped' in result && result.skipped) {
        skipped.push({ userId: placement.userId, reason: result.error ?? 'Skipped before provider send' });
        // A row created for a send that was never admitted can be removed.
        // Preserve a reused row because it may represent an earlier ambiguous
        // provider attempt that still needs the same key and payload.
        if (createdThisRun) {
          try {
            await prisma.placementSurvey.delete({ where: { id: survey.id } });
          } catch (deleteErr) {
            emailFailures.push({
              userId: placement.userId,
              error: `Email skipped (${result.error ?? 'unknown'}) and unsent-row rollback failed (${
                deleteErr instanceof Error ? deleteErr.message : 'unknown'
              }); row remains unsent and retryable.`,
            });
          }
        }
        continue;
      }

      if (result.ok) {
        await prisma.placementSurvey.update({
          where: { id: survey.id },
          data: {
            sentAt: new Date(),
            acceptedAttempt: survey.deliveryAttempt,
          },
        });
        // Fire the in-app notification only after the email succeeds so
        // a failed-email run doesn't leave an orphan "survey ready" notice.
        await createNotification({
          userId: placement.userId,
          subjectMemberId: placement.userId,
          type: 'survey_due',
          title: 'Placement survey ready',
          body: `Your ${wave.replace('_', '-day ')} placement survey is ready. It only takes 2 minutes.`,
          data: { surveyId: survey.id, wave },
        });
        sent.push({ userId: placement.userId, email: deliveryPayload.to, surveyId: survey.id });
      } else {
        // A provider error can be ambiguous (the request may have been
        // accepted before the response was lost). Keep the row and its stable
        // provider idempotency key so the next run can reconcile without a
        // duplicate message.
        emailFailures.push({
          userId: placement.userId,
          error: `${result.error ?? 'Unknown send error'}; row remains unsent and retryable with the same idempotency key.`,
        });
      }
    }

    results.push({ wave, sent, skipped, emailFailures });
  }

  return results;
}

/**
 * Escalate 30/60/90/180-day surveys with no response after 7 days.
 * Alerts the assigned counselor (or admin fallback).
 */
export async function escalateStalePlacementSurveys(
  emailPacer: PlacementEmailPacer = createBulkEmailCronPacer({ maxDurationSeconds: 300 }),
): Promise<EscalationResult> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const staleSurveys = await prisma.placementSurvey.findMany({
    where: {
      wave: { in: ESCALATABLE_WAVES },
      completedAt: null,
      sentAt: { not: null, lte: sevenDaysAgo },
      escalatedAt: null,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          counselorAssignments: {
            where: { active: true },
            select: {
              counselor: {
                select: {
                  user: { select: { id: true, email: true, fullName: true } },
                },
              },
            },
            take: 1,
          },
        },
      },
      placement: {
        select: {
          employerName: true,
          jobTitle: true,
          startDate: true,
        },
      },
    },
    take: 100,
  });

  const alerted: EscalationResult['alerted'] = [];
  const skipped: EscalationResult['skipped'] = [];
  const emailFailures: EscalationResult['emailFailures'] = [];
  const skippedSurveyIds: string[] = [];

  for (const survey of staleSurveys) {
    const user = survey.user;
    const counselor = user.counselorAssignments[0]?.counselor;
    const counselorEmail = counselor?.user?.email;

    if (!counselorEmail) {
      skipped.push({ userId: user.id, reason: 'No active counselor email' });
      skippedSurveyIds.push(survey.id);
      continue;
    }

    const token = await issuePlacementSurveyToken({ surveyId: survey.id, ttlSeconds: 14 * 24 * 60 * 60 });
    const surveyUrl = `${SITE_URL}/survey/placement/${encodeURIComponent(token)}`;

    const result = await emailPacer.run(() => sendPlacementSurveyEscalationEmail({
      to: counselorEmail,
      counselorName: counselor.user.fullName ?? 'Counselor',
      memberName: user.fullName ?? 'Member',
      memberEmail: user.email ?? '',
      employerName: survey.placement.employerName,
      jobTitle: survey.placement.jobTitle,
      daysSincePlacement: survey.placement.startDate
        ? Math.floor((Date.now() - new Date(survey.placement.startDate).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      surveyUrl,
      wave: survey.wave,
    }));

    if (!result.ok && 'skipped' in result && result.skipped) {
      skipped.push({ userId: user.id, reason: result.error ?? 'Skipped before provider send' });
      continue;
    }

    if (result.ok) {
      alerted.push({ userId: user.id, counselorEmail });
      await prisma.placementSurvey.update({
        where: { id: survey.id },
        data: { escalatedAt: new Date() },
      });

      // In-app companion to the escalation email so the counselor also sees
      // this in their notification feed, not just their inbox. Fail-soft —
      // createNotification never throws (see lib/notifications/create.ts).
      const counselorUserId = counselor.user.id;
      if (counselorUserId) {
        await createNotification({
          userId: counselorUserId,
          subjectMemberId: user.id,
          type: 'task_assigned',
          title: 'Placement survey follow-up needed',
          body: `${user.fullName ?? 'A member'}'s ${survey.wave.replace('_', '-day ')} placement survey has gone unanswered for 7+ days.`,
          data: { surveyId: survey.id, wave: survey.wave, memberId: user.id },
        });
      }
    } else {
      emailFailures.push({ userId: user.id, error: result.error ?? 'Unknown send error' });
    }
  }

  // Batch-update skipped surveys so we don't keep retrying them
  if (skippedSurveyIds.length > 0) {
    await prisma.placementSurvey.updateMany({
      where: { id: { in: skippedSurveyIds } },
      data: { escalatedAt: new Date() },
    });
  }

  return { alerted, skipped, emailFailures };
}

/**
 * Full daily run: send due surveys + escalate stale ones.
 */
export async function runDailyPlacementSurveyCron(): Promise<DailySurveyRunResult> {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: 300 });
  const waves = await sendDuePlacementSurveys(emailPacer);
  const escalations = await escalateStalePlacementSurveys(emailPacer);
  return { success: true, waves, escalations };
}
