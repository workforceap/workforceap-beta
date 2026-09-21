import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { effectiveStreak } from '@/lib/member/streakDisplay';

export { effectiveStreak, daysSinceLastActive } from '@/lib/member/streakDisplay';

/**
 * Daily-habit streak tracking.
 *
 * A "streak" counts consecutive UTC calendar days on which a member was active
 * (earned points / completed a lesson or step). Streak state lives additively on
 * the existing `MemberPoints` row (`currentStreak`, `longestStreak`,
 * `lastActiveDate`) — no separate table.
 *
 * Design notes:
 *  - Day boundaries use UTC so the result is deterministic regardless of server
 *    timezone. (A future enhancement could pass the member's local timezone.)
 *  - `updateStreak` is idempotent within a single day: multiple activities on the
 *    same UTC day do not increment the streak more than once.
 *  - It is intentionally NON-BLOCKING at the call site: a streak-update failure
 *    must never break the underlying action (point award, lesson completion).
 */

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date | null;
};

const EMPTY_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
};

/** Truncate a Date to its UTC calendar day (midnight UTC). */
function toUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole-day difference between two UTC-day-truncated dates (b - a). */
function dayDiff(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((toUtcDay(b).getTime() - toUtcDay(a).getTime()) / MS_PER_DAY);
}

/**
 * Compute the next streak state given the prior state and the moment of activity.
 * Pure + exported so it can be unit-tested without a database.
 */
export function computeNextStreak(
  prev: { currentStreak: number; longestStreak: number; lastActiveDate: Date | null },
  now: Date = new Date(),
): StreakState {
  const current = Math.max(0, prev.currentStreak ?? 0);
  const longest = Math.max(0, prev.longestStreak ?? 0);

  if (!prev.lastActiveDate) {
    // First-ever activity.
    return { currentStreak: 1, longestStreak: Math.max(1, longest), lastActiveDate: now };
  }

  const diff = dayDiff(prev.lastActiveDate, now);

  if (diff <= 0) {
    // Same UTC day (or clock skew into the past) — idempotent, no change to the
    // streak count, but keep the most recent activity timestamp.
    const keptCurrent = current === 0 ? 1 : current;
    return {
      currentStreak: keptCurrent,
      longestStreak: Math.max(longest, keptCurrent),
      lastActiveDate: now,
    };
  }

  if (diff === 1) {
    // Consecutive day — extend the streak.
    const nextCurrent = current + 1;
    return {
      currentStreak: nextCurrent,
      longestStreak: Math.max(longest, nextCurrent),
      lastActiveDate: now,
    };
  }

  // Gap of 2+ days — streak resets to 1 (today counts).
  return { currentStreak: 1, longestStreak: Math.max(longest, 1), lastActiveDate: now };
}

/**
 * Record activity for `userId` and update their streak on the existing
 * MemberPoints row. NON-BLOCKING: never throws — on any error it returns the
 * empty streak so callers can wire this in without try/catch.
 *
 * Returns the new streak state (best-effort).
 */
export async function updateStreak(userId: string, now: Date = new Date()): Promise<StreakState> {
  try {
    const mp = await prisma.memberPoints.findUnique({
      where: { userId },
      select: { currentStreak: true, longestStreak: true, lastActiveDate: true },
    });

    const next = computeNextStreak(
      {
        currentStreak: mp?.currentStreak ?? 0,
        longestStreak: mp?.longestStreak ?? 0,
        lastActiveDate: mp?.lastActiveDate ?? null,
      },
      now,
    );

    // Upsert keeps this safe even if the MemberPoints row doesn't exist yet
    // (e.g. streak updated independently of a point award).
    await prisma.memberPoints.upsert({
      where: { userId },
      create: {
        userId,
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastActiveDate: next.lastActiveDate,
      },
      update: {
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastActiveDate: next.lastActiveDate,
      },
    });

    return next;
  } catch {
    // Streak tracking is a motivational nicety — never let it break the
    // underlying action. Swallow and report an empty streak.
    return EMPTY_STREAK;
  }
}

/** Read the current streak state for a member (best-effort, never throws). */
export async function getStreak(userId: string): Promise<StreakState> {
  try {
    const mp = await prisma.memberPoints.findUnique({
      where: { userId },
      select: { currentStreak: true, longestStreak: true, lastActiveDate: true },
    });
    if (!mp) return EMPTY_STREAK;
    return {
      // Read-side: a counter whose last activity is older than yesterday is a
      // streak the member has already lost, so it reads as 0 (see streakDisplay).
      currentStreak: effectiveStreak(mp),
      longestStreak: mp.longestStreak ?? 0,
      lastActiveDate: mp.lastActiveDate ?? null,
    };
  } catch {
    return EMPTY_STREAK;
  }
}
