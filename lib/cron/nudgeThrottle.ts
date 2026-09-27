import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { CRON_SCOPED_LOOKUP_CAP } from '@/lib/db/scanCaps';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

/**
 * Shared cross-cron nudge cooldown.
 *
 * Several outreach crons independently decide to email a member a
 * re-engagement nudge (inactive-nudge, inactivity-nudge,
 * course-accountability, plus the tiered retention nudges in
 * lib/cron/at-risk-alerts.ts). Without a shared check, a member sitting at
 * the intersection of two crons' criteria (e.g. inactive AND stalled on a
 * course) could get nudged by each cron independently in the same week.
 *
 * `MemberNudgeLog` is the shared ledger: every nudge-sending cron writes a
 * row here, and every nudge-sending cron calls `filterNudgeEligibleUserIds`
 * with its full candidate list BEFORE sending — one shared query per cron
 * run, not per-member/per-cron logic — so at most one nudge goes out to any
 * given member per rolling 7-day window, regardless of which cron would
 * have sent it.
 */
export const NUDGE_LOG_COOLDOWN_DAYS = 7;

/**
 * Given a list of candidate userIds a cron is about to nudge, return the
 * subset that has NOT received any nudge (from any cron/kind/tier) within
 * the shared cooldown window.
 */
export async function filterNudgeEligibleUserIds(candidateUserIds: string[]): Promise<Set<string>> {
  if (candidateUserIds.length === 0) return new Set();

  const cutoff = new Date(Date.now() - NUDGE_LOG_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const recentlyNudged = await prisma.memberNudgeLog.findMany({
    where: { userId: { in: candidateUserIds }, sentAt: { gte: cutoff } },
    select: { userId: true },
    distinct: ['userId'],
    take: CRON_SCOPED_LOOKUP_CAP,
  });
  const recentlyNudgedIds = new Set(recentlyNudged.map((r) => r.userId));

  return new Set(candidateUserIds.filter((id) => !recentlyNudgedIds.has(id)));
}

/**
 * Record that a nudge was sent, for the shared cooldown above. Non-fatal —
 * a logging failure must never surface as a cron failure (the email already
 * went out).
 */
export async function recordNudgeSent(args: {
  userId: string;
  tier: string;
  kind: string;
  reasons?: unknown;
}): Promise<void> {
  try {
    await withActiveMemberWrite(args.userId, (tx) => tx.memberNudgeLog.create({
      data: {
        userId: args.userId,
        tier: args.tier,
        kind: args.kind,
        ...(args.reasons !== undefined ? { reasons: args.reasons as object } : {}),
      },
    }));
  } catch (err) {
    if (!(err instanceof MemberLifecycleWriteError)) {
      console.error('[nudgeThrottle] failed to record nudge log:', err);
    }
  }
}
