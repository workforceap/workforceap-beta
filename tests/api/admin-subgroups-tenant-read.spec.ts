// @vitest-environment node
/**
 * GET /api/admin/subgroups lists by the leader's organization for tenant
 * admins (super-admins keep an empty filter). POST refuses a leader or
 * partner outside that org before creating. Pin current behavior: an
 * unresolved actor org on GET answers [] rather than 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  findPartner: vi.fn(),
  findLeader: vi.fn(),
  create: vi.fn(),
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
  requireAdmin: h.requireAdmin,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg({
          subgroup: { findMany: h.findMany, create: h.create },
          partner: { findFirst: h.findPartner },
          user: { findFirst: h.findLeader },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

const { GET, POST } = await import('@/app/api/admin/subgroups/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const LEADER_ID = '550e8400-e29b-41d4-a716-446655440003';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440004';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-446655440005';

function listRequest() {
  return new Request('http://localhost/api/admin/subgroups');
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/subgroups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const createBody = {
  name: 'East Austin Chapter',
  type: 'manager' as const,
  leaderId: LEADER_ID,
};

describe('GET /api/admin/subgroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([{ id: 'sg-1', name: 'East Austin Chapter' }]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.requireAdmin).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists subgroups whose leader belongs to the actor org', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'sg-1', name: 'East Austin Chapter' }]);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: { leader: { organizationId: ORG_ID } },
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('answers [] without listing when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('keeps an empty tenant filter for a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: {},
      }),
    );
  });

  it('returns 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('POST /api/admin/subgroups tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findPartner.mockResolvedValue({ id: PARTNER_ID, active: true, organizationId: ORG_ID });
    h.findLeader.mockResolvedValue({ id: LEADER_ID });
    h.create.mockResolvedValue({
      id: 'sg-1',
      ...createBody,
      leader: { id: LEADER_ID, fullName: 'Ada', email: 'ada@example.test' },
      partner: null,
      _count: { members: 0 },
    });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before looking up a leader when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(401);
    expect(h.findLeader).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(403);
    expect(h.findLeader).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without a write', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/subgroups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(h.findLeader).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the leader is outside the actor org', async () => {
    h.findLeader.mockResolvedValue(null);
    const res = await POST(postRequest({ ...createBody, leaderId: FOREIGN_ID }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Leader user not found or not in your organization',
    });
    expect(h.findLeader).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, organizationId: ORG_ID },
      select: { id: true },
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the partner is inactive or cross-tenant', async () => {
    h.findPartner.mockResolvedValue(null);
    const res = await POST(
      postRequest({
        name: 'Referral desk',
        type: 'partner',
        leaderId: LEADER_ID,
        partnerId: FOREIGN_ID,
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Invalid, inactive, or cross-tenant partner',
    });
    expect(h.findPartner).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, active: true, organizationId: ORG_ID },
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('creates a subgroup with a same-org leader', async () => {
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(201);
    expect(h.findPartner).not.toHaveBeenCalled();
    expect(h.findLeader).toHaveBeenCalledWith({
      where: { id: LEADER_ID, organizationId: ORG_ID },
      select: { id: true },
    });
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'East Austin Chapter',
          type: 'manager',
          leaderId: LEADER_ID,
          partnerId: null,
          createdBy: ADMIN_ID,
        }),
      }),
    );
  });

  it('returns 500 when create throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.create.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
