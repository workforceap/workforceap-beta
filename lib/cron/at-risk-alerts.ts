/**
 * At-risk notification + member retention nudge helpers.
 *
 * `runAtRiskCounselorAlerts` is THE at-risk email (WAP-30 / TODO-006). It runs
 * weekly from `/api/cron/at-risk-alerts` (Monday 13:07 UTC — cadence chosen
 * by Mike 2026-09-20) and never scores anyone itself: it reads the
 * `AtRiskAlert` rows the nightly `/api/cron/at-risk-check` persisted, so the
 * email, both command centers and the at-risk dashboard describe the same
 * risk picture. CRITICAL members are grouped by assigned counselor, one
 * batched email per counselor; members with no active counselor go to the
 * staff fallback inbox (`AT_RISK_DIGEST_EMAILS`, else the admin alert list)
 * instead of being dropped. Dedup: a member whose alert was notified within
 * the last 24h is skipped. The former separate "digest" email is gone — one
 * scorer, one sender, one schedule.
 *
 * `runMemberRetentionNudges` (G5 green/yellow/red nudges to MEMBERS) is a
 * different question and shares the weekly route.
 */

import { prisma } from '@/lib/db/prisma';
import { CRON_SCOPED_LOOKUP_CAP } from '@/lib/db/scanCaps';
import {
  buildMemberClassificationInput,
  classifyMember,
  loadPersistedAtRiskScores,
  getRiskLevel,
  THRESHOLDS,
  type AtRiskScore,
  type AtRiskTier,
  type ClassifyMemberResult,
} from '@/lib/member/atRiskScoring';
import {
  getAtRiskDigestRecipients,
  sendCounselorAtRiskAlertEmail,
  sendMemberCheckInEmail,
  sendMemberComeBackEmail,
  sendMemberStuckEmail,
} from '@/lib/email';
import type { createBulkEmailCronPacer } from '@/lib/email/pacing';

type BulkEmailCronPacer = ReturnType<typeof createBulkEmailCronPacer>;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const NUDGE_COOLDOWN_DAYS = 7;
const NUDGE_COOLDOWN_MS = NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// Bounded-concurrency batch size. Each candidate requires a classification
// pass (Prisma lookup + external B4B/Coursera HTTP call) plus a cooldown
// check and possibly an email send, so members are processed in small
// batches rather than one-at-a-time (too slow for 500 members) or all at
// once (risk of overwhelming the external API / DB pool / email provider).
const NUDGE_BATCH_SIZE = 15;

type NudgeKind = 'check_in' | 'come_back' | 'stuck';

function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  const trimmed = fullName.trim().split(/\s+/)[0];
  return trimmed || 'there';
}

function chooseNudge(
  classification: ClassifyMemberResult,
): { kind: NudgeKind; tier: AtRiskTier } | null {
  if (classification.tier === 'green') return null;
  const stuck = classification.reasons.some(
    (r) =>
      r.toLowerCase().includes('stalled') ||
      r.toLowerCase().includes('coursera progress'),
  );
  if (classification.tier === 'red') {
    // 14d+ stall or no login >=14 → stuck; else come_back
    const heavy =
      classification.daysSinceLogin >= 14 ||
      classification.reasons.some((r) => /14 days|stalled for/i.test(r));
    if (heavy || stuck) return { kind: 'stuck', tier: 'red' };
    return { kind: 'come_back', tier: 'red' };
  }
  // yellow
  return { kind: 'check_in', tier: 'yellow' };
}

export type RetentionNudgeResult = {
  success: boolean;
  scanned: number;
  sentCheckIn: number;
  sentComeBack: number;
  sentStuck: number;
  skippedCooldown: number;
  skippedNoEmail: number;
  errors: number;
  skippedPacing: number;
  skippedFixture: number;
};

/**
 * G5 retention loop: classify members, send tiered nudge emails, respect
 * the per-tier 7-day cooldown via `MemberNudgeLog`.
 *
 * Idempotent — re-running within the cooldown window is a no-op for any
 * member who already received a nudge of that tier in the window.
 */
export async function runMemberRetentionNudges(pacer: BulkEmailCronPacer): Promise<RetentionNudgeResult> {
  const candidates = await prisma.user.findMany({
    take: 500,
    where: {
      deletedAt: null,
      // Never-placed members get the full G5 retention loop. Placed members
      // are normally excluded (they have a counselor-tracked placement
      // journey instead), but a placement marked separated/not-retained
      // means the member is effectively back in the job search — they
      // should re-enter this loop rather than being permanently excluded
      // just because a PlacementRecord row exists. Audit: job-loss
      // re-activation (2026-07-03).
      OR: [
        { placementRecord: null },
        {
          placementRecord: {
            OR: [{ retentionStatus: 'separated' }, { retentionDecision: 'not_retained' }],
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      counselorAssignments: {
        where: { active: true },
        take: 1,
        select: {
          counselor: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
    },
  });

  let scanned = 0;
  let sentCheckIn = 0;
  let sentComeBack = 0;
  let sentStuck = 0;
  let skippedCooldown = 0;
  let skippedNoEmail = 0;
  let errors = 0;
  let skippedPacing = 0;
  let skippedFixture = 0;

  const cooldownCutoff = new Date(Date.now() - NUDGE_COOLDOWN_MS);

  type NudgeOutcome = {
    skippedNoEmail?: boolean;
    errors?: number;
    skippedCooldown?: boolean;
    sentCheckIn?: boolean;
    sentComeBack?: boolean;
    sentStuck?: boolean;
    skippedPacing?: boolean;
    skippedFixture?: boolean;
  };

  const processMember = async (
    member: (typeof candidates)[number],
  ): Promise<NudgeOutcome> => {
    if (!member.email) {
      return { skippedNoEmail: true };
    }

    let classification: ClassifyMemberResult;
    try {
      const input = await buildMemberClassificationInput(member.id);
      classification = classifyMember(input);
    } catch (err) {
      console.error(`[retention-nudges] classify failed for ${member.id}:`, err);
      return { errors: 1 };
    }

    const choice = chooseNudge(classification);
    if (!choice) return {};

    // Cooldown: don't send same tier again within window
    const recent = await prisma.memberNudgeLog.findFirst({
      where: {
        userId: member.id,
        tier: choice.tier,
        sentAt: { gte: cooldownCutoff },
      },
      select: { id: true },
    });
    if (recent) {
      return { skippedCooldown: true };
    }

    const firstName = firstNameOf(member.fullName);
    const counselorName =
      member.counselorAssignments[0]?.counselor?.user?.fullName?.trim() ||
      'Your WorkforceAP counselor';

    let sent = false;
    const outcome: NudgeOutcome = {};
    try {
      if (choice.kind === 'check_in') {
        const result = await pacer.run(() => sendMemberCheckInEmail({
          to: member.email,
          firstName,
          dashboardUrl: `${SITE_URL}/dashboard`,
        }));
        if ('skipped' in result) return result.error === 'fixture_recipient'
          ? { skippedFixture: true }
          : { skippedPacing: true };
        if (result.ok) {
          outcome.sentCheckIn = true;
          sent = true;
        } else outcome.errors = 1;
      } else if (choice.kind === 'come_back') {
        const result = await pacer.run(() => sendMemberComeBackEmail({
          to: member.email,
          firstName,
          counselorName,
          nextBestActionUrl: `${SITE_URL}/dashboard`,
        }));
        if ('skipped' in result) return result.error === 'fixture_recipient'
          ? { skippedFixture: true }
          : { skippedPacing: true };
        if (result.ok) {
          outcome.sentComeBack = true;
          sent = true;
        } else outcome.errors = 1;
      } else {
        const result = await pacer.run(() => sendMemberStuckEmail({
          to: member.email,
          firstName,
          counselorName,
        }));
        if ('skipped' in result) return result.error === 'fixture_recipient'
          ? { skippedFixture: true }
          : { skippedPacing: true };
        if (result.ok) {
          outcome.sentStuck = true;
          sent = true;
        } else outcome.errors = 1;
      }
    } catch (err) {
      console.error(`[retention-nudges] send failed for ${member.id}:`, err);
      outcome.errors = 1;
    }

    if (sent) {
      try {
        await prisma.memberNudgeLog.create({
          data: {
            userId: member.id,
            tier: choice.tier,
            kind: choice.kind,
            reasons: classification.reasons as unknown as object,
          },
        });
      } catch (err) {
        console.error(`[retention-nudges] log write failed for ${member.id}:`, err);
      }
    }

    return outcome;
  };

  for (let i = 0; i < candidates.length; i += NUDGE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + NUDGE_BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(processMember));
    for (const outcome of outcomes) {
      scanned++;
      if (outcome.skippedNoEmail) skippedNoEmail++;
      if (outcome.skippedCooldown) skippedCooldown++;
      if (outcome.sentCheckIn) sentCheckIn++;
      if (outcome.sentComeBack) sentComeBack++;
      if (outcome.sentStuck) sentStuck++;
      if (outcome.errors) errors += outcome.errors;
      if (outcome.skippedPacing) skippedPacing++;
      if (outcome.skippedFixture) skippedFixture++;
    }
  }

  return {
    success: true,
    scanned,
    sentCheckIn,
    sentComeBack,
    sentStuck,
    skippedCooldown,
    skippedNoEmail,
    errors,
    skippedPacing,
    skippedFixture,
  };
}

export type CounselorAlertResult = {
  counselorId: string;
  counselorEmail: string;
  counselorName: string;
  sent: boolean;
  memberCount: number;
  error?: string;
};

export type DailyAtRiskAlertRunResult = {
  success: boolean;
  counselorsNotified: number;
  membersFlagged: number;
  /** Critical members with no counselor AND no staff fallback recipient configured. */
  skippedNoCounselor: number;
  /** Critical members with no counselor that were routed to the staff fallback inbox. */
  unassignedRoutedToStaff: number;
  skippedAlreadyNotified: number;
  skippedPacing: number;
  skippedFixture: number;
  results: CounselorAlertResult[];
};

/** Synthetic batch id for the staff fallback inbox (members with no counselor). */
export const STAFF_FALLBACK_COUNSELOR_ID = 'staff-fallback';

/**
 * @param precomputedScores Optional scores already in hand (tests, a manual
 *   run right after scoring). When omitted the persisted `AtRiskAlert` rows
 *   are the source — this helper never re-scores.
 */
export async function runAtRiskCounselorAlerts(
  pacer: BulkEmailCronPacer,
  precomputedScores?: AtRiskScore[],
): Promise<DailyAtRiskAlertRunResult> {
  const scores = precomputedScores ?? (await loadPersistedAtRiskScores(THRESHOLDS.CRITICAL));
  const criticalScores = scores.filter((s) => s.score >= THRESHOLDS.CRITICAL);

  if (criticalScores.length === 0) {
    return {
      success: true,
      counselorsNotified: 0,
      membersFlagged: 0,
      skippedNoCounselor: 0,
      unassignedRoutedToStaff: 0,
      skippedAlreadyNotified: 0,
      skippedPacing: 0,
      skippedFixture: 0,
      results: [],
    };
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Ensure alerts exist for all critical scores so we can track notifiedCounselorAt
  // Batch: find all existing alerts in one query, then create only missing ones.
  const existingAlerts = await prisma.atRiskAlert.findMany({
    take: CRON_SCOPED_LOOKUP_CAP,
    where: {
      userId: { in: criticalScores.map((s) => s.userId) },
      status: { in: ['open', 'acknowledged'] },
    },
    select: { userId: true },
  });
  const existingUserIds = new Set(existingAlerts.map((a) => a.userId));

  const alertsToCreate = criticalScores
    .filter((s) => !existingUserIds.has(s.userId))
    .map((s) => ({
      userId: s.userId,
      score: s.score,
      factors: s.factors as any,
      status: 'open' as const,
    }));

  if (alertsToCreate.length > 0) {
    try {
      await prisma.atRiskAlert.createMany({ data: alertsToCreate });
    } catch (err) {
      console.error('[at-risk-alerts] Failed to batch-create alerts:', err);
    }
  }

  // Get members with active counselor assignments
  const membersWithCounselors = await prisma.user.findMany({
    take: 500,
    where: {
      id: { in: criticalScores.map((s) => s.userId) },
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      counselorAssignments: {
        where: { active: true },
        select: {
          counselor: {
            select: {
              id: true,
              user: {
                select: {
                  email: true,
                  fullName: true,
                },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  const memberById = new Map(membersWithCounselors.map((m) => [m.id, m]));

  // Find all alerts for critical members (freshly created or existing)
  const alerts = await prisma.atRiskAlert.findMany({
    take: CRON_SCOPED_LOOKUP_CAP,
    where: {
      userId: { in: criticalScores.map((s) => s.userId) },
      status: { in: ['open', 'acknowledged'] },
    },
    select: {
      id: true,
      userId: true,
      notifiedCounselorAt: true,
    },
  });

  const alertByUserId = new Map(alerts.map((a) => [a.userId, a]));

  // Group by counselor. Members with no active counselor go to the staff
  // fallback inbox (one batch) so no critical member is silently dropped.
  const staffRecipients = getAtRiskDigestRecipients();
  const counselorBatches = new Map<
    string,
    {
      counselorId: string;
      counselorEmail: string | string[];
      counselorName: string;
      profileUrlFor: (userId: string) => string;
      members: Array<{
        userId: string;
        fullName: string | null;
        email: string | null;
        score: number;
        level: string;
        factors: string[];
        recommendedAction: string;
        alertId: string;
      }>;
    }
  >();

  let skippedNoCounselor = 0;
  let unassignedRoutedToStaff = 0;
  let skippedAlreadyNotified = 0;

  for (const score of criticalScores) {
    const member = memberById.get(score.userId);
    if (!member) continue;

    const alert = alertByUserId.get(score.userId);
    if (alert?.notifiedCounselorAt && alert.notifiedCounselorAt >= twentyFourHoursAgo) {
      skippedAlreadyNotified++;
      continue;
    }

    const counselor = member.counselorAssignments[0]?.counselor;
    let batchKey: string;
    let batch = counselor?.user?.email ? counselorBatches.get(counselor.id) : counselorBatches.get(STAFF_FALLBACK_COUNSELOR_ID);
    if (counselor?.user?.email) {
      batchKey = counselor.id;
      batch = batch || {
        counselorId: counselor.id,
        counselorEmail: counselor.user.email,
        counselorName: counselor.user.fullName ?? 'Counselor',
        profileUrlFor: (userId: string) => `${SITE_URL}/counselor/students/${userId}`,
        members: [],
      };
    } else {
      if (staffRecipients.length === 0) {
        skippedNoCounselor++;
        continue;
      }
      unassignedRoutedToStaff++;
      batchKey = STAFF_FALLBACK_COUNSELOR_ID;
      batch = batch || {
        counselorId: STAFF_FALLBACK_COUNSELOR_ID,
        counselorEmail: staffRecipients,
        counselorName: 'WorkforceAP staff',
        profileUrlFor: (userId: string) => `${SITE_URL}/admin/members/${userId}`,
        members: [],
      };
    }

    batch.members.push({
      userId: score.userId,
      fullName: member.fullName,
      email: member.email,
      score: score.score,
      level: getRiskLevel(score.score),
      factors: score.factors.map((f) => f.description),
      recommendedAction: score.recommendedAction,
      alertId: alert?.id ?? '',
    });

    counselorBatches.set(batchKey, batch);
  }

  const results: CounselorAlertResult[] = [];
  let skippedPacing = 0;
  let skippedFixture = 0;

  for (const batch of counselorBatches.values()) {
    if (batch.members.length === 0) continue;

    const result = await pacer.run(() => sendCounselorAtRiskAlertEmail({
      to: batch.counselorEmail,
      counselorName: batch.counselorName,
      members: batch.members.map((m) => ({
        memberName: m.fullName ?? 'Unknown',
        memberEmail: m.email ?? '(no email)',
        score: m.score,
        level: m.level,
        factors: m.factors,
        recommendedAction: m.recommendedAction,
        profileUrl: batch.profileUrlFor(m.userId),
      })),
      dashboardUrl: `${SITE_URL}/counselor/at-risk`,
    }));
    const counselorEmail = Array.isArray(batch.counselorEmail) ? batch.counselorEmail.join(',') : batch.counselorEmail;

    if ('skipped' in result) {
      if (result.error === 'fixture_recipient') skippedFixture++;
      else skippedPacing++;
      results.push({
        counselorId: batch.counselorId,
        counselorEmail,
        counselorName: batch.counselorName,
        sent: false,
        memberCount: batch.members.length,
        error: result.error,
      });
      continue;
    }

    if (result.ok) {
      const alertIds = batch.members.map((m) => m.alertId).filter(Boolean);
      if (alertIds.length > 0) {
        await prisma.atRiskAlert.updateMany({
          where: { id: { in: alertIds } },
          data: { notifiedCounselorAt: new Date() },
        });
      }
    }

    results.push({
      counselorId: batch.counselorId,
      counselorEmail,
      counselorName: batch.counselorName,
      sent: result.ok,
      memberCount: batch.members.length,
      error: result.error,
    });
  }

  return {
    success: true,
    counselorsNotified: results.filter((r) => r.sent).length,
    membersFlagged: results.reduce((sum, r) => sum + r.memberCount, 0),
    skippedNoCounselor,
    unassignedRoutedToStaff,
    skippedAlreadyNotified,
    skippedPacing,
    skippedFixture,
    results,
  };
}
