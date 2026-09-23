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
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/ai/groq', () => ({
  chatCompletion: vi.fn(),
  isAIConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/readiness/score', () => ({
  getScoreBreakdownSafeResult: vi.fn(),
}));

import { POST } from '@/app/api/member/readiness/summary/route';
import { getUser } from '@/lib/auth/server';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';
import { getScoreBreakdownSafeResult } from '@/lib/readiness/score';
import { SCREENSHOT_MEMBER_BREAKDOWN } from '@/lib/readiness/progressView.fixtures';
import { READINESS_SCORE_LOAD_ERROR } from '@/lib/readiness/progressSummary';

describe('POST /api/member/readiness/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: true });
    vi.mocked(isAIConfigured).mockReturnValue(true);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns an honest error recap when score load fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: true,
    });

    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ source: 'error', summary: READINESS_SCORE_LOAD_ERROR });
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('degrades to the factual recap when AI is unconfigured', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(isAIConfigured).mockReturnValue(false);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: false,
    });

    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe('factual');
    expect(body.summary).toContain('Training & Certs is your lowest area');
    expect(body.summary).toContain('Next: Complete more pathway steps');
    expect(body.summary).not.toContain('82');
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('returns grounded AI text when generation succeeds', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: false,
    });
    vi.mocked(chatCompletion).mockResolvedValue(
      '**Training & Certs is your lowest area** because no certificate is tracked yet and only two pathway steps are logged.\n\nNext, complete more pathway steps in your training program.',
    );

    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe('ai');
    // markdown stripped, blank line collapsed to a single paragraph break
    expect(body.summary).toBe(
      'Training & Certs is your lowest area because no certificate is tracked yet and only two pathway steps are logged.\nNext, complete more pathway steps in your training program.',
    );
  });

  it('falls back to factual recap when the model restates the numbers (the production garble)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: false,
    });
    vi.mocked(chatCompletion).mockResolvedValue(
      'Your overall score is 86 out of 105, which is a great achievement! 1. Resume & Profile: 100% (100% completed) 2. Training & Certs: 60% (15 out of 35 earned) 3. Interview & Jobs: 83% (25 out of 30 earned) 4. Engagement: 100% (15 out of 15 earned) To improve, focus on the Training & Certs category by starting the pathway and earning the remaining points (15 out of 35).',
    );

    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe('factual');
    expect(body.summary).not.toContain('15 out of 35');
    expect(body.summary).not.toContain('great achievement');
    expect(body.summary).toContain('Next: Complete more pathway steps');
  });

  it('falls back to factual recap when the model invents a score', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: false,
    });
    vi.mocked(chatCompletion).mockResolvedValue('You are 99% ready and already placed at Acme.');

    const res = await POST(new Request('http://localhost/api/member/readiness/summary', { method: 'POST' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe('factual');
    expect(body.summary).toContain('Training & Certs is your lowest area');
    expect(body.summary).not.toContain('Acme');
    expect(body.summary).not.toContain('99');
  });
});
