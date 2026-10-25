import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    $executeRaw: vi.fn(async () => 0),
    memberEvent: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { recordMissionResult } from '@/lib/member/skillMissions';

const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const PROGRAM = 'data-analytics-professional-certificate-google';
const VERSION = '2026-approved-v2';
const COURSE = 'data-analytics-course-1';
const KEY = `${PROGRAM}:curriculum:${VERSION}:mission:${COURSE}`;

function override(verdict: 'passed' | 'needs_retry') {
  return recordMissionResult({
    userId: USER_ID,
    programSlug: PROGRAM,
    curriculumVersion: VERSION,
    courseSlug: COURSE,
    assignedCourseSlug: COURSE,
    result: {
      verdict,
      coachingNote: 'Admin override.',
      starStory: '',
      resumeBullet: '',
      skillsUnlocked: [],
    },
    aiToolResultId: null,
  });
}

const created = () => vi.mocked(prisma.memberEvent.create).mock.calls.map(([query]) => (query as any).data);

describe('admin skill-checkpoint override (recordMissionResult)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({} as never);
  });

  it('writes one pass for a mission with no verdict yet, under the per-mission lock', async () => {
    await override('passed');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(created()).toHaveLength(1);
    expect(created()[0]).toMatchObject({
      userId: USER_ID,
      eventName: 'skill_mission_passed',
      entityType: 'skill_checkpoint',
      entityId: KEY,
    });
    // The lock is taken before the verdict is read, so two overrides cannot both see "no pass".
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.memberEvent.findFirst).mock.invocationCallOrder[0]!,
    );
  });

  it('writes no second pass over a pass that is already stored (no duplicate partner milestone)', async () => {
    vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue({
      eventName: 'skill_mission_passed',
      metadata: { verdict: 'passed', aiToolResultId: 'artifact-1' },
    } as never);

    await override('passed');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(created()).toEqual([]);
  });

  it('passes a mission whose latest verdict is needs_retry', async () => {
    vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue({
      eventName: 'skill_mission_needs_retry',
      metadata: { verdict: 'needs_retry' },
    } as never);

    await override('passed');

    expect(created().map((event) => event.eventName)).toEqual(['skill_mission_passed']);
  });

  it('still lets an admin take a pass back with needs_retry', async () => {
    vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue({
      eventName: 'skill_mission_passed',
      metadata: { verdict: 'passed' },
    } as never);

    await override('needs_retry');

    expect(created().map((event) => event.eventName)).toEqual(['skill_mission_needs_retry']);
  });

  it('propagates a failed write so the admin route can report it', async () => {
    vi.mocked(prisma.memberEvent.create).mockRejectedValue(new Error('db down'));

    await expect(override('passed')).rejects.toThrow('db down');
  });
});
