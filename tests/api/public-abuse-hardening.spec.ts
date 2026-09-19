/**
 * Public/non-admin abuse hardening:
 *  - /api/unsubscribe (GET + POST) is rate limited per IP before the token is parsed
 *  - /api/member/saved-jobs, /api/leader/chapters and /api/counselor/counselors
 *    bound their list queries with `take` (they were unbounded findMany calls
 *    reachable by member / leader / counselor roles)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  unsubscribeRateLimit: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  savedJobFindMany: vi.fn(),
  chapterFindMany: vi.fn(),
  counselorFindMany: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  getActorOrganizationId: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: class extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body ?? null, init);
    }
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '203.0.113.7' }));
vi.mock('@/lib/rate-limit', () => ({
  checkPublicUnsubscribeRateLimit: mocks.unsubscribeRateLimit,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: never[]) => Promise<Response>) => handler,
  withSystemGuc: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as never),
    ),
    user: { findMany: mocks.userFindMany, update: mocks.userUpdate },
    savedJob: { findMany: mocks.savedJobFindMany },
    chapter: { findMany: mocks.chapterFindMany },
    counselor: { findMany: mocks.counselorFindMany },
  };
  return { prisma };
});
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isCounselor: mocks.isCounselor }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/tenant/withTenantScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return {
    withTenantScope: (_orgId: string | null, fn: (db: unknown) => Promise<unknown>) => fn(prisma),
  };
});
vi.mock('@/lib/observability/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));

import { GET as unsubscribeGet, POST as unsubscribePost } from '@/app/api/unsubscribe/route';
import { GET as savedJobsGet } from '@/app/api/member/saved-jobs/route';
import { GET as leaderChaptersGet } from '@/app/api/leader/chapters/route';
import { GET as counselorsGet } from '@/app/api/counselor/counselors/route';
import { buildUnsubscribeToken } from '@/lib/email/unsubscribeToken';

type NextRequestLike = import('next/server').NextRequest;
function asNextRequest(request: Request) {
  // The handlers use `.url`, `.headers` and `.nextUrl.searchParams`; give the WHATWG Request the latter.
  const withNextUrl = request as Request & { nextUrl: URL };
  withNextUrl.nextUrl = new URL(request.url);
  return withNextUrl as unknown as NextRequestLike;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('GET/POST /api/unsubscribe rate limiting', () => {
  const EMAIL = 'member@example.com';

  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', 'unsubscribe-test-secret');
    mocks.userFindMany.mockResolvedValue([{ id: 'user-1', email: EMAIL }]);
    mocks.userUpdate.mockResolvedValue({ id: 'user-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function request(method: 'GET' | 'POST', token = buildUnsubscribeToken(EMAIL)) {
    return asNextRequest(
      new Request(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, { method }),
    );
  }

  it('POST returns 429 before touching the database when the per-IP cap is hit', async () => {
    mocks.unsubscribeRateLimit.mockResolvedValue({ success: false });

    const res = await unsubscribePost(request('POST'));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(mocks.unsubscribeRateLimit).toHaveBeenCalledWith('203.0.113.7');
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('GET returns 429 before touching the database when the per-IP cap is hit', async () => {
    mocks.unsubscribeRateLimit.mockResolvedValue({ success: false });

    const res = await unsubscribeGet(request('GET'));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('charges the limiter even for a forged token', async () => {
    mocks.unsubscribeRateLimit.mockResolvedValue({ success: false });

    const res = await unsubscribePost(request('POST', 'not-a-real-token'));

    expect(res.status).toBe(429);
    expect(mocks.unsubscribeRateLimit).toHaveBeenCalledTimes(1);
  });

  it('still unsubscribes a valid token when within the limit (RFC 8058 POST shape unchanged)', async () => {
    mocks.unsubscribeRateLimit.mockResolvedValue({ success: true });

    const res = await unsubscribePost(request('POST'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { notificationsUpdates: false, notificationsReminders: false },
    });
  });

  it('still renders the HTML confirmation on GET when within the limit', async () => {
    mocks.unsubscribeRateLimit.mockResolvedValue({ success: true });

    const res = await unsubscribeGet(request('GET'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain("You're unsubscribed");
  });
});

describe('GET /api/member/saved-jobs bounds the saved-job list', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ id: 'member-1', email: 'member@example.com' });
    mocks.savedJobFindMany.mockResolvedValue([{ jobId: 'job-a' }, { jobId: 'job-b' }]);
  });

  it('passes a take cap and keeps the { jobIds } shape', async () => {
    const res = await savedJobsGet(asNextRequest(new Request('http://localhost/api/member/saved-jobs')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobIds: ['job-a', 'job-b'] });
    expect(mocks.savedJobFindMany).toHaveBeenCalledTimes(1);
    const args = mocks.savedJobFindMany.mock.calls[0][0] as { where: unknown; take?: number };
    expect(args.where).toEqual({ userId: 'member-1' });
    expect(typeof args.take).toBe('number');
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(500);
  });

  it('still rejects anonymous callers before querying', async () => {
    mocks.getUser.mockResolvedValue(null);

    const res = await savedJobsGet(asNextRequest(new Request('http://localhost/api/member/saved-jobs')));

    expect(res.status).toBe(401);
    expect(mocks.savedJobFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/leader/chapters bounds the chapter list', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ id: 'leader-1', email: 'leader@example.com' });
    mocks.getActorOrganizationId.mockResolvedValue('org-1');
    mocks.chapterFindMany.mockResolvedValue([{ id: 'chapter-1', members: [], meetings: [], curriculumItems: [] }]);
  });

  it('passes a take cap scoped to the leader and org, and returns the array unchanged', async () => {
    const res = await leaderChaptersGet(asNextRequest(new Request('http://localhost/api/leader/chapters')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'chapter-1', members: [], meetings: [], curriculumItems: [] }]);
    const args = mocks.chapterFindMany.mock.calls[0][0] as { where: unknown; take?: number };
    expect(args.where).toEqual({ organizationId: 'org-1', leaderId: 'leader-1' });
    expect(typeof args.take).toBe('number');
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(100);
  });
});

describe('GET /api/counselor/counselors bounds the reassignment picker', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ id: 'counselor-1', email: 'counselor@example.com' });
    mocks.isCounselor.mockResolvedValue(true);
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getActorOrganizationId.mockResolvedValue('org-1');
    mocks.counselorFindMany.mockResolvedValue([
      { id: 'c-1', user: { id: 'u-1', fullName: 'Counselor One', email: 'one@example.com' } },
    ]);
  });

  it('passes a take cap and keeps the { counselors } shape', async () => {
    const res = await counselorsGet(asNextRequest(new Request('http://localhost/api/counselor/counselors')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counselors: [{ counselorId: 'c-1', userId: 'u-1', fullName: 'Counselor One', email: 'one@example.com' }],
    });
    const args = mocks.counselorFindMany.mock.calls[0][0] as { where: { active: boolean }; take?: number };
    expect(args.where.active).toBe(true);
    expect(typeof args.take).toBe('number');
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(500);
  });

  it('still forbids members before querying', async () => {
    mocks.isCounselor.mockResolvedValue(false);

    const res = await counselorsGet(asNextRequest(new Request('http://localhost/api/counselor/counselors')));

    expect(res.status).toBe(403);
    expect(mocks.counselorFindMany).not.toHaveBeenCalled();
  });
});
