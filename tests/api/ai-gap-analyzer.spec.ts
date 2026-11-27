// @vitest-environment node
/**
 * POST /api/ai/gap-analyzer spends an LLM call. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Act-on-behalf refusal is before the model. Missing resume with
 * prefill is 400. Omit-resume without prefill currently still calls the
 * model (pinned). Save failures still 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  prefillGapAnalyzer: vi.fn(),
  loadCoachContextBlock: vi.fn(),
  ensureUserInDb: vi.fn(),
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

vi.mock('@/lib/ai/prefillFromMemberState', () => ({
  prefillGapAnalyzer: h.prefillGapAnalyzer,
  honestNoResumeError: () => ({
    error: 'We need a resume to tailor this for you. Upload one at /dashboard/resume, then come back.',
    status: 400,
  }),
}));

vi.mock('@/lib/ai/coachContextBlock', () => ({
  loadCoachContextBlock: h.loadCoachContextBlock,
}));

const { POST } = await import('@/app/api/ai/gap-analyzer/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

const RESUME =
  'Help desk specialist, 2019-2021. Then a caregiving break. Returned in 2023 as an IT support tech for a clinic, resolving tickets and imaging laptops.';

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/gap-analyzer', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/gap-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.ifAiUnconfigured.mockReturnValue(null);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.resolveActOnBehalf.mockResolvedValue({
      ok: true,
      subjectUserId: USER_ID,
      isOnBehalf: false,
      actorUserId: USER_ID,
      actorName: 'Test User',
    });
    h.prefillGapAnalyzer.mockResolvedValue({ resume: '' });
    h.loadCoachContextBlock.mockResolvedValue('');
    h.chatCompletion.mockResolvedValue('GAP 1: 2021-2023 — caregiving. Framing: family care.');
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
  });

  it('returns 401 before AI-config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(401);
    expect(h.ifAiUnconfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
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
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before parse when over quota', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Rate limit exceeded. Please try again in a few minutes.',
    });
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without calling the model', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/gap-analyzer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when a provided resume is shorter than 100 characters', async () => {
    const res = await POST(postRequest({ resume: 'too short' }) as never);
    expect(res.status).toBe(400);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when prefill is on and there is no resume on file', async () => {
    const res = await POST(postRequest({ prefill: true }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'We need a resume to tailor this for you. Upload one at /dashboard/resume, then come back.',
    });
    expect(h.prefillGapAnalyzer).toHaveBeenCalledWith(USER_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('currently still calls the model when resume is omitted and prefill is off (pinned)', async () => {
    const res = await POST(postRequest({}) as never);
    expect(res.status).toBe(200);
    expect(h.prefillGapAnalyzer).not.toHaveBeenCalled();
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain('undefined');
  });

  it('returns act-on-behalf status before the model when the actor cannot run for that member', async () => {
    h.resolveActOnBehalf.mockResolvedValue({ ok: false, status: 404, error: 'Member not found' });
    const res = await POST(
      postRequest({ resume: RESUME, subjectMemberId: SUBJECT_ID }) as never,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.resolveActOnBehalf).toHaveBeenCalledWith(USER_ID, SUBJECT_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates the resume into the user prompt', async () => {
    const res = await POST(postRequest({ resume: `${RESUME} javascript:alert(1)` }) as never);
    expect(res.status).toBe(200);
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain(RESUME);
    expect(userMessage.content).toContain('javascript:alert(1)');
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'gap_analyzer',
      expect.stringContaining('Help desk specialist'),
      expect.stringContaining('GAP 1'),
      expect.objectContaining({ actorUserId: USER_ID }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).output).toContain('GAP 1');
  });

  it('returns 500 when the model returns empty output', async () => {
    h.chatCompletion.mockResolvedValue('');
    const res = await POST(postRequest({ resume: RESUME }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'We could not generate a response. Please try again.',
    });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });
});
