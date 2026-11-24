// @vitest-environment node
/**
 * GET /api/admin/employers authorizes against the request-resolved org, not
 * a global admin flag: a default-org admin on a custom-domain host must not
 * list another tenant. POST still pre-checks Employer.userId globally
 * because that column is @unique across orgs, then creates inside the
 * resolved tenant and maps USER_NOT_FOUND / P2002 to 400.
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  resolveOrgFromRequest: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  userFindUnique: vi.fn(),
  roleFindUnique: vi.fn(),
  userRoleUpsert: vi.fn(),
  scopedOrg: vi.fn(),
  crossTenant: vi.fn(),
  auditLog: vi.fn(),
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
  isAdminInOrg: h.isAdminInOrg,
}));

vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({
  resolveOrgFromRequest: h.resolveOrgFromRequest,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: (tx: unknown) => unknown) =>
      arg({
        employer: { findUnique: h.findUnique },
        role: { findUnique: h.roleFindUnique },
        userRole: { upsert: h.userRoleUpsert },
      }),
    ),
    employer: { findUnique: h.findUnique, findMany: h.findMany, create: h.create },
    role: { findUnique: h.roleFindUnique },
    userRole: { upsert: h.userRoleUpsert },
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      employer: { findMany: h.findMany, create: h.create },
      user: { findUnique: h.userFindUnique },
    });
  }),
  crossTenantOK: vi.fn(async (fn: () => unknown) => {
    h.crossTenant();
    return fn();
  }),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

const { GET, POST } = await import('@/app/api/admin/employers/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const HOST_ORG = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID = '550e8400-e29b-41d4-a716-446655440010';

const createBody = {
  userId: USER_ID,
  companyName: 'Acme',
  contactName: 'Pat Lee',
  contactEmail: 'pat@acme.test',
};

function listRequest() {
  return new Request('http://custom.example/api/admin/employers');
}

function postRequest(body: unknown) {
  return new Request('http://custom.example/api/admin/employers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('GET /api/admin/employers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.resolveOrgFromRequest.mockResolvedValue(HOST_ORG);
    h.isAdminInOrg.mockResolvedValue(true);
    h.findMany.mockResolvedValue([{ id: 'emp-1', companyName: 'Acme' }]);
  });

  it('returns 401 before resolving the host org when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.resolveOrgFromRequest).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is not an admin of the host org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, HOST_ORG);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
  });

  it('lists employers inside the request-resolved tenant', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'emp-1', companyName: 'Acme' }]);
    expect(h.scopedOrg).toHaveBeenCalledWith(HOST_ORG);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
        orderBy: { companyName: 'asc' },
      }),
    );
  });

  it('returns 500 when listing throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/admin/employers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.resolveOrgFromRequest.mockResolvedValue(HOST_ORG);
    h.isAdminInOrg.mockResolvedValue(true);
    h.findUnique.mockResolvedValue(null);
    h.userFindUnique.mockResolvedValue({ id: USER_ID });
    h.create.mockResolvedValue({ id: 'emp-1', ...createBody, organizationId: HOST_ORG });
    h.roleFindUnique.mockResolvedValue({ id: 'role-employer' });
    h.userRoleUpsert.mockResolvedValue({});
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before parsing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(401);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without a tenant write', async () => {
    const res = await POST(
      new Request('http://custom.example/api/admin/employers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 403 after validation when the caller is not an admin of the host org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, HOST_ORG);
    expect(h.crossTenant).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the user is already an employer in any org', async () => {
    h.findUnique.mockResolvedValue({ id: 'emp-other' });
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'User is already an employer' });
    expect(h.crossTenant).toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the subject user is missing from the host tenant', async () => {
    h.userFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'User not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(HOST_ORG);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('maps a userId unique-constraint race to 400', async () => {
    h.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId'] },
      }),
    );
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'User is already an employer' });
  });

  it('creates the employer in the host tenant and stamps the employer role', async () => {
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(201);
    expect(h.scopedOrg).toHaveBeenCalledWith(HOST_ORG);
    expect(h.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: HOST_ORG,
        userId: USER_ID,
        companyName: 'Acme',
        contactName: 'Pat Lee',
        contactEmail: 'pat@acme.test',
      }),
    });
    expect(h.userRoleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_roleId: { userId: USER_ID, roleId: 'role-employer' } },
      }),
    );
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin_employer_create', targetId: USER_ID }),
    );
  });
});
