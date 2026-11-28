import assert from 'node:assert/strict';
import test from 'node:test';
import { getMemberBadges, type MemberBadgesDb } from './badges';
import { CELEBRATION_NOTE_PREFIX } from './badgesConfig';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

type Row = { event: string; entityId: string; note: string | null; createdAt: Date };

/** A db double that records exactly what getMemberBadges asks for. */
function fakeDb(rows: Row[], points: Record<string, unknown> | null): {
  db: MemberBadgesDb;
  calls: { where?: unknown; select?: unknown }[];
  pointReads: string[];
} {
  const calls: { where?: unknown; select?: unknown }[] = [];
  const pointReads: string[] = [];
  const db: MemberBadgesDb = {
    pointsTransaction: {
      findMany: async (args) => {
        calls.push(args);
        return rows;
      },
    },
    memberPoints: {
      findUnique: async (args) => {
        pointReads.push(args.where.userId);
        return points as Awaited<ReturnType<MemberBadgesDb['memberPoints']['findUnique']>>;
      },
    },
  };
  return { db, calls, pointReads };
}

test('getMemberBadges reads the five badge events once and the streak from member points', async () => {
  const { db, calls, pointReads } = fakeDb(
    [
      { event: 'job_application', entityId: 'a', note: null, createdAt: at('2026-06-01') },
      { event: 'job_application', entityId: 'b', note: null, createdAt: at('2026-06-02') },
      { event: 'job_application', entityId: 'c', note: null, createdAt: at('2026-06-03') },
      {
        event: 'certification_earned',
        entityId: 'progress-1',
        note: `${CELEBRATION_NOTE_PREFIX} IT Support`,
        createdAt: at('2026-06-04'),
      },
    ],
    { currentStreak: 9, longestStreak: 4, lastActiveDate: at('2026-06-03') },
  );

  const result = await getMemberBadges('member-1', db);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, {
    userId: 'member-1',
    event: {
      in: [
        'assessment_completed',
        'resume_uploaded',
        'job_application',
        'course_completed',
        'certification_earned',
      ],
    },
  });
  assert.deepEqual(pointReads, ['member-1']);

  const hunter = result.badges.find((badge) => badge.key === 'job_hunter');
  assert.equal(hunter?.earned, true);
  assert.equal(hunter?.earnedAt, at('2026-06-03').toISOString());
  const certified = result.badges.find((badge) => badge.key === 'certified');
  assert.equal(certified?.earned, false);

  // The stored counter is 9 but the last activity is months before "now", so
  // the live streak reads 0. The badge uses the best streak, which never lapses.
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 4);
  assert.equal(result.badges.find((badge) => badge.key === 'streak_7')?.earned, false);
});

test('getMemberBadges earns the streak badge from the best streak and shows a live current streak', async () => {
  const today = new Date();
  const { db } = fakeDb([], {
    currentStreak: 3,
    longestStreak: 8,
    lastActiveDate: today,
  });

  const result = await getMemberBadges('member-2', db);

  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 8);
  assert.equal(result.badges.find((badge) => badge.key === 'streak_7')?.earned, true);
  assert.ok(result.badges.filter((badge) => badge.key !== 'streak_7').every((badge) => !badge.earned));
});

test('getMemberBadges with no points row returns zeros and no earned badges', async () => {
  const { db } = fakeDb([], null);
  const result = await getMemberBadges('member-3', db);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
  assert.ok(result.badges.every((badge) => !badge.earned));
});
