// @vitest-environment node
/**
 * GET /api/admin/programs/catalog is a tenant catalog read. Auth must fail
 * before cache or Prisma. An empty actor-org catalog auto-seeds that org
 * and re-reads through withTenantScope; a non-empty catalog must not seed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  seedOrganizationProgramCatalog: vi.fn(),
  getCacheOrFetch: vi.fn(),
  scopedOrg: vi.fn(),
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

vi.mock('@/lib/platform/seedProgramCatalog', () => ({
  seedOrganizationProgramCatalog: h.seedOrganizationProgramCatalog,
}));

vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: h.getCacheOrFetch,
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ organizationProgramCatalog: { findMany: h.findMany } });
  }),
}));

const { GET } = await import('@/app/api/admin/programs/catalog/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const row = { id: 'row-1', programSlug: 'cybersecurity', name: 'Cyber', organizationId: ORG_ID };

function getRequest() {
  return new Request('http://localhost/api/admin/programs/catalog');
}

describe('GET /api/admin/programs/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([row]);
    h.seedOrganizationProgramCatalog.mockResolvedValue(undefined);
    h.getCacheOrFetch.mockImplementation(async (_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it('returns 401 before catalog when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.getCacheOrFetch).not.toHaveBeenCalled();
  });

  it('returns 403 before catalog when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('reads the actor-org catalog through withTenantScope and skips seed when rows exist', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ programs: [row] });
    expect(h.getCacheOrFetch).toHaveBeenCalledWith(
      `programs:list:${ORG_ID}`,
      expect.any(Function),
      3600,
    );
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      take: 100,
    });
    expect(h.seedOrganizationProgramCatalog).not.toHaveBeenCalled();
  });

  it('seeds the actor org then re-reads when the catalog is empty', async () => {
    h.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ programs: [row] });
    expect(h.seedOrganizationProgramCatalog).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledTimes(2);
    expect(h.scopedOrg.mock.calls.map((call: unknown[]) => call[0])).toEqual([ORG_ID, ORG_ID]);
  });

  it('returns 500 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.getCacheOrFetch).not.toHaveBeenCalled();
  });
});
