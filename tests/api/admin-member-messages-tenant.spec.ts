// @vitest-environment node
/**
 * GET/POST /api/admin/members/[id]/messages read and write counselor-thread
 * PII. Auth and the tenant member lookup must run before any thread or
 * message access: a guessed UUID from another org is 404, and a failed
 * staff-access check is 403 without listing bodies. Invalid JSON is still
 * parsed after the tenant lookup (pinned, not "fixed").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMember: vi.fn(),
  findMessages: vi.fn(),
  findAuthors: vi.fn(),
  createMessage: vi.fn(),
  updateThread: vi.fn(),
  getOrCreate: vi.fn(),
  canAccess: vi.fn(),
  canPost: vi.fn(),
  createNotification: vi.fn(),
  notifyEmail: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: {
      user: { findFirst: typeof h.findMember };
      message: { findMany: typeof h.findMessages; create: typeof h.createMessage };
      messageThread: { update: typeof h.updateThread };
    }) => unknown) =>
      fn({
        user: { findFirst: h.findMember },
        message: { findMany: h.findMessages, create: h.createMessage },
        messageThread: { update: h.updateThread },
      })),
    user: { findMany: h.findAuthors },
  },
}));

vi.mock('@/lib/messages/counselorThread', async () => {
  const actual = await vi.importActual<typeof import('@/lib/messages/counselorThread')>(
    '@/lib/messages/counselorThread',
  );
  return {
    ...actual,
    getOrCreateMemberCounselorThread: h.getOrCreate,
    assertStaffCanAccessThread: h.canAccess,
    assertStaffCanPost: h.canPost,
  };
});

vi.mock('@/lib/notifications/create', () => ({ createNotification: h.createNotification }));
vi.mock('@/lib/messages/notifyMemberOfStaffMessageEmail', () => ({
  notifyMemberOfStaffPortalMessageEmail: h.notifyEmail,
}));
vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

const { GET, POST } = await import('@/app/api/admin/members/[id]/messages/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-446655440004';
const THREAD_ID = '550e8400-e29b-41d4-a716-446655440005';

const params = { params: Promise.resolve({ id: MEMBER_ID }) };
const foreignParams = { params: Promise.resolve({ id: FOREIGN_ID }) };

function getRequest(id = MEMBER_ID) {
  return new Request(`http://localhost/api/admin/members/${id}/messages`);
}

function postRequest(body: unknown, id = MEMBER_ID) {
  return new Request(`http://localhost/api/admin/members/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('GET /api/admin/members/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMember.mockResolvedValue({ id: MEMBER_ID, fullName: 'Ada Member' });
    h.getOrCreate.mockResolvedValue({
      id: THREAD_ID,
      memberId: MEMBER_ID,
      counselorUserId: ADMIN_ID,
      memberLastReadAt: null,
      counselorLastReadAt: null,
    });
    h.canAccess.mockResolvedValue(true);
    h.findMessages.mockResolvedValue([]);
    h.findAuthors.mockResolvedValue([]);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findMember).not.toHaveBeenCalled();
    expect(h.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns 403 without a thread read when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMember).not.toHaveBeenCalled();
    expect(h.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns 404 without opening a thread when the member is outside the actor org', async () => {
    h.findMember.mockResolvedValue(null);
    const res = await GET(getRequest(FOREIGN_ID) as never, foreignParams);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.findMember).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, deletedAt: null, organizationId: ORG_ID },
      select: { id: true, fullName: true },
    });
    expect(h.getOrCreate).not.toHaveBeenCalled();
    expect(h.findMessages).not.toHaveBeenCalled();
  });

  it('lists up to 500 messages for a same-org member after the staff-access check', async () => {
    const createdAt = new Date('2026-11-01T12:00:00.000Z');
    h.findMessages.mockResolvedValue([
      { id: 'msg-1', threadId: THREAD_ID, authorId: ADMIN_ID, body: 'Hello', createdAt },
    ]);
    h.findAuthors.mockResolvedValue([{ id: ADMIN_ID, fullName: 'Pat Staff' }]);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(200);
    expect(h.getOrCreate).toHaveBeenCalledWith(MEMBER_ID);
    expect(h.canAccess).toHaveBeenCalledWith(ADMIN_ID, THREAD_ID);
    expect(h.findMessages).toHaveBeenCalledWith({
      where: { threadId: THREAD_ID },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    expect(h.findAuthors).toHaveBeenCalledWith({
      where: { id: { in: [ADMIN_ID] } },
      select: { id: true, fullName: true },
      take: 100,
    });
    expect(await res.json()).toEqual({
      member: { id: MEMBER_ID, fullName: 'Ada Member' },
      thread: {
        id: THREAD_ID,
        memberId: MEMBER_ID,
        counselorUserId: ADMIN_ID,
        memberLastReadAt: null,
        counselorLastReadAt: null,
      },
      messages: [
        {
          id: 'msg-1',
          threadId: THREAD_ID,
          authorId: ADMIN_ID,
          body: 'Hello',
          createdAt: createdAt.toISOString(),
          authorName: 'Pat Staff',
        },
      ],
    });
  });

  it('returns 403 without listing bodies when staff cannot access the thread', async () => {
    h.canAccess.mockResolvedValue(false);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getOrCreate).toHaveBeenCalledOnce();
    expect(h.findMessages).not.toHaveBeenCalled();
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMember).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('POST /api/admin/members/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMember.mockResolvedValue({ id: MEMBER_ID });
    h.getOrCreate.mockResolvedValue({
      id: THREAD_ID,
      memberId: MEMBER_ID,
      counselorUserId: null,
    });
    h.canPost.mockResolvedValue(true);
    h.createMessage.mockResolvedValue({
      id: 'msg-1',
      threadId: THREAD_ID,
      authorId: ADMIN_ID,
      body: 'Please call me.',
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
    });
    h.updateThread.mockResolvedValue({});
    h.createNotification.mockResolvedValue(undefined);
    h.notifyEmail.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ body: 'Hello' }) as never, params);
    expect(res.status).toBe(401);
    expect(h.findMember).not.toHaveBeenCalled();
    expect(h.createMessage).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(postRequest({ body: 'Hello' }) as never, params);
    expect(res.status).toBe(403);
    expect(h.findMember).not.toHaveBeenCalled();
    expect(h.createMessage).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the member is outside the actor org', async () => {
    h.findMember.mockResolvedValue(null);
    const res = await POST(postRequest({ body: 'Hello' }, FOREIGN_ID) as never, foreignParams);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.findMember).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, deletedAt: null, organizationId: ORG_ID },
      select: { id: true },
    });
    expect(h.getOrCreate).not.toHaveBeenCalled();
    expect(h.createMessage).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON after the tenant lookup (pinned, not parsed first)', async () => {
    const res = await POST(postRequest('{') as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.findMember).toHaveBeenCalledOnce();
    expect(h.getOrCreate).not.toHaveBeenCalled();
    expect(h.createMessage).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when staff cannot post to the thread', async () => {
    h.canPost.mockResolvedValue(false);
    const res = await POST(postRequest({ body: 'Hello' }) as never, params);
    expect(res.status).toBe(403);
    expect(h.getOrCreate).toHaveBeenCalledWith(MEMBER_ID);
    expect(h.createMessage).not.toHaveBeenCalled();
  });

  it('creates the message for a same-org member', async () => {
    const res = await POST(postRequest({ body: 'Please call me.' }) as never, params);
    expect(res.status).toBe(200);
    expect(h.createMessage).toHaveBeenCalledWith({
      data: {
        threadId: THREAD_ID,
        authorId: ADMIN_ID,
        body: 'Please call me.',
      },
    });
    expect(h.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER_ID,
        type: 'message',
        data: expect.objectContaining({ threadId: THREAD_ID, authorId: ADMIN_ID }),
      }),
    );
  });
});
