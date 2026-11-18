// @vitest-environment node
/**
 * GET /api/admin/messages/stats and GET /api/admin/messages/threads are
 * super-admin inboxes over member/employer/partner PII. Unsigned callers
 * 401 and non-super-admins 403 before any count or list. The member inbox
 * filters deletedAt only — it does not apply MEMBER_ONLY_ROLE_NOT (that
 * fence is on POST open, already pinned). Pin the current GET where-clause.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  countMessageThreadsWithActivity: vi.fn(),
  countUnansweredMemberThreads: vi.fn(),
  countThreadsWithSlaBreach: vi.fn(),
  getSlaStatusForThreads: vi.fn(),
  getThreadIdsBreachingSla: vi.fn(),
  findMany: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  countMessageThreadsWithActivity: h.countMessageThreadsWithActivity,
  countUnansweredMemberThreads: h.countUnansweredMemberThreads,
  countThreadsWithSlaBreach: h.countThreadsWithSlaBreach,
  getSlaStatusForThreads: h.getSlaStatusForThreads,
  getThreadIdsBreachingSla: h.getThreadIdsBreachingSla,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    messageThread: { findMany: h.findMany },
    $transaction: vi.fn(async (fn: (tx: { messageThread: { findMany: typeof h.findMany } }) => unknown) =>
      fn({ messageThread: { findMany: h.findMany } })),
  };
  return { prisma };
});

const { GET: getStats } = await import('@/app/api/admin/messages/stats/route');
const { GET: getThreads } = await import('@/app/api/admin/messages/threads/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const THREAD_ID = '550e8400-e29b-41d4-a716-446655440020';

function statsRequest() {
  return new Request('http://localhost/api/admin/messages/stats');
}

function threadsRequest(query = '') {
  const url = `http://localhost/api/admin/messages/threads${query}`;
  const req = new Request(url);
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

const memberThread = {
  id: THREAD_ID,
  kind: 'member' as const,
  memberId: 'm-1',
  employerId: null,
  partnerId: null,
  counselorUserId: 'c-1',
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  member: { id: 'm-1', fullName: 'Pat Lee', email: 'pat@example.test' },
  employer: null,
  partner: null,
  counselor: { id: 'c-1', fullName: 'Jordan Counselor' },
  messages: [
    {
      id: 'msg-1',
      body: 'hello from the member',
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      authorId: 'm-1',
    },
  ],
};

describe('GET /api/admin/messages/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.countMessageThreadsWithActivity.mockResolvedValue(4);
    h.countUnansweredMemberThreads.mockResolvedValue(2);
    h.countThreadsWithSlaBreach.mockImplementation(async (hours: number) => (hours === 48 ? 1 : 0));
  });

  it('returns 401 before counts when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getStats(statsRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.countMessageThreadsWithActivity).not.toHaveBeenCalled();
  });

  it('returns 403 before counts when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await getStats(statsRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.countUnansweredMemberThreads).not.toHaveBeenCalled();
    expect(h.countThreadsWithSlaBreach).not.toHaveBeenCalled();
  });

  it('returns the four inbox counts', async () => {
    const res = await getStats(statsRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      threadsWithMessages: 4,
      unansweredMemberThreads: 2,
      slaBreaches48h: 1,
      slaBreaches72h: 0,
    });
    expect(h.countThreadsWithSlaBreach).toHaveBeenCalledWith(48);
    expect(h.countThreadsWithSlaBreach).toHaveBeenCalledWith(72);
  });

  it('returns 500 when a count throws', async () => {
    h.countMessageThreadsWithActivity.mockRejectedValue(new Error('db down'));
    const res = await getStats(statsRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/admin/messages/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.findMany.mockResolvedValue([memberThread]);
    h.getSlaStatusForThreads.mockResolvedValue(new Map());
    h.getThreadIdsBreachingSla.mockResolvedValue([]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getThreads(threadsRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await getThreads(threadsRequest() as never);
    expect(res.status).toBe(403);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('defaults to the member inbox without MEMBER_ONLY_ROLE_NOT and takes limit+1', async () => {
    const res = await getThreads(threadsRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inbox).toBe('member');
    expect(body.alertsOnly).toBe(false);
    expect(body.threads[0].memberEmail).toBe('pat@example.test');
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: 'member',
          member: { deletedAt: null },
          messages: { some: {} },
        },
        take: 31,
      }),
    );
    const where = h.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).not.toHaveProperty('NOT');
  });

  it('clamps limit to 50 and maps inbox=employer without a deletedAt member filter', async () => {
    await getThreads(threadsRequest('?inbox=employer&limit=999') as never);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: 'employer',
          messages: { some: {} },
        },
        take: 51,
      }),
    );
  });

  it('alertsOnly forces the member inbox and skips the default list', async () => {
    h.getThreadIdsBreachingSla.mockResolvedValue([]);
    const res = await getThreads(threadsRequest('?alertsOnly=1&inbox=employer') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      threads: [],
      nextCursor: null,
      alertsOnly: true,
      inbox: 'member',
    });
    expect(h.getThreadIdsBreachingSla).toHaveBeenCalledWith(expect.any(Date), 500);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 500 when the list throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await getThreads(threadsRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
