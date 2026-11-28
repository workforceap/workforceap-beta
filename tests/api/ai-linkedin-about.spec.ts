// @vitest-environment node
/**
 * POST /api/ai/linkedin-about spends an LLM call. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Act-on-behalf refusal is before the model. Save failures still
 * 200. Role and bullets are interpolated into the user prompt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  prefillLinkedInAbout: vi.fn(),
  getAICoachContext: vi.fn(),
  renderCoachContextForPrompt: vi.fn(),
  getMemberResumePlainText: vi.fn(),
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
  prefillLinkedInAbout: h.prefillLinkedInAbout,
}));

vi.mock('@/lib/ai/aiCoachContext', () => ({
  getAICoachContext: h.getAICoachContext,
  renderCoachContextForPrompt: h.renderCoachContextForPrompt,
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: h.getMemberResumePlainText,
}));

const { POST } = await import('@/app/api/ai/linkedin-about/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARENT_ID = '550e8400-e29b-41d4-a716-446655440003';

const validBody = {
  role: 'Help desk specialist',
  bullets: 'Resolved tickets, trained new hires, and kept SLA green.',
};

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/linkedin-about', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/linkedin-about', () => {
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
    h.prefillLinkedInAbout.mockResolvedValue({ targetRole: null, resume: null });
    h.getAICoachContext.mockResolvedValue({});
    h.renderCoachContextForPrompt.mockReturnValue('');
    h.getMemberResumePlainText.mockResolvedValue('');
    h.chatCompletion.mockResolvedValue('I help people get back to work. I fix tickets. I want the next desk.');
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
  });

  it('returns 401 before AI-config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(401);
    expect(h.ifAiUnconfigured).not.toHaveBeenCalled();
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 before rate-limit when AI is unconfigured', async () => {
    h.ifAiUnconfigured.mockReturnValue(
      new Response(JSON.stringify({ error: 'unconfigured', code: 'ai_unconfigured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before parse when over quota', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Rate limit exceeded. Please try again in a few minutes.',
    });
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without calling the model', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/linkedin-about', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when a provided role is too short', async () => {
    const res = await POST(postRequest({ role: 'x', bullets: validBody.bullets }) as never);
    expect(res.status).toBe(400);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns act-on-behalf status before the model when the actor cannot run for that member', async () => {
    h.resolveActOnBehalf.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const res = await POST(
      postRequest({ ...validBody, subjectMemberId: SUBJECT_ID }) as never,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.resolveActOnBehalf).toHaveBeenCalledWith(USER_ID, SUBJECT_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('interpolates role and bullets and threads parentToolResultId onto the save', async () => {
    h.getMemberResumePlainText.mockResolvedValue('x'.repeat(90));
    const res = await POST(
      postRequest({
        role: 'Help desk<script>',
        bullets: 'javascript:alert(1) and ticket recovery work.',
        parentToolResultId: PARENT_ID,
      }) as never,
    );
    expect(res.status).toBe(200);
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain('Help desk<script>');
    expect(userMessage.content).toContain('javascript:alert(1) and ticket recovery work.');
    expect(userMessage.content).toContain('x'.repeat(90));
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'linkedin_about',
      expect.stringContaining('Help desk<script>'),
      expect.stringContaining('I help people get back to work'),
      expect.objectContaining({
        actorUserId: USER_ID,
        parentToolResultId: PARENT_ID,
      }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      output: 'I help people get back to work. I fix tickets. I want the next desk.',
    });
  });

  it('returns 500 when the model returns empty output', async () => {
    h.chatCompletion.mockResolvedValue('');
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'We could not generate a response. Please try again.',
    });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });
});
