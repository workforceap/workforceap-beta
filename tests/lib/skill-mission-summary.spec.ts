import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { memberEvent: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/db/prisma';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';
import {
  buildSkillMissionEventKey,
  resolveSkillMissionsForCurriculum,
} from '@/lib/member/skillMissionCurriculum';

const PROGRAM = 'data-analytics-professional-certificate-google';
const VERSION = '2026-approved-v2';
const resolved = resolveSkillMissionsForCurriculum({ programSlug: PROGRAM, curriculumVersion: VERSION });
const keyOf = (index: number) => buildSkillMissionEventKey({
  programSlug: PROGRAM,
  curriculumVersion: VERSION,
  missionCourseSlug: resolved[index]!.definition.courseSlug,
});
const unlockOf = (index: number) => resolved[index]!.unlockSlugs[0]!;

let clock = 0;
function event(index: number, eventName: 'skill_mission_passed' | 'skill_mission_needs_retry') {
  clock += 1000;
  return {
    eventName,
    entityId: keyOf(index),
    createdAt: new Date(1_700_000_000_000 + clock),
    metadata: {
      verdict: eventName === 'skill_mission_passed' ? 'passed' : 'needs_retry',
      coachingNote: 'Note.',
      starStory: eventName === 'skill_mission_passed' ? 'Story.' : '',
      resumeBullet: eventName === 'skill_mission_passed' ? 'Bullet.' : '',
      skillsUnlocked: eventName === 'skill_mission_passed' ? ['Analysis'] : [],
      aiToolResultId: null,
    },
  };
}

function load(completed: number[], events: ReturnType<typeof event>[]) {
  vi.mocked(prisma.memberEvent.findMany).mockResolvedValue(events as never);
  return loadSkillMissionSummary({
    userId: 'user-1',
    programSlug: PROGRAM,
    curriculumVersion: VERSION,
    completedCourseSlugs: completed.map(unlockOf),
  });
}

describe('loadSkillMissionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clock = 0;
  });

  it('has at least two missions for the fixture program', () => {
    expect(resolved.length).toBeGreaterThanOrEqual(2);
  });

  it('reads only this member\'s mission events, newest verdict wins', async () => {
    const summary = await load([0, 1], [event(0, 'skill_mission_needs_retry'), event(0, 'skill_mission_passed')]);
    const where = (vi.mocked(prisma.memberEvent.findMany).mock.calls[0]![0] as any).where;
    expect(where.userId).toBe('user-1');
    expect(where.entityType).toBe('skill_checkpoint');
    expect(where.eventName).toEqual({ in: ['skill_mission_passed', 'skill_mission_needs_retry'] });
    expect(summary!.missions[0]!.status).toBe('passed');
    expect(summary!.missions[0]!.latestResult?.resumeBullet).toBe('Bullet.');
  });

  it('is locked until the course is complete, whatever the events say', async () => {
    const summary = await load([], [event(0, 'skill_mission_passed')]);
    expect(summary!.missions[0]!.status).toBe('locked');
    expect(summary!.passedCount).toBe(0);
  });

  it('is ready with no verdict yet and needs-retry after a non-pass', async () => {
    const summary = await load([0, 1], [event(1, 'skill_mission_needs_retry')]);
    expect(summary!.missions[0]!.status).toBe('ready');
    expect(summary!.missions[1]!.status).toBe('needs_retry');
    expect(summary!.readyCount).toBe(1);
    expect(summary!.retryCount).toBe(1);
  });

  it('counts the streak as missions passed in a row from the first one', async () => {
    const all = resolved.map((_, i) => i);
    const firstTwo = await load(all, [event(0, 'skill_mission_passed'), event(1, 'skill_mission_passed')]);
    expect(firstTwo!.streak).toBe(2);
    // A pass later in the list does not count toward a run that starts at the first mission.
    const gap = await load(all, [event(1, 'skill_mission_passed')]);
    expect(gap!.streak).toBe(0);
    // Passing only the last mission used to read as a streak of 1.
    const last = await load(all, [event(resolved.length - 1, 'skill_mission_passed')]);
    expect(last!.streak).toBe(0);
  });

  it('never ships quiz answers or explanations to the client', async () => {
    const summary = await load([0], []);
    const question = summary!.missions[0]!.quizQuestions[0]! as Record<string, unknown>;
    expect(Object.keys(question).sort()).toEqual(['options', 'text']);
  });

  it('returns nothing without a program or catalog missions', async () => {
    expect(await loadSkillMissionSummary({ userId: 'u', programSlug: null, curriculumVersion: VERSION, completedCourseSlugs: [] })).toBeNull();
    expect(prisma.memberEvent.findMany).not.toHaveBeenCalled();
  });
});
