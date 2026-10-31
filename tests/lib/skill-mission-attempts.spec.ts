import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from '@/lib/db/prisma';
import {
  commitMissionVerdict,
  releaseMissionAttempt,
  reserveMissionAttempt,
} from '@/lib/member/skillMissions';

const USER = 'member-1';
const PROGRAM = 'data-analytics-professional-certificate-google';
const VERSION = '2026-approved-v2';
const COURSE = 'data-analytics-course-1';
const KEY = `${PROGRAM}:curriculum:${VERSION}:mission:${COURSE}`;
const ARGS = {
  userId: USER,
  programSlug: PROGRAM,
  curriculumVersion: VERSION,
  courseSlug: COURSE,
  assignedCourseSlug: COURSE,
  maxAttempts: 5,
  sinceHours: 24,
};
const PASS = {
  verdict: 'passed' as const,
  coachingNote: 'Clear evidence.',
  starStory: 'A real STAR story.',
  resumeBullet: 'Delivered a measurable result.',
  skillsUnlocked: ['Analysis'],
};

type EventRow = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  eventName: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};
type EventWhere = Partial<Pick<EventRow, 'id' | 'userId' | 'entityType' | 'entityId'>> & {
  eventName?: string | { in: string[] };
  createdAt?: { gte: Date };
};

let rows: EventRow[];
let sequence: number;
let lockTails: Map<string, Promise<void>>;

function matches(row: EventRow, where: EventWhere): boolean {
  return (where.id === undefined || row.id === where.id)
    && (where.userId === undefined || row.userId === where.userId)
    && (where.entityType === undefined || row.entityType === where.entityType)
    && (where.entityId === undefined || row.entityId === where.entityId)
    && (where.eventName === undefined || (typeof where.eventName === 'string'
      ? row.eventName === where.eventName : where.eventName.in.includes(row.eventName)))
    && (where.createdAt === undefined || row.createdAt >= where.createdAt.gte);
}

/** Local state fixture: models transaction-scoped serialization, not PostgreSQL
 * lock execution. Every read/write requires the actual helper to acquire its
 * member/mission lock first; a missing lock fails instead of serializing itself.
 */
function transactionFixture() {
  let heldKey: string | null = null;
  let unlock: (() => void) | undefined;
  const checkLock = (scope: Pick<EventWhere, 'userId' | 'entityId'>) => {
    expect(heldKey).toBe(`skill-mission:${scope.userId}:${scope.entityId}`);
  };
  return {
    tx: {
      $executeRaw: async (sql: { values: unknown[] }) => {
        const key = sql.values[0];
        expect(typeof key).toBe('string');
        expect(heldKey).toBeNull();
        const previous = lockTails.get(key as string) ?? Promise.resolve();
        const current = new Promise<void>((resolve) => { unlock = resolve; });
        lockTails.set(key as string, current);
        await previous;
        heldKey = key as string;
        return 0;
      },
      memberEvent: {
        count: async ({ where }: { where: EventWhere }) => {
          checkLock(where);
          return rows.filter((row) => matches(row, where)).length;
        },
        findFirst: async ({ where }: { where: EventWhere }) => {
          checkLock(where);
          return rows.filter((row) => matches(row, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        },
        create: async ({ data }: { data: Omit<EventRow, 'id' | 'createdAt'> }) => {
          checkLock(data);
          const row = { ...data, id: `event-${++sequence}`, createdAt: new Date() };
          rows.push(row);
          return row;
        },
        deleteMany: async ({ where }: { where: EventWhere }) => {
          checkLock(where);
          const removed = rows.filter((row) => matches(row, where));
          rows = rows.filter((row) => !matches(row, where));
          return { count: removed.length };
        },
      },
    },
    close: () => unlock?.(),
  };
}

function seed(count: number, overrides: Partial<EventRow> = {}) {
  for (let index = 0; index < count; index++) {
    rows.push({
      id: `event-${++sequence}`,
      userId: USER,
      entityType: 'skill_checkpoint',
      entityId: KEY,
      eventName: 'skill_mission_submitted',
      metadata: {},
      createdAt: new Date(),
      ...overrides,
    });
  }
}

async function reserve() {
  const attempt = await reserveMissionAttempt(ARGS);
  expect(attempt.kind).toBe('reserved');
  if (attempt.kind !== 'reserved') throw new Error('Expected available attempt');
  return attempt;
}

function release(submissionId: string, overrides: Partial<Parameters<typeof releaseMissionAttempt>[0]> = {}) {
  return releaseMissionAttempt({ userId: USER, missionKey: KEY, submissionId, ...overrides });
}

function commit(verdict: 'passed' | 'needs_retry') {
  return commitMissionVerdict({
    ...ARGS,
    result: { ...PASS, verdict },
    aiToolResultId: verdict === 'passed' ? 'artifact-1' : null,
  });
}

describe('skill mission reservation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    sequence = 0;
    lockTails = new Map();
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => {
      const fixture = transactionFixture();
      try { return await callback(fixture.tx); }
      finally { fixture.close(); }
    }) as typeof prisma.$transaction);
  });

  it('admits one concurrent request into the fifth slot while its evaluation is pending', async () => {
    seed(4);
    const attempts = await Promise.all(Array.from({ length: 5 }, () => reserveMissionAttempt(ARGS)));
    expect(attempts.filter((attempt) => attempt.kind === 'reserved')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.kind === 'cap_reached')).toHaveLength(4);
    expect(rows).toHaveLength(5);
    expect(await reserveMissionAttempt(ARGS)).toEqual({ kind: 'cap_reached' });
  });

  it('releases the failed fifth attempt and permits a retry with a distinct reservation', async () => {
    seed(4);
    const failed = await reserve();
    await release(failed.submissionId);
    const retry = await reserve();
    expect(retry.submissionId).not.toBe(failed.submissionId);
    expect(rows.map((row) => row.id)).not.toContain(failed.submissionId);
    expect(rows).toHaveLength(5);
    expect(await reserveMissionAttempt(ARGS)).toEqual({ kind: 'cap_reached' });
  });

  it('repeated concurrent cleanup cannot release the replacement request', async () => {
    seed(4);
    const failed = await reserve();
    await release(failed.submissionId);
    const replacement = await reserve();
    await Promise.all([release(failed.submissionId), release(failed.submissionId)]);
    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.id === replacement.submissionId)).toBeDefined();
    expect(await reserveMissionAttempt(ARGS)).toEqual({ kind: 'cap_reached' });
  });

  it.each([
    ['another member', { userId: 'another-member' }],
    ['another mission', { missionKey: `${KEY}-another` }],
    ['another reservation', { submissionId: 'missing-event' }],
  ])('does not release a reservation using %s', async (_description, overrides) => {
    const pending = await reserve();
    await release(pending.submissionId, overrides);
    expect(rows.map((row) => row.id)).toEqual([pending.submissionId]);
  });

  it('never deletes a verdict or an event of another entity type', async () => {
    seed(1, { eventName: 'skill_mission_passed', metadata: PASS });
    seed(1, { entityType: 'another_entity' });
    const ids = rows.map((row) => row.id);
    await Promise.all(ids.map((id) => release(id)));
    expect(rows.map((row) => row.id)).toEqual(ids);
  });

  it.each(['passed', 'needs_retry'] as const)('counts all five completed %s evaluations', async (verdict) => {
    for (let index = 0; index < 5; index++) {
      await reserve();
      await commit(verdict);
    }
    expect(rows.filter((row) => row.eventName === 'skill_mission_submitted')).toHaveLength(5);
    expect(await reserveMissionAttempt(ARGS)).toEqual({ kind: 'cap_reached' });
    if (verdict === 'passed') {
      expect(rows.filter((row) => row.eventName === 'skill_mission_passed')).toHaveLength(1);
    }
  });

  it('counts practice after a pass and preserves the single stored pass over non-passing practice', async () => {
    await reserve();
    await commit('passed');
    const originalPass = rows.find((row) => row.eventName === 'skill_mission_passed');
    for (let index = 0; index < 4; index++) {
      expect((await reserve()).alreadyPassed).toBe(true);
      expect(await commit('needs_retry')).toMatchObject({ kind: 'already_passed', aiToolResultId: 'artifact-1' });
    }
    expect(rows.filter((row) => row.eventName === 'skill_mission_passed')).toEqual([originalPass]);
    expect(rows.filter((row) => row.eventName === 'skill_mission_needs_retry')).toHaveLength(0);
    expect(await reserveMissionAttempt(ARGS)).toEqual({ kind: 'cap_reached' });
  });

  it('counts only this member and mission in the trailing 24 hour window', async () => {
    seed(5, { userId: 'another-member' });
    seed(5, { entityId: `${KEY}-another` });
    seed(5, { createdAt: new Date(Date.now() - 25 * 3_600_000) });
    const available = await reserve();
    expect(rows.find((row) => row.id === available.submissionId)?.entityId).toBe(KEY);
  });
});
