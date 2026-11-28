// @vitest-environment node
/**
 * POST /api/ai/elevator-pitch spends an LLM call. Unsigned is 401.
 * Unconfigured AI is 503 before rate-limit. Over-quota is 429 before
 * parse. Bodies over 32 KB are 413. Act-on-behalf refusal is before the
 * model. Save and member-email failures still 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ifAiUnconfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  saveAIToolResult: vi.fn(),
  resolveActOnBehalf: vi.fn(),
  prefillElevatorPitch: vi.fn(),
  loadCoachContextBlock: vi.fn(),
  ensureUserInDb: vi.fn(),
  userFindUnique: vi.fn(),
  getVoiceCoachTranscriptRecipients: vi.fn(),
  sendElevatorSpeechEmail: vi.fn(),
  sendVoiceCoachArtifactEmail: vi.fn(),
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
  prefillElevatorPitch: h.prefillElevatorPitch,
}));

vi.mock('@/lib/ai/coachContextBlock', () => ({
  loadCoachContextBlock: h.loadCoachContextBlock,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { user: { findUnique: typeof h.userFindUnique } }) => unknown) =>
      fn({ user: { findUnique: h.userFindUnique } }),
    ),
  },
}));

vi.mock('@/lib/email', () => ({
  getVoiceCoachTranscriptRecipients: h.getVoiceCoachTranscriptRecipients,
  sendElevatorSpeechEmail: h.sendElevatorSpeechEmail,
  sendVoiceCoachArtifactEmail: h.sendVoiceCoachArtifactEmail,
}));

const { POST } = await import('@/app/api/ai/elevator-pitch/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440002';

const LONG_PITCH =
  'I am Pat Rivera, a help-desk specialist who turns messy ticket queues into calm, documented fixes. I excel at Windows recovery, teaching teammates the shortest path to yes, and keeping customers in the loop. I would love to bring this to healthcare IT support.';

const validBody = {
  name: 'Pat Rivera',
  targetRole: 'Help desk specialist',
  strengths: 'Windows and calm tickets',
  certifications: 'CompTIA A+',
  industry: 'Healthcare IT',
};

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/elevator-pitch', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/ai/elevator-pitch', () => {
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
    h.prefillElevatorPitch.mockResolvedValue({
      name: null,
      targetRole: null,
      strengths: null,
      certifications: null,
      industry: null,
    });
    h.chatCompletion.mockResolvedValue(LONG_PITCH);
    h.saveAIToolResult.mockResolvedValue({ id: 'r-1' });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.userFindUnique.mockResolvedValue({ fullName: 'Pat Rivera', email: 'pat@example.test' });
    h.getVoiceCoachTranscriptRecipients.mockReturnValue([]);
    h.sendElevatorSpeechEmail.mockResolvedValue({ ok: true });
    h.sendVoiceCoachArtifactEmail.mockResolvedValue({ ok: true });
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
      new Request('http://localhost/api/ai/elevator-pitch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 413 when the serialized body is over 32 KB', async () => {
    const res = await POST(postRequest({ ...validBody, strengths: 'x'.repeat(40_000) }) as never);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Input too large' });
    expect(h.resolveActOnBehalf).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when name and target role are missing after prefill', async () => {
    const res = await POST(postRequest({ strengths: 'Windows' }) as never);
    expect(res.status).toBe(400);
    expect(h.prefillElevatorPitch).toHaveBeenCalledWith(USER_ID);
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

  it('interpolates name, role, strengths, certifications and industry into the user prompt', async () => {
    const res = await POST(
      postRequest({
        name: 'Pat<script>',
        targetRole: 'Help desk',
        strengths: 'javascript:alert(1)',
        certifications: 'A+',
        industry: 'Healthcare & <IT>',
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pitch).toContain('help-desk specialist');
    const [, userMessage] = h.chatCompletion.mock.calls[0][0];
    expect(userMessage.content).toContain('Pat<script>');
    expect(userMessage.content).toContain('Help desk');
    expect(userMessage.content).toContain('javascript:alert(1)');
    expect(userMessage.content).toContain('A+');
    expect(userMessage.content).toContain('Healthcare & <IT>');
    expect(h.saveAIToolResult).toHaveBeenCalledWith(
      USER_ID,
      'career_counselor',
      'AI elevator speech for Help desk',
      expect.stringContaining('help-desk specialist'),
      expect.objectContaining({ actorUserId: USER_ID }),
    );
  });

  it('retries a short first pitch and still 200s when save throws', async () => {
    h.chatCompletion
      .mockResolvedValueOnce('My name is Pat.')
      .mockResolvedValueOnce(LONG_PITCH);
    h.saveAIToolResult.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect(h.chatCompletion).toHaveBeenCalledTimes(2);
    expect((await res.json()).pitch).toContain('help-desk specialist');
  });

  it('returns 500 when the model returns empty output', async () => {
    h.chatCompletion.mockResolvedValue('');
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not generate pitch. Try again.' });
    expect(h.saveAIToolResult).not.toHaveBeenCalled();
  });

  it('still 200s when the member email send throws', async () => {
    h.sendElevatorSpeechEmail.mockRejectedValue(new Error('resend down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pitch).toContain('help-desk specialist');
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe('resend down');
  });
});
