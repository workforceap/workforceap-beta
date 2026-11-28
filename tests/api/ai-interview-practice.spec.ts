// @vitest-environment node
/**
 * POST /api/ai/interview-practice spends an LLM call. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Act-on-behalf refusal is before the model. Save failures still 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  prefillInterviewPractice: vi.fn(),
  getAICoachContext: vi.fn(),
  renderCoachContextForPrompt: vi.fn(),
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
  prefillInterviewPractice: h.prefillInterviewPractice,
}));

vi.mock('@/lib/ai/aiCoachContext', () => ({
  getAICoachContext: h.getAICoachContext,
  renderCoachContextForPrompt: h.renderCoachContextForPrompt,
}));

const { POST } = await import('@/app/api/ai/interview-practice/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARENT_ID = '550e8400-e29b-41d4-a716-446655440003';

const QUESTIONS = [
  {
    question: 'Tell me about a hard ticket.',
    type: 'behavioral',
    tip: 'Use STAR.',
    starHint: 'Name the queue.',
    exampleAnswer: 'I took the oldest ticket and closed it.',
  },
];

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/interview-practice', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/interview-practice', () => {
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
    h.getAICoachContext.mockResolvedValue({});
    h.renderCoachContextForPrompt.mockReturnValue('');
    h.prefillInterviewPractice.mockResolvedValue({
      role: '',
      experienceLevel: 'mid',
      resumeContext: '',
    });
    h.chatCompletion.mockResolvedValue(JSON.stringify(QUESTIONS));
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
  });

  it('returns 401 before AI-config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
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
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before parse when over quota', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Rate limit exceeded. Please try again in a few minutes.',
    });
    expect(h.checkAIToolRateLimit).toHaveBeenCalledWith(USER_ID);
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without calling the model', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/interview-practice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 from the schema when role is shorter than 3 characters', async () => {
    const res = await POST(postRequest({ role: 'IT' }) as never);
    expect(res.status).toBe(400);
    expect(h.prefillInterviewPractice).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 after prefill when a whitespace role still has no target', async () => {
    const res = await POST(postRequest({ role: '   ' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        'Role is required. Try uploading a resume or completing the career quiz so we can suggest a role for you.',
    });
    expect(h.prefillInterviewPractice).toHaveBeenCalledWith(USER_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns act-on-behalf status before the model when the actor cannot run for that member', async () => {
    h.resolveActOnBehalf.mockResolvedValue({ ok: false, status: 404, error: 'Not found' });
    const res = await POST(
      postRequest({ role: 'Help desk specialist', subjectMemberId: SUBJECT_ID }) as never,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(h.resolveActOnBehalf).toHaveBeenCalledWith(USER_ID, SUBJECT_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('interpolates role, level, count and resume, and stamps parentToolResultId on save', async () => {
    const res = await POST(
      postRequest({
        role: 'Help desk <script>',
        experienceLevel: 'senior',
        count: 3,
        resumeContext: 'javascript:alert(1)\nWindows tickets',
        parentToolResultId: PARENT_ID,
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].question).toContain('hard ticket');
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain('Generate 3 interview questions');
    expect(userMessage.content).toContain('Help desk <script>');
    expect(userMessage.content).toContain('senior / lead (8+ years experience)');
    expect(userMessage.content).toContain('javascript:alert(1)');
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'interview_practice',
      'Help desk <script> (senior)',
      JSON.stringify(QUESTIONS),
      expect.objectContaining({
        actorUserId: USER_ID,
        parentToolResultId: PARENT_ID,
      }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).questions).toHaveLength(1);
  });

  it('returns 500 when the model returns empty output', async () => {
    h.chatCompletion.mockResolvedValue('');
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'We could not generate a response. Please try again.',
    });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('returns 500 when the model returns a non-array payload', async () => {
    h.chatCompletion.mockResolvedValue('{"question":"not an array"}');
    const res = await POST(postRequest({ role: 'Help desk specialist' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Invalid response format' });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });
});
