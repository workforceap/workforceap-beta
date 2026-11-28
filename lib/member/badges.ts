import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { effectiveStreak } from '@/lib/member/streakDisplay';
import { BADGES, evaluateBadges, type BadgeTransaction, type MemberBadge } from '@/lib/member/badgesConfig';

export type { MemberBadge } from '@/lib/member/badgesConfig';

/** Events a badge counts. The streak badge has none: it reads MemberPoints. */
const BADGE_EVENTS = BADGES.flatMap((badge) => (badge.event ? [badge.event] : []));

/**
 * The smallest slice of Prisma `getMemberBadges` needs. Tests pass a double;
 * production omits it and uses the shared client.
 */
export type MemberBadgesDb = {
  pointsTransaction: {
    findMany: (args: {
      where: { userId: string; event: { in: string[] } };
      select: { event: true; entityId: true; note: true; createdAt: true };
    }) => Promise<BadgeTransaction[]>;
  };
  memberPoints: {
    findUnique: (args: {
      where: { userId: string };
      select: { currentStreak: true; longestStreak: true; lastActiveDate: true };
    }) => Promise<{
      currentStreak: number | null;
      longestStreak: number | null;
      lastActiveDate: Date | null;
    } | null>;
  };
};

export type MemberBadges = {
  badges: MemberBadge[];
  /** The streak the member holds right now (0 once it has lapsed). */
  currentStreak: number;
  /** The best streak ever recorded. This is what the 7-day badge uses. */
  longestStreak: number;
};

/**
 * One member's milestone badges and streak, from one source of truth:
 * the points ledger for the five event badges, and `MemberPoints` (read
 * through `effectiveStreak`) for the streak. No badge table, no migration.
 */
export async function getMemberBadges(userId: string, db?: MemberBadgesDb): Promise<MemberBadges> {
  const client = db ?? (prisma as unknown as MemberBadgesDb);
  const [rows, points] = await Promise.all([
    client.pointsTransaction.findMany({
      where: { userId, event: { in: BADGE_EVENTS } },
      select: { event: true, entityId: true, note: true, createdAt: true },
    }),
    client.memberPoints.findUnique({
      where: { userId },
      select: { currentStreak: true, longestStreak: true, lastActiveDate: true },
    }),
  ]);

  const longestStreak = points?.longestStreak ?? 0;
  return {
    badges: evaluateBadges(rows, { longestStreak }),
    currentStreak: effectiveStreak({
      currentStreak: points?.currentStreak,
      lastActiveDate: points?.lastActiveDate,
    }),
    longestStreak,
  };
}
