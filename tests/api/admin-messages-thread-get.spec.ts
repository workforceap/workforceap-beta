// @vitest-environment node
/**
 * GET /api/admin/messages/thread/[threadId] is a super-admin inbox over
 * member/employer/partner PII. Unsigned callers 401 and non-super-admins
 * 403 before any lookup. The thread, counselor roster, and messages are
 * loaded by id / active-only — no organizationId. Pin that current GET
 * where-clause rather than adding a tenant filter in a coverage run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  findFirst: vi.fn(),
  counselorFindMany: vi.fn(),
  assignmentFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  userFindMany: vi.fn(),
  getSlaStatusForThreads: vi.fn(),
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
  getSlaStatusForThreads: h.getSlaStatusForThreads,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    messageThread: { findFirst: h.findFirst },
    counselor: { findMany: h.counselorFindMany },
    counselorAssignment: { findFirst: h.assignmentFindFirst },
    message: { findMany: h.messageFindMany },
    user: { findMany: h.userFindMany },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  return { prisma };
});

const { GET } = await import('@/app/api/admin/messages/thread/[threadId]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const THREAD_ID = '550e8400-e29b-41d4-a716-446655440030';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440031';
const COUNSELOR_USER_ID = '550e8400-e29b-41d4-a716-446655440032';

function call(threadId = THREAD_ID) {
  return GET(new Request(`http://localhost/api/admin/messages/thread/${threadId}`) as never, {
    params: Promise.resolve({ threadId }),
  });
}

const now = new Date('2026-11-01T00:00:00.000Z');

const memberThread = {
  id: THREAD_ID,
  kind: 'member' as const,
  memberId: MEMBER_ID,
  employerId: null,
  partnerId: null,
  counselorUserId: COUNSELOR_USER_ID,
  memberLastReadAt: now,
  counselorLastReadAt: now,
  portalUserLastReadAt: null,
  staffLastReadAt: null,
  staffUserId: null,
  updatedAt: now,
  member: { id: MEMBER_ID, fullName: 'Pat Lee', email: 'pat@example.test', deletedAt: null },
  employer: null,
  partner: null,
  counselor: { id: 'c-row', fullName: 'Jordan Counselor' },
};

describe('GET /api/admin/messages/thread/[threadId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.findFirst.mockResolvedValue(memberThread);
    h.counselorFindMany.mockResolvedValue([
      {
        userId: COUNSELOR_USER_ID,
        user: { id: COUNSELOR_USER_ID, fullName: 'Jordan Counselor' },
        partner: { name: 'Northside' },
      },
    ]);
    h.assignmentFindFirst.mockResolvedValue({
      counselor: { userId: COUNSELOR_USER_ID },
    });
    h.messageFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        threadId: THREAD_ID,
        authorId: MEMBER_ID,
        body: 'hello from the member',
        createdAt: now,
      },
    ]);
    h.userFindMany.mockResolvedValue([{ id: MEMBER_ID, fullName: 'Pat Lee' }]);
    h.getSlaStatusForThreads.mockResolvedValue(new Map());
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.counselorFindMany).not.toHaveBeenCalled();
  });

  it('loads the thread by id only, the global active counselor roster, and 500 messages', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('member');
    expect(body.member).toEqual({
      id: MEMBER_ID,
      fullName: 'Pat Lee',
      email: 'pat@example.test',
    });
    expect(body.messages[0]).toEqual(
      expect.objectContaining({
        body: 'hello from the member',
        isFromMember: true,
        authorName: 'Pat Lee',
      }),
    );
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: THREAD_ID },
      }),
    );
    const threadWhere = h.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(threadWhere).not.toHaveProperty('organizationId');
    expect(threadWhere).not.toHaveProperty('member');
    expect(h.counselorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true },
        take: 500,
      }),
    );
    const counselorWhere = h.counselorFindMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(counselorWhere).not.toHaveProperty('organizationId');
    expect(h.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { threadId: THREAD_ID },
        take: 500,
      }),
    );
    expect(h.assignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: MEMBER_ID, active: true },
      }),
    );
    expect(h.getSlaStatusForThreads).toHaveBeenCalledWith([THREAD_ID]);
  });

  it('404s a missing thread and a deleted member thread before listing counselors', async () => {
    h.findFirst.mockResolvedValueOnce(null);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Thread not found' });
    expect(h.counselorFindMany).not.toHaveBeenCalled();
    expect(h.messageFindMany).not.toHaveBeenCalled();

    h.findFirst.mockResolvedValueOnce({
      ...memberThread,
      member: { ...memberThread.member, deletedAt: now },
    });
    const deleted = await call();
    expect(deleted.status).toBe(404);
    expect(await deleted.json()).toEqual({ error: 'Thread not found' });
    expect(h.counselorFindMany).not.toHaveBeenCalled();
  });

  it('returns employer PII without SLA and 400s an invalid thread after the unscoped reads', async () => {
    h.findFirst.mockResolvedValueOnce({
      ...memberThread,
      kind: 'employer',
      memberId: null,
      employerId: 'emp-1',
      member: null,
      counselor: null,
      employer: {
        id: 'emp-1',
        companyName: 'Acme Staffing',
        contactEmail: 'jobs@acme.test',
        userId: 'portal-1',
      },
    });
    const employer = await call();
    expect(employer.status).toBe(200);
    expect(await employer.json()).toEqual(
      expect.objectContaining({
        kind: 'employer',
        employer: {
          id: 'emp-1',
          companyName: 'Acme Staffing',
          contactEmail: 'jobs@acme.test',
        },
        sla: null,
      }),
    );
    expect(h.getSlaStatusForThreads).not.toHaveBeenCalled();
    expect(h.assignmentFindFirst).not.toHaveBeenCalled();

    h.findFirst.mockResolvedValueOnce({
      ...memberThread,
      kind: 'member',
      member: null,
    });
    const invalid = await call();
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid thread' });
    expect(h.counselorFindMany).toHaveBeenCalled();
    expect(h.messageFindMany).toHaveBeenCalled();
  });

  it('returns 500 Internal server error when the lookup throws', async () => {
    h.findFirst.mockRejectedValue(new Error('db down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
