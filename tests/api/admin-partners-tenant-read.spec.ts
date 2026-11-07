// @vitest-environment node
/**
 * GET /api/admin/partners lists inside the actor org after a global isAdmin
 * check. POST pre-checks slug and referralCode globally because both columns
 * are still @unique across orgs, then creates inside withTenantScope and
 * maps P2002 races to 400 instead of 500.
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  globalFindFirst: vi.fn(),
  create: vi.fn(),
  scopedOrg: vi.fn(),
  crossTenant: vi.fn(),
  auditLog: vi.fn(),
  syncCatalog: vi.fn(),
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
    partner: {
      findUnique: h.findUnique,
      findFirst: h.globalFindFirst,
    },
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      partner: { findMany: h.findMany, create: h.create },
    });
  }),
  crossTenantOK: vi.fn(async (fn: () => unknown) => {
    h.crossTenant();
    return fn();
  }),
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/partner/syncProgramCatalog', () => ({
  syncPartnerProgramCatalog: (...args: unknown[]) => h.syncCatalog(...args),
}));

const { GET, POST } = await import('@/app/api/admin/partners/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

const createBody = { name: 'Austin Workforce Council', slug: 'austin-council' };

function listRequest() {
  return new Request('http://localhost/api/admin/partners');
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/partners', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('GET /api/admin/partners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([{ id: 'partner-1', name: 'Austin Workforce Council' }]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdmin).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists partners inside the actor org', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'partner-1', name: 'Austin Workforce Council' }]);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        orderBy: { name: 'asc' },
        include: { _count: { select: { counselors: true, referrals: true } } },
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

describe('POST /api/admin/partners uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findUnique.mockResolvedValue(null);
    h.globalFindFirst.mockResolvedValue(null);
    h.create.mockResolvedValue({
      id: 'partner-1',
      ...createBody,
      referralCode: createBody.slug,
      organizationId: ORG_ID,
      status: 'active',
    });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid JSON without a tenant write', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/partners', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.crossTenant).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the slug exists in any org', async () => {
    h.findUnique.mockResolvedValue({ id: 'partner-other-org' });
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A partner with this slug already exists' });
    expect(h.crossTenant).toHaveBeenCalled();
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { slug: 'austin-council' },
      select: { id: true },
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the referral code matches another slug or code', async () => {
    h.globalFindFirst.mockResolvedValue({ id: 'partner-other-org' });
    const res = await POST(
      postRequest({ ...createBody, referralCode: 'taken-code' }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Referral code must be unique and different from other partners slugs',
    });
    expect(h.globalFindFirst).toHaveBeenCalledWith({
      where: { OR: [{ referralCode: 'taken-code' }, { slug: 'taken-code' }] },
      select: { id: true },
    });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('maps a slug unique-constraint race to 400', async () => {
    h.create.mockRejectedValue(p2002(['slug']));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A partner with this slug already exists' });
  });

  it('maps a referralCode unique-constraint race to 400', async () => {
    h.create.mockRejectedValue(p2002(['referral_code']));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Referral code must be unique and different from other partners slugs',
    });
  });

  it('maps an unrecognized unique-constraint race to a generic 400', async () => {
    h.create.mockRejectedValue(p2002(['id']));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A partner with these details already exists' });
  });

  it('creates the partner in the actor org and defaults referralCode to the slug', async () => {
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(201);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Austin Workforce Council',
        slug: 'austin-council',
        referralCode: 'austin-council',
        organizationId: ORG_ID,
        status: 'active',
      }),
    });
    expect(h.syncCatalog).not.toHaveBeenCalled();
  });
});
