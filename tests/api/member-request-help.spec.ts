import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-188 Phase A: "Request help" moved from the legacy home to the default
 * /dashboard/help, which now names who gets the email. The route and the page
 * share lib/member/helpRequestRecipient.ts, so these cases pin what the page
 * promises: the counselor on the member's active assignment (the route's
 * pre-WAP-188 rule, now newest first so the page and the route read the same
 * row) or the team inbox, with the route reporting which one it used as
 * `sentTo` and the counselor's saved name as `sentToName`. The stricter
 * Messages rule (active, same-org, not-deleted counselor) is a routing change
 * awaiting product-owner sign-off, so it is pinned as NOT applied here.
 */

vi.mock('next/server', () => ({
  NextResponse: class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkContactRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/email', () => ({ getResend: vi.fn(() => ({ emails: { send: vi.fn() } })) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: vi.fn(async () => ({ id: 'email-1' })) }));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: vi.fn(() => '<html />') }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]);
    }),
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    counselorAssignment: { findFirst: vi.fn() },
  },
}));

import { POST } from '@/app/api/member/request-help/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

const request = () =>
  new Request('http://localhost:3000/api/member/request-help', { method: 'POST' }) as unknown as import('next/server').NextRequest;

const member = { fullName: 'Alex Rivera', email: 'alex@example.org', enrolledProgram: 'it-support' };

describe('POST /api/member/request-help', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member as never);
  });

  it('emails the assigned counselor and reports who: sentTo counselor plus the saved name', async () => {
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({
      counselor: { user: { email: 'dana@workforceap.org', fullName: 'Dana Reyes' } },
    } as never);

    const res = await POST(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sentTo: 'counselor', sentToName: 'Dana Reyes' });
    // The counselor's address stays on the server.
    expect(JSON.stringify(body)).not.toContain('@');
    expect(vi.mocked(sendBrandedEmailOrThrowOnSkip).mock.calls[0][1]).toMatchObject({ to: 'dana@workforceap.org' });
    // The pre-WAP-188 rule: any active assignment. No counselor-active / org /
    // deleted filter until the product owner signs off on that routing change.
    const query = vi.mocked(prisma.counselorAssignment.findFirst).mock.calls[0][0];
    expect(query?.where).toEqual({ memberId: 'member-1', active: true });
    expect(query?.orderBy).toEqual({ assignedAt: 'desc' });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the team inbox with no assigned counselor and says so', async () => {
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue(null as never);

    const res = await POST(request());

    expect(await res.json()).toEqual({ ok: true, sentTo: 'team', sentToName: null });
    expect(vi.mocked(sendBrandedEmailOrThrowOnSkip).mock.calls[0][1]).toMatchObject({ to: 'info@workforceap.org' });
  });

  it('a counselor row without an email address goes to the team inbox, not nowhere', async () => {
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({
      counselor: { user: { email: '  ', fullName: 'Dana Reyes' } },
    } as never);

    const res = await POST(request());

    expect(await res.json()).toEqual({ ok: true, sentTo: 'team', sentToName: null });
    expect(vi.mocked(sendBrandedEmailOrThrowOnSkip).mock.calls[0][1]).toMatchObject({ to: 'info@workforceap.org' });
  });

  it('429 from the shared contact limiter sends nothing', async () => {
    vi.mocked(checkContactRateLimit).mockResolvedValueOnce({ success: false });

    const res = await POST(request());

    expect(res.status).toBe(429);
    expect(sendBrandedEmailOrThrowOnSkip).not.toHaveBeenCalled();
  });

  it('500 when email is not configured, so the page can offer Messages instead', async () => {
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue(null as never);
    vi.mocked(getResend).mockReturnValueOnce(null);

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(sendBrandedEmailOrThrowOnSkip).not.toHaveBeenCalled();
  });

  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(401);
  });
});
