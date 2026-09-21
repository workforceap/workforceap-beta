import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getLevelForPoints, getNextLevel, POINT_VALUES } from '@/lib/member/pointsConfig';
import { updateStreak, getStreak } from '@/lib/member/streaks';
import { effectiveStreak } from '@/lib/member/streakDisplay';

export type { LevelName } from '@/lib/member/pointsConfig';
export { getLevelForPoints, getNextLevel, LEVELS } from '@/lib/member/pointsConfig';

/**
 * Award points for an event. Idempotent — calling twice with the same
 * (userId, event, entityId) triple is safe; only the first call awards.
 */
export async function awardPoints(
  userId: string,
  event: string,
  entityId: string = '',
  customPoints?: number,
  opts?: { note?: string; awardedBy?: string }
): Promise<{ awarded: boolean; points: number; total: number; level: string }> {
  const points = customPoints ?? POINT_VALUES[event] ?? 0;
  if (points <= 0) return { awarded: false, points: 0, total: 0, level: 'starter' };

  try {
    await prisma.pointsTransaction.create({
      data: { userId, event, entityId, points, note: opts?.note, awardedBy: opts?.awardedBy },
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      const mp = await prisma.memberPoints.findUnique({ where: { userId } });
      const total = mp?.totalPoints ?? 0;
      return { awarded: false, points: 0, total, level: mp?.level ?? 'starter' };
    }
    throw e;
  }

  const upserted = await prisma.memberPoints.upsert({
    where: { userId },
    create: { userId, totalPoints: points, level: getLevelForPoints(points).name },
    update: { totalPoints: { increment: points } },
  });

  const newTotal = upserted.totalPoints;
  const newLevel = getLevelForPoints(newTotal).name;

  if (upserted.level !== newLevel) {
    await prisma.memberPoints.update({ where: { userId }, data: { level: newLevel } });
  }

  // Daily-habit streak: additive + non-blocking. updateStreak swallows its own
  // errors and never throws, so a streak failure can never break a point award.
  await updateStreak(userId);

  return { awarded: true, points, total: newTotal, level: newLevel };
}

export async function getMemberPoints(userId: string) {
  const mp = await prisma.memberPoints.findUnique({ where: { userId } });
  const total = mp?.totalPoints ?? 0;
  const levelName = (mp?.level ?? 'starter') as import('@/lib/member/pointsConfig').LevelName;
  return {
    total,
    level: levelName,
    levelMeta: getLevelForPoints(total),
    nextLevel: getNextLevel(levelName),
    // Daily-habit streak: the stored counter only while the last activity was
    // today or yesterday (UTC); a lapsed streak reads 0 (lib/member/streakDisplay).
    currentStreak: effectiveStreak({
      currentStreak: mp?.currentStreak,
      lastActiveDate: mp?.lastActiveDate,
    }),
    longestStreak: mp?.longestStreak ?? 0,
    lastActiveDate: mp?.lastActiveDate ?? null,
  };
}

export { getStreak };
