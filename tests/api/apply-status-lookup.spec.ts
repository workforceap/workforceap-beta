import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      findUnique: vi.fn(),
    },
    application: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: vi.fn(),
}));

vi.mock('@/lib/member/memberApplicationStatus', () => ({
  applicationStatusForPublicLookup: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

// ─── Imports after mocks ───
import { POST as statusLookup } from '@/app/api/apply/status-lookup/route';
import { prisma } from '@/lib/db/prisma';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { applicationStatusForPublicLookup } from '@/lib/member/memberApplicationStatus';
import { captureApiError } from '@/lib/observability/captureApiError';

const makeRequest = (body: Record<string, unknown>): any =>
  new Request('http://localhost:3000/api/apply/status-lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const genericBody = {
  found: false,
  message:
    'If we have an application on file for that email, you will receive status updates by email and SMS. Otherwise, you can submit a new application at workforceap.org/apply.',
};

describe('POST /api/apply/status-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: true });
  });

  it('returns identical public response for every valid email lookup case', async () => {
    const lookups = [
      {
        email: 'applied@example.com',
        user: { id: 'user-applied' },
        application: { status: 'UNDER_REVIEW' },
        publicStatus: 'under_review',
      },
      {
        email: 'accepted@example.com',
        user: { id: 'user-accepted' },
        application: { status: 'ACCEPTED' },
        publicStatus: 'accepted',
      },
      {
        email: 'no-application@example.com',
        user: { id: 'user-without-application' },
        application: null,
        publicStatus: 'applied',
      },
      {
        email: 'unknown@example.com',
        user: null,
        application: null,
        publicStatus: 'applied',
      },
    ] as const;

    const bodies = [];

    for (const lookup of lookups) {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(lookup.user as any);
      vi.mocked(prisma.application.findFirst).mockResolvedValueOnce(lookup.application as any);
      vi.mocked(applicationStatusForPublicLookup).mockReturnValueOnce(lookup.publicStatus as any);

      const res = await statusLookup(makeRequest({ email: lookup.email }));

      expect(res.status).toBe(200);
      bodies.push(await res.json());
    }

    expect(bodies).toEqual(lookups.map(() => genericBody));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.application.findFirst).not.toHaveBeenCalled();
    expect(applicationStatusForPublicLookup).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkAuthRateLimit).mockResolvedValue({ success: false });

    const res = await statusLookup(makeRequest({ email: 'test@example.com' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many requests');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost:3000/api/apply/status-lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });

    const res = await statusLookup(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 for invalid email', async () => {
    const res = await statusLookup(makeRequest({ email: 'not-an-email' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('valid email');
  });

  it('returns 400 for missing email', async () => {
    const res = await statusLookup(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('valid email');
  });

  it('returns 500 on unexpected rate-limit error', async () => {
    const error = new Error('Redis down');
    vi.mocked(checkAuthRateLimit).mockRejectedValue(error);

    const res = await statusLookup(makeRequest({ email: 'test@example.com' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(captureApiError).toHaveBeenCalledWith(error, { route: 'apply/status-lookup' });
  });
});
