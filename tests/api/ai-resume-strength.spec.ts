// @vitest-environment node
/**
 * POST /api/ai/resume-strength spends an LLM call. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Act-on-behalf refusal is before analysis. Save failures still 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  loadCoachContextBlock: vi.fn(),
  ensureUserInDb: vi.fn(),
  analyzeResume: vi.fn(),
  scoreStructural: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: h.ensureUserInDb,
}));

vi.mock('@/lib/ai/aiUnavailableResponse', () => ({
  ifAiUnconfigured: h.ifAiUnconfigured,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: h.checkAIToolRateLimit,
}));

vi.mock('@/lib/ai/groq', () => ({
  chatCompletion: h.chatCompletion,
  isAIConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/ai/saveResult', () => ({
  saveAIToolResult: h.saveAIToolResult,
}));

vi.mock('@/lib/auth/actAsSubject', () => ({
  resolveActOnBehalf: h.resolveActOnBehalf,
}));

vi.mock('@/lib/ai/coachContextBlock', () => ({
  loadCoachContextBlock: h.loadCoachContextBlock,
}));

vi.mock('@/lib/ai/resumeScore', () => ({
  analyzeResume: h.analyzeResume,
  scoreStructural: h.scoreStructural,
}));

const { POST } = await import('@/app/api/ai/resume-strength/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

const RESUME =
  'Pat Rivera\nHelp desk specialist with five years supporting Windows, Active Directory, and ticket queues in healthcare IT. Trained three new hires and documented the shortest path to yes.';

function analysis(narrative: string | null) {
  return {
    composite: 72,
    pillars: {
      structural: { score: 70, label: 'Structure & ATS basics' },
      onetCoverage: null,
      marketCoverage: null,
    },
    structural: { composite: 70, breakdown: {} },
    occupations: [],
    onetCoverage: [],
    marketCoverage: [],
    narrative,
    diagnostics: { structuralMs: 0, occupationsMs: 0, onetMs: 0, marketMs: 0, synthesisMs: 0 },
  };
}

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/resume-strength', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/resume-strength', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID, email: 'pat@example.test' });
    h.ifAiUnconfigured.mockReturnValue(null);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.resolveActOnBehalf.mockResolvedValue({
      ok: true,
      subjectUserId: USER_ID,
      isOnBehalf: false,
      actorUserId: USER_ID,
      actorName: 'Pat Rivera',
    });
    h.loadCoachContextBlock.mockResolvedValue('');
    h.analyzeResume.mockResolvedValue(analysis('OVERALL SCORE: 72%\nSTRENGTHS:\n• Tickets'));
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
  });

  it('returns 401 before AI-config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(401);
    expect(h.ifAiUnconfigured).not.toHaveBeenCalled();
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.analyzeResume).not.toHaveBeenCalled();
  });

  it('returns 503 before rate-limit when AI is unconfigured', async () => {
    h.ifAiUnconfigured.mockReturnValue(
      new Response(JSON.stringify({ error: 'unconfigured', code: 'ai_unconfigured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.analyzeResume).not.toHaveBeenCalled();
  });

  it('returns 429 before parse when over quota', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Rate limit exceeded. Please try again in a few minutes.',
    });
    expect(h.checkAIToolRateLimit).toHaveBeenCalledWith(USER_ID);
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.analyzeResume).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without analyzing', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/resume-strength', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.analyzeResume).not.toHaveBeenCalled();
  });

  it('returns 400 when resume is shorter than 100 characters', async () => {
    const res = await POST(postRequest({ resume: 'too short for analysis' }) as never);
    expect(res.status).toBe(400);
    expect(h.analyzeResume).not.toHaveBeenCalled();
  });

  it('returns act-on-behalf status before analysis when the actor cannot run for that member', async () => {
    h.resolveActOnBehalf.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const res = await POST(
      postRequest({ resume: RESUME, subjectMemberId: SUBJECT_ID }) as never,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.resolveActOnBehalf).toHaveBeenCalledWith(USER_ID, SUBJECT_ID);
    expect(h.analyzeResume).not.toHaveBeenCalled();
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('passes the resume and coach context into analyzeResume', async () => {
    h.loadCoachContextBlock.mockResolvedValue('\n\nPrior rewrite for Help desk.');
    const hostile = `${RESUME}\n<script>steal()</script>`;
    const res = await POST(postRequest({ resume: hostile }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output).toContain('OVERALL SCORE: 72%');
    expect(body.composite).toBe(72);
    expect(h.analyzeResume).toHaveBeenCalledWith(hostile, {
      coachContextBlock: '\n\nPrior rewrite for Help desk.',
    });
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'resume_analysis',
      'Resume strength',
      'OVERALL SCORE: 72%\nSTRENGTHS:\n• Tickets',
      expect.objectContaining({ actorUserId: USER_ID }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).output).toContain('OVERALL SCORE: 72%');
  });

  it('returns 500 when analysis has no narrative', async () => {
    h.analyzeResume.mockResolvedValue(analysis(null));
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'We could not generate a response. Please try again.',
    });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('falls back to the legacy model call when analyzeResume throws', async () => {
    h.analyzeResume.mockRejectedValue(new Error('pipeline down'));
    h.scoreStructural.mockReturnValue({ composite: 40, breakdown: {} });
    h.chatCompletion.mockResolvedValue('OVERALL SCORE: 19%\nSTRENGTHS:\n• Persistence');
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).output).toContain('OVERALL SCORE: 19%');
    expect(h.chatCompletion).toHaveBeenCalled();
    const [messages] = h.chatCompletion.mock.calls[0];
    expect(messages[1].content).toContain(RESUME);
  });
});
