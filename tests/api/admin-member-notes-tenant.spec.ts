// @vitest-environment node
/**
 * Counselor notes are free-text PII. GET/POST must confirm the member is in
 * the actor org via withTenantScope before listing or creating a note.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findFirst: vi.fn(),
  scopedOrg: vi.fn(),
  findManyNotes: vi.fn(),
  createNote: vi.fn(),
  captureApiError: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findFirst: h.findFirst } });
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: {
          counselorNote: { findMany: typeof h.findManyNotes; create: typeof h.createNote };
        }) => unknown)({
          counselorNote: { findMany: h.findManyNotes, create: h.createNote },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { GET, POST } = await import('@/app/api/admin/members/[id]/notes/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const NOTE_ID = '550e8400-e29b-41d4-a716-446655440004';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-4466554400b0';

function ctx(id = MEMBER_ID) {
  return { params: Promise.resolve({ id }) };
}

function getReq(id = MEMBER_ID) {
  return GET(new Request(`http://localhost/api/admin/members/${id}/notes`) as never, ctx(id));
}

function postReq(body: unknown, id = MEMBER_ID) {
  return POST(
    new Request(`http://localhost/api/admin/members/${id}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    ctx(id),
  );
}

const createdNote = {
  id: NOTE_ID,
  memberId: MEMBER_ID,
  authorId: ADMIN_ID,
  content: 'Follow up Friday',
  author: { fullName: 'Admin', email: 'admin@org.test' },
};

describe('GET /api/admin/members/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ id: MEMBER_ID });
    h.findManyNotes.mockResolvedValue([]);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getReq();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.findManyNotes).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await getReq();
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findManyNotes).not.toHaveBeenCalled();
  });

  it('returns 404 without listing notes for a foreign or missing member', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await getReq(FOREIGN_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID },
      select: { id: true },
    });
    expect(h.findManyNotes).not.toHaveBeenCalled();
  });

  it('lists notes for an in-org member with take 500', async () => {
    const res = await getReq();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(h.findManyNotes).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID },
      take: 500,
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { fullName: true, email: true } } },
    });
  });

  it('returns 500 when listing throws', async () => {
    h.findManyNotes.mockRejectedValue(new Error('db down'));
    const res = await getReq();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});

describe('POST /api/admin/members/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ id: MEMBER_ID });
    h.createNote.mockResolvedValue(createdNote);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await postReq({ content: 'hi' });
    expect(res.status).toBe(401);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.createNote).not.toHaveBeenCalled();
  });

  it('returns 400 without a lookup for empty content', async () => {
    const res = await postReq({ content: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Note content required' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.createNote).not.toHaveBeenCalled();
  });

  it('returns 400 without a lookup for invalid JSON', async () => {
    const res = await postReq('not-json');
    expect(res.status).toBe(400);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.createNote).not.toHaveBeenCalled();
  });

  it('returns 404 without writing a note for a foreign member', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await postReq({ content: 'secret' }, FOREIGN_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.createNote).not.toHaveBeenCalled();
  });

  it('creates a note stamped with the actor and member ids', async () => {
    const res = await postReq({ content: 'Follow up Friday' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdNote);
    expect(h.createNote).toHaveBeenCalledWith({
      data: { memberId: MEMBER_ID, authorId: ADMIN_ID, content: 'Follow up Friday' },
      include: { author: { select: { fullName: true, email: true } } },
    });
  });
});
