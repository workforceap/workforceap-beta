// @vitest-environment node
/**
 * POST /api/ai/resume-rewriter spends an LLM call. Unsigned is 401.
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
  prefillResumeRewriter: vi.fn(),
  loadCoachContextBlock: vi.fn(),
  ensureUserInDb: vi.fn(),
  analyzeResume: vi.fn(),
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
  prefillResumeRewriter: h.prefillResumeRewriter,
}));

vi.mock('@/lib/ai/coachContextBlock', () => ({
  loadCoachContextBlock: h.loadCoachContextBlock,
}));

vi.mock('@/lib/ai/resumeScore', () => ({
  analyzeResume: h.analyzeResume,
}));

const { POST } = await import('@/app/api/ai/resume-rewriter/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

const RESUME =
  'Pat Rivera\nHelp desk specialist with five years supporting Windows, Active Directory, and ticket queues in healthcare IT. Trained three new hires.';

const validBody = {
  resume: RESUME,
  jobTarget: 'Help desk specialist',
  targetSalary: '$55k-$70k',
  targetLocation: 'Austin, TX',
  resumeFramework: 'experienced' as const,
};

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/resume-rewriter', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/resume-rewriter', () => {
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
    h.analyzeResume.mockRejectedValue(new Error('skip evidence'));
    h.chatCompletion.mockResolvedValue('REPOSITIONED RESUME\nPat Rivera, Help desk specialist.');
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.prefillResumeRewriter.mockResolvedValue({
      ok: false,
      error: 'We could not read an original resume. Paste it into the Resume Rewriter text box or upload a readable file.',
    });
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
    expect(h.checkAIToolRateLimit).toHaveBeenCalledWith(USER_ID);
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without calling the model', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/resume-rewriter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when resume is shorter than 50 characters', async () => {
    const res = await POST(postRequest({ ...validBody, resume: 'too short' }) as never);
    expect(res.status).toBe(400);
    expect(h.prefillResumeRewriter).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when job target is missing', async () => {
    const res = await POST(postRequest({ resume: RESUME }) as never);
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

  it('interpolates role, salary, location and resume into the user prompt', async () => {
    const res = await POST(
      postRequest({
        ...validBody,
        jobTarget: 'Help desk <script>',
        targetSalary: 'javascript:alert(1)',
        targetLocation: 'Austin & <TX>',
        resume: `${RESUME}\n<script>steal()</script>`,
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output).toContain('Help desk specialist');
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain('Help desk <script>');
    expect(userMessage.content).toContain('javascript:alert(1)');
    expect(userMessage.content).toContain('Austin & <TX>');
    expect(userMessage.content).toContain('<script>steal()</script>');
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'resume_rewriter',
      'Help desk <script> | Austin & <TX> | javascript:alert(1)',
      expect.stringContaining('Help desk specialist'),
      expect.objectContaining({ actorUserId: USER_ID }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).output).toContain('Help desk specialist');
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
