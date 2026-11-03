import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    $executeRaw: vi.fn(async () => 0),
    user: { findUnique: vi.fn() },
    courseProgress: { findFirst: vi.fn() },
    memberEvent: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/ai/skillMissionEval', () => ({
  MissionEvalUnavailableError: class MissionEvalUnavailableError extends Error {},
  evaluateSkillMission: vi.fn(),
  saveMissionArtifact: vi.fn(),
  discardMissionArtifact: vi.fn(),
}));

import { POST as evaluateMission } from '@/app/api/skill-missions/[courseSlug]/evaluate/route';
import { POST as checkQuiz } from '@/app/api/skill-missions/[courseSlug]/quiz-check/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import {
  discardMissionArtifact,
  evaluateSkillMission,
  MissionEvalUnavailableError,
  saveMissionArtifact,
} from '@/lib/ai/skillMissionEval';

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROGRAM = 'data-analytics-professional-certificate-google';
const VERSION = '2026-approved-v2';
const COURSE = 'data-analytics-course-1';
const MISSION_KEY = `${PROGRAM}:curriculum:${VERSION}:mission:${COURSE}`;
const GOOD_RESPONSE = 'I cleaned the sales export, joined it to the regions table, and shared a short summary.';

const PASS = {
  verdict: 'passed' as const,
  coachingNote: 'Clear evidence.',
  starStory: 'A concise STAR story.',
  resumeBullet: 'Delivered a measurable result.',
  skillsUnlocked: ['Analysis', 'Communication'],
};
const RETRY = {
  verdict: 'needs_retry' as const,
  coachingNote: 'Add the result you reached.',
  starStory: '',
  resumeBullet: '',
  skillsUnlocked: [],
};

function evaluateRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/skill-missions/${COURSE}/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      missionKey: MISSION_KEY,
      quizAnswers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 0 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
      scenarioResponse: GOOD_RESPONSE,
      ...overrides,
    }),
  });
}

const params = { params: Promise.resolve({ courseSlug: COURSE }) };
const evaluate = (request: Request) => evaluateMission(request as any, params);

function enrolled(programSlug = PROGRAM) {
  return {
    enrolledProgram: programSlug,
    courseEnrollments: [{ programSlug, curriculumVersion: VERSION, isPrimary: true }],
  };
}

function createdEventNames(): string[] {
  return vi.mocked(prisma.memberEvent.create).mock.calls.map(([query]) => (query as any).data.eventName);
}

describe('POST /api/skill-missions/[courseSlug]/evaluate hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: USER_ID, email: 'member@example.test' } as any);
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: true });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(enrolled() as any);
    vi.mocked(prisma.courseProgress.findFirst).mockResolvedValue({ id: 'progress-1' } as any);
    vi.mocked(prisma.memberEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({ id: 'submission-1' } as any);
    vi.mocked(prisma.memberEvent.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(evaluateSkillMission).mockResolvedValue(PASS);
    vi.mocked(saveMissionArtifact).mockResolvedValue('artifact-1');
    vi.mocked(discardMissionArtifact).mockResolvedValue(undefined);
  });

  describe('input and scope', () => {
    it('rejects an anonymous caller before any read, write or AI call', async () => {
      vi.mocked(getUser).mockResolvedValue(null as any);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('unauthorized');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
      expect(evaluateSkillMission).not.toHaveBeenCalled();
    });

    it('stops at the AI rate limit before reading the body', async () => {
      vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: false });
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe('rate_limited');
      expect(checkAIToolRateLimit).toHaveBeenCalledWith(USER_ID);
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    });

    it.each([
      ['whitespace in place of an answer', { scenarioResponse: ' '.repeat(60) }],
      ['a response that is short once trimmed', { scenarioResponse: `   ${'a'.repeat(10)}   ` }],
      ['a response over the length cap', { scenarioResponse: 'a'.repeat(4001) }],
      ['a repeated quiz question', {
        quizAnswers: [
          { questionIndex: 0, selectedIndex: 0 },
          { questionIndex: 0, selectedIndex: 1 },
          { questionIndex: 2, selectedIndex: 0 },
        ],
      }],
      ['an option index outside 0 to 3', {
        quizAnswers: [
          { questionIndex: 0, selectedIndex: 4 },
          { questionIndex: 1, selectedIndex: 0 },
          { questionIndex: 2, selectedIndex: 0 },
        ],
      }],
      ['too few quiz answers', { quizAnswers: [{ questionIndex: 0, selectedIndex: 0 }] }],
      ['an empty mission key', { missionKey: '' }],
    ])('rejects %s with 400 and no AI call or write', async (_label, overrides) => {
      const res = await evaluate(evaluateRequest(overrides));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    });

    it('rejects a body that is not JSON', async () => {
      const res = await evaluate(new Request('http://localhost/x', { method: 'POST', body: 'not json' }));
      expect(res.status).toBe(400);
      expect(evaluateSkillMission).not.toHaveBeenCalled();
    });

    it('trims the response before it reaches the evaluator', async () => {
      const res = await evaluate(evaluateRequest({ scenarioResponse: `  ${GOOD_RESPONSE}  ` }));
      expect(res.status).toBe(200);
      expect(evaluateSkillMission).toHaveBeenCalledWith(expect.objectContaining({ scenarioResponse: GOOD_RESPONSE }));
    });

    it('binds the mission to the signed-in member: no enrollment means 403 and nothing runs', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: null, courseEnrollments: [] } as any);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('not_enrolled');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    });

    it('refuses a mission from a program the member is not in', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(enrolled('it-support-professional-certificate-ibm') as any);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(403);
      expect(evaluateSkillMission).not.toHaveBeenCalled();
    });

    it('refuses an unknown mission course with 404', async () => {
      const res = await evaluateMission(evaluateRequest() as any, { params: Promise.resolve({ courseSlug: 'not-a-course' }) });
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('mission_not_found');
      expect(evaluateSkillMission).not.toHaveBeenCalled();
    });

    it('refuses an attempt before the course is complete', async () => {
      vi.mocked(prisma.courseProgress.findFirst).mockResolvedValue(null);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('course_incomplete');
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
      expect(evaluateSkillMission).not.toHaveBeenCalled();
    });
  });

  describe('idempotency and cost control', () => {
    it('stores a submission, then one pass, each under the per-mission lock', async () => {
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ ok: true, verdict: 'passed', aiToolResultId: 'artifact-1' });
      expect(body.alreadyPassed).toBeUndefined();
      expect(createdEventNames()).toEqual(['skill_mission_submitted', 'skill_mission_passed']);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(saveMissionArtifact).toHaveBeenCalledTimes(1);
      expect(prisma.memberEvent.deleteMany).not.toHaveBeenCalled();
      expect(saveMissionArtifact).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, starStory: PASS.starStory }));
      const passed = vi.mocked(prisma.memberEvent.create).mock.calls[1]![0] as any;
      expect(passed.data.userId).toBe(USER_ID);
      expect(passed.data.entityId).toBe(MISSION_KEY);
      expect(passed.data.metadata).toMatchObject({ verdict: 'passed', aiToolResultId: 'artifact-1' });
    });

    const storedPassEvent = {
      eventName: 'skill_mission_passed',
      metadata: { ...PASS, aiToolResultId: 'stored-artifact' },
    };

    it('lets a passed member practise again but writes no second pass and saves no second artifact', async () => {
      vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue(storedPassEvent as any);
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        verdict: 'passed',
        alreadyPassed: true,
        aiToolResultId: 'stored-artifact',
      });
      expect(evaluateSkillMission).toHaveBeenCalledTimes(1);
      expect(saveMissionArtifact).not.toHaveBeenCalled();
      expect(createdEventNames()).toEqual(['skill_mission_submitted']);
      expect(prisma.memberEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('does not let a practice attempt that fails undo an earlier pass', async () => {
      vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue(storedPassEvent as any);
      vi.mocked(evaluateSkillMission).mockResolvedValue(RETRY);
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ ok: true, verdict: 'needs_retry', alreadyPassed: true, coachingNote: RETRY.coachingNote });
      expect(createdEventNames()).toEqual(['skill_mission_submitted']);
    });

    it('still applies the daily cap to practice after a pass', async () => {
      vi.mocked(prisma.memberEvent.findFirst).mockResolvedValue(storedPassEvent as any);
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(5);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe('attempt_cap');
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    });

    it('does not let a non-pass undo a pass stored by a parallel request', async () => {
      vi.mocked(prisma.memberEvent.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ eventName: 'skill_mission_passed', metadata: { ...PASS, aiToolResultId: 'winner' } } as any);
      vi.mocked(evaluateSkillMission).mockResolvedValue(RETRY);
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ ok: true, verdict: 'needs_retry', alreadyPassed: true, aiToolResultId: 'winner' });
      expect(createdEventNames()).toEqual(['skill_mission_submitted']);
    });

    it('drops its own Resume Studio copy when a parallel request stored the pass first', async () => {
      vi.mocked(prisma.memberEvent.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ eventName: 'skill_mission_passed', metadata: { ...PASS, aiToolResultId: 'winner' } } as any);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(200);
      expect(saveMissionArtifact).toHaveBeenCalledTimes(1);
      expect(discardMissionArtifact).toHaveBeenCalledWith(USER_ID, 'artifact-1');
      expect(createdEventNames()).toEqual(['skill_mission_submitted']);
    });

    it('stops at the daily cap before spending an AI call or writing anything', async () => {
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(5);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe('attempt_cap');
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(prisma.memberEvent.create).not.toHaveBeenCalled();
    });

    it('counts the cap over the trailing 24 hours for this member and mission only', async () => {
      await evaluate(evaluateRequest());
      const where = (vi.mocked(prisma.memberEvent.count).mock.calls[0]![0] as any).where;
      expect(where).toMatchObject({
        userId: USER_ID,
        entityId: MISSION_KEY,
        eventName: 'skill_mission_submitted',
      });
      const hours = (Date.now() - where.createdAt.gte.getTime()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
    });
  });

  describe('safe failure and truthful pass state', () => {
    it.each([
      ['unavailable', () => new MissionEvalUnavailableError(), 503, 'coach_unavailable'],
      ['timeout', () => new DOMException('Provider timed out', 'TimeoutError'), 500, 'server_error'],
      ['unexpected provider error', () => new Error('Provider connection reset'), 500, 'server_error'],
    ])('releases an ungraded attempt after %s', async (_label, error, status, code) => {
      vi.mocked(evaluateSkillMission).mockRejectedValue(error());
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(status);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/not graded/i);
      expect(body.code).toBe(code);
      expect(body.error).not.toContain('—');
      expect(createdEventNames()).toEqual(['skill_mission_submitted']);
      expect(prisma.memberEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'submission-1', userId: USER_ID, entityType: 'skill_checkpoint',
          entityId: MISSION_KEY, eventName: 'skill_mission_submitted',
        },
      });
      expect(saveMissionArtifact).not.toHaveBeenCalled();
    });

    it('keeps the original retryable error when reservation cleanup is unavailable', async () => {
      vi.mocked(evaluateSkillMission).mockRejectedValue(new MissionEvalUnavailableError());
      vi.mocked(prisma.memberEvent.deleteMany).mockRejectedValue(new Error('db unavailable'));
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, code: 'coach_unavailable' });
      expect(prisma.memberEvent.deleteMany).toHaveBeenCalledTimes(1);
      expect(saveMissionArtifact).not.toHaveBeenCalled();
    });

    it('charges the hourly AI limiter again on a retry after provider failure', async () => {
      vi.mocked(evaluateSkillMission)
        .mockRejectedValueOnce(new MissionEvalUnavailableError())
        .mockResolvedValueOnce(PASS);
      expect((await evaluate(evaluateRequest())).status).toBe(503);
      expect((await evaluate(evaluateRequest())).status).toBe(200);
      expect(checkAIToolRateLimit).toHaveBeenCalledTimes(2);
      expect(evaluateSkillMission).toHaveBeenCalledTimes(2);
      expect(prisma.memberEvent.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('does not report a pass that could not be stored, and removes the artifact it saved', async () => {
      vi.mocked(prisma.memberEvent.create)
        .mockResolvedValueOnce({ id: 'submission-1' } as any)
        .mockRejectedValueOnce(new Error('db down'));
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body).toEqual({ ok: false, error: expect.stringMatching(/not marked passed/i), code: 'save_failed' });
      expect(discardMissionArtifact).toHaveBeenCalledWith(USER_ID, 'artifact-1');
      expect(prisma.memberEvent.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('still returns coaching for a non-pass that could not be stored', async () => {
      vi.mocked(evaluateSkillMission).mockResolvedValue(RETRY);
      vi.mocked(prisma.memberEvent.create)
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('db down'));
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ ok: true, verdict: 'needs_retry', starStory: '', resumeBullet: '' });
      expect(saveMissionArtifact).not.toHaveBeenCalled();
      expect(prisma.memberEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('stores a non-pass as needs-retry and never as a pass', async () => {
      vi.mocked(evaluateSkillMission).mockResolvedValue(RETRY);
      const res = await evaluate(evaluateRequest());
      expect(res.status).toBe(200);
      expect(createdEventNames()).toEqual(['skill_mission_submitted', 'skill_mission_needs_retry']);
      expect(saveMissionArtifact).not.toHaveBeenCalled();
      expect(prisma.memberEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('answers a database failure while claiming the attempt with a friendly 500 and no AI call', async () => {
      vi.mocked(prisma.memberEvent.count).mockRejectedValue(new Error('db down'));
      const res = await evaluate(evaluateRequest());
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toMatch(/not graded/i);
      expect(body.code).toBe('server_error');
      expect(body.error).not.toMatch(/internal server error/i);
      expect(evaluateSkillMission).not.toHaveBeenCalled();
      expect(createdEventNames()).toEqual([]);
    });

    it('passes the server-graded quiz count, never a client value', async () => {
      await evaluate(evaluateRequest({ correct: true, quizCorrectCount: 3 }));
      const call = vi.mocked(evaluateSkillMission).mock.calls[0]![0];
      expect(call.quizTotal).toBe(3);
      expect(call.quizCorrectCount).toBeGreaterThanOrEqual(0);
      expect(call.quizCorrectCount).toBeLessThanOrEqual(3);
      expect(call.userId).toBe(USER_ID);
    });
  });
});

describe('POST /api/skill-missions/[courseSlug]/quiz-check gates', () => {
  const quizRequest = (overrides: Record<string, unknown> = {}) => new Request(
    `http://localhost/api/skill-missions/${COURSE}/quiz-check`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ missionKey: MISSION_KEY, questionIndex: 0, selectedIndex: 0, ...overrides }),
    },
  );
  const check = (request: Request) => checkQuiz(request as any, params);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: USER_ID } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(enrolled() as any);
    vi.mocked(prisma.courseProgress.findFirst).mockResolvedValue({ id: 'progress-1' } as any);
  });

  it('rejects an anonymous caller', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);
    expect((await check(quizRequest())).status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['an option index outside 0 to 3', { selectedIndex: 9 }],
    ['a question index outside 0 to 2', { questionIndex: 3 }],
    ['a non-integer answer', { selectedIndex: 1.5 }],
  ])('rejects %s', async (_label, overrides) => {
    expect((await check(quizRequest(overrides))).status).toBe(400);
    expect(prisma.courseProgress.findFirst).not.toHaveBeenCalled();
  });

  it('reveals no answer to a member who is not enrolled in the program', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: null, courseEnrollments: [] } as any);
    const res = await check(quizRequest());
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('correctIndex');
  });

  it('reveals no answer before the course is complete', async () => {
    vi.mocked(prisma.courseProgress.findFirst).mockResolvedValue(null);
    const res = await check(quizRequest());
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('correctIndex');
  });

  it('grades one answer after the course is complete and writes nothing', async () => {
    const res = await check(quizRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.correct).toBe('boolean');
    expect(body.correctIndex).toBeGreaterThanOrEqual(0);
    expect(typeof body.explanation).toBe('string');
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });
});
