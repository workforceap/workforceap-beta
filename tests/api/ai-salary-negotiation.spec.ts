// @vitest-environment node
/**
 * POST /api/ai/salary-negotiation spends an LLM call and interpolates
 * offer, target, title, and company into the prompt. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Save failures still 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  prefillSalaryNegotiation: vi.fn(),
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
  prefillSalaryNegotiation: h.prefillSalaryNegotiation,
}));

vi.mock('@/lib/ai/coachContextBlock', () => ({
  loadCoachContextBlock: h.loadCoachContextBlock,
}));

const { POST } = await import('@/app/api/ai/salary-negotiation/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/salary-negotiation', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const validBody = {
  currentOffer: 55000,
  targetSalary: 72000,
  jobTitle: 'Help Desk Analyst',
  companyName: 'Acme Corp',
  deliveryMethod: 'email' as const,
};

describe('POST /api/ai/salary-negotiation', () => {
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
    h.loadCoachContextBlock.mockResolvedValue('');
    h.prefillSalaryNegotiation.mockResolvedValue({ targetRole: null, targetSalary: null });
    h.chatCompletion.mockResolvedValue('Here is your script.');
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
  });

  it('returns 401 before AI-config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(validBody) as never);
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
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before parse when over quota', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(429);
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without calling the model', async () => {
    const res = await POST(
      new Request('http://localhost/api/ai/salary-negotiation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when currentOffer is missing', async () => {
    const { currentOffer: _omit, ...rest } = validBody;
    const res = await POST(postRequest(rest) as never);
    expect(res.status).toBe(400);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns act-on-behalf status before the model', async () => {
    h.resolveActOnBehalf.mockResolvedValue({ ok: false, status: 404, error: 'Member not found' });
    const res = await POST(postRequest({ ...validBody, subjectMemberId: SUBJECT_ID }) as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates offer, target, title, and company into the user prompt', async () => {
    const res = await POST(
      postRequest({
        ...validBody,
        companyName: 'Acme<script>',
        jobTitle: 'javascript:alert(1)',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ output: 'Here is your script.' });
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain(`$${validBody.currentOffer.toLocaleString()}`);
    expect(userMessage.content).toContain(`$${validBody.targetSalary.toLocaleString()}`);
    expect(userMessage.content).toContain('javascript:alert(1)');
    expect(userMessage.content).toContain('Acme<script>');
    expect(userMessage.content).toContain('Email');
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'salary_negotiation',
      expect.stringContaining('Acme<script>'),
      'Here is your script.',
      expect.objectContaining({ actorUserId: USER_ID }),
    );
  });

  it('still 200s when save throws', async () => {
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ output: 'Here is your script.' });
  });

  it('returns 500 when the model returns empty output', async () => {
    h.chatCompletion.mockResolvedValue('');
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'We could not generate a response. Please try again.' });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });
});
