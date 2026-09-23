/**
 * S04 part 2: the member LLM paths that had no limiter are metered.
 *
 * - POST /api/member/goals/[id]/steps spends a chatCompletion call per request.
 *   Over the member's AI tool quota it must return the deterministic fallback
 *   steps without calling the model.
 * - The three voice-coach completion routes each fire updateCoachMemory (a
 *   claudeChat call) on every POST. They meter it in a separate
 *   `coach-memory:<userId>` bucket, and over that bucket they skip the memory
 *   update while keeping their normal 2xx response.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => undefined) }));
vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => undefined),
  persistEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: vi.fn(),
  captureApiResponseError: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/ai/groq', () => ({
  chatCompletion: vi.fn(),
  isAIConfigured: () => true,
}));
vi.mock('@/lib/ai/anthropicChat', () => ({
  claudeChat: vi.fn(async () => ''),
  isAnthropicConfigured: () => true,
}));
vi.mock('@/lib/coach/memory', () => ({ updateCoachMemory: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: vi.fn(async () => ({ id: 'r-1' })) }));
vi.mock('@/lib/ai/parseResumeCoachSuggestions', () => ({
  normalizeResumeCoachTranscript: (input: Array<{ speaker?: string; text?: string }>) =>
    input.map((t) => ({ speaker: t.speaker === 'agent' ? 'agent' : 'user', text: String(t.text ?? '') })),
  parseResumeCoachSuggestionsFromTranscript: vi.fn(async () => [
    { suggested: 'Led a team of 4', context: 'Shows leadership' },
  ]),
}));
vi.mock('@/lib/email', () => ({
  getVoiceCoachTranscriptRecipients: vi.fn(() => []),
  sendVoiceCoachTranscriptEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/workflows/completeCareerOsActions', () => ({
  completeCareerOsInterviewActions: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]);
    }),
    user: { findUnique: vi.fn(async () => ({ fullName: 'Jane Member', email: 'jane@example.com', careerRecommendationJson: null })) },
    goal: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }: { data: { description: string } }) => ({ id: 'goal-1', description: data.description })),
    },
    memberEvent: { findFirst: vi.fn(async () => null) },
  },
}));

import { POST as goalStepsPOST } from '@/app/api/member/goals/[id]/steps/route';
import { POST as coachCompletionPOST } from '@/app/api/member/career-business-coach/completion/route';
import { POST as parseSuggestionsPOST } from '@/app/api/member/resume-coach/parse-suggestions/route';
import { POST as voiceTranscriptPOST } from '@/app/api/member/voice-interview/transcript/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { chatCompletion } from '@/lib/ai/groq';
import { claudeChat } from '@/lib/ai/anthropicChat';
import { updateCoachMemory } from '@/lib/coach/memory';

const MEMBER = { id: 'member-1', email: 'jane@example.com' };

const RESUME_FALLBACK = [
  'Gather your work history, skills, and any certificates in one place',
  'Use the AI Resume Rewriter to draft a strong first version',
  'Add measurable results to your top two roles',
  'Ask a counselor or peer to review it for clarity',
];

const AI_STEPS = ['Draft a new summary', 'Quantify two achievements', 'Send it to a counselor'];

function jsonRequest(url: string, body: unknown) {
  return new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const transcript = [
  { speaker: 'agent', text: 'Tell me about a time you led a project at work.' },
  { speaker: 'user', text: 'I led a warehouse inventory project that cut errors by a third last spring.' },
];

const coachRoutes = [
  {
    name: 'career-business-coach/completion',
    call: () => coachCompletionPOST(jsonRequest('/api/member/career-business-coach/completion', { transcript })),
    expectedBody: { ok: true },
  },
  {
    name: 'resume-coach/parse-suggestions',
    call: () => parseSuggestionsPOST(jsonRequest('/api/member/resume-coach/parse-suggestions', { transcript })),
    expectedBody: { suggestions: [{ suggested: 'Led a team of 4', context: 'Shows leadership' }] },
  },
  {
    name: 'voice-interview/transcript',
    call: () => voiceTranscriptPOST(jsonRequest('/api/member/voice-interview/transcript', { transcript, sessionId: 's-1' })),
    expectedBody: { ok: true },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue(MEMBER as never);
  vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: true });
  vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify(AI_STEPS));
  vi.mocked(prisma.goal.findFirst).mockResolvedValue({
    id: 'goal-1',
    userId: MEMBER.id,
    goalType: 'build_resume',
    title: 'Finish my resume',
    description: null,
  } as never);
});

describe('POST /api/member/goals/[id]/steps is metered', () => {
  const call = () =>
    goalStepsPOST(new Request('http://localhost:3000/api/member/goals/goal-1/steps', { method: 'POST' }), {
      params: Promise.resolve({ id: 'goal-1' }),
    });

  it('over the AI tool quota: returns the fallback steps and never calls the model', async () => {
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: false, remaining: 0 });

    const res = await call();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps.map((s: { text: string }) => s.text)).toEqual(RESUME_FALLBACK);
    expect(checkAIToolRateLimit).toHaveBeenCalledWith(MEMBER.id);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('limiter error fails closed to the fallback steps', async () => {
    vi.mocked(checkAIToolRateLimit).mockRejectedValue(new Error('redis down'));

    const res = await call();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps.map((s: { text: string }) => s.text)).toEqual(RESUME_FALLBACK);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('within quota: calls the model and returns its steps', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps.map((s: { text: string }) => s.text)).toEqual(AI_STEPS);
    expect(checkAIToolRateLimit).toHaveBeenCalledWith(MEMBER.id);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('an unauthenticated request never reaches the limiter or the model', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});

describe.each(coachRoutes)('POST /api/member/$name meters the coach memory update', ({ call, expectedBody }) => {
  it('over the coach-memory bucket: normal 2xx, no memory update, no claudeChat', async () => {
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: false, remaining: 0 });

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody);
    expect(checkAIToolRateLimit).toHaveBeenCalledWith(`coach-memory:${MEMBER.id}`);
    expect(checkAIToolRateLimit).not.toHaveBeenCalledWith(MEMBER.id);
    expect(updateCoachMemory).not.toHaveBeenCalled();
    expect(claudeChat).not.toHaveBeenCalled();
  });

  it('limiter error: normal 2xx and the memory update is skipped', async () => {
    vi.mocked(checkAIToolRateLimit).mockRejectedValue(new Error('redis down'));

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody);
    expect(updateCoachMemory).not.toHaveBeenCalled();
  });

  it('within the bucket: the memory update runs for this member', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody);
    expect(checkAIToolRateLimit).toHaveBeenCalledWith(`coach-memory:${MEMBER.id}`);
    expect(updateCoachMemory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateCoachMemory).mock.calls[0][0]).toMatchObject({ userId: MEMBER.id });
  });
});
