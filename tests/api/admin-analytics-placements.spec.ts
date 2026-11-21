// @vitest-environment node
/**
 * GET /api/admin/analytics/placements returns placement PII for the actor
 * org. Auth must fail before the helper runs. The helper's findMany/count
 * and salary SQL all filter users.organizationId + deletedAt, take 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  queryRaw: vi.fn(),
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
    placementRecord: { findMany: h.findMany, count: h.count },
    $queryRaw: h.queryRaw,
  },
}));

const { GET } = await import('@/app/api/admin/analytics/placements/route');
const { fetchPlacementAnalytics } = await import(
  '@/app/api/admin/analytics/placements/_placementsAnalytics'
);

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest() {
  return new Request('http://localhost/api/admin/analytics/placements');
}

describe('GET /api/admin/analytics/placements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
    h.queryRaw.mockResolvedValue([{ avg: null, median: null, min: null, max: null }]);
  });

  it('returns 401 before analytics when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before analytics when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('loads placements for the actor organization', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user: { organizationId: ORG_ID, deletedAt: null } },
        take: 500,
      }),
    );
  });

  it('returns 500 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMany).not.toHaveBeenCalled();
  });
});

describe('fetchPlacementAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findMany.mockResolvedValue([
      { id: 'p-1', user: { id: 'm-1', fullName: 'Pat', email: 'pat@example.test' } },
    ]);
    h.count.mockResolvedValue(1);
    h.queryRaw.mockResolvedValue([{ avg: 40000.4, median: 39000.2, min: 30000, max: 50000.9 }]);
  });

  it('scopes findMany, count and salary SQL to the org and drops deleted members', async () => {
    const result = await fetchPlacementAnalytics(ORG_ID);
    expect(result.outcomes).toEqual({
      total: 1,
      avgSalary: 40000,
      medianSalary: 39000,
      minSalary: 30000,
      maxSalary: 50001,
    });
    expect(h.findMany).toHaveBeenCalledWith({
      where: { user: { organizationId: ORG_ID, deletedAt: null } },
      orderBy: { placedAt: 'desc' },
      take: 500,
      include: { user: { select: { fullName: true, email: true, id: true } } },
    });
    expect(h.count).toHaveBeenCalledWith({
      where: { user: { organizationId: ORG_ID, deletedAt: null } },
    });
    expect(h.queryRaw.mock.calls[0]).toContain(ORG_ID);
    const sql = (h.queryRaw.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(sql).toMatch(/u\.organization_id/);
    expect(sql).toMatch(/u\.deleted_at IS NULL/);
  });
});
