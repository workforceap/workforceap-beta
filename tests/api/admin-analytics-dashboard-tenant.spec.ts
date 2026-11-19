// @vitest-environment node
/**
 * GET /api/admin/analytics/dashboard counts members and placements for the
 * actor org only, and the salary average joins users on organization_id plus
 * MEMBER_ONLY_WHERE. Existing dashboard specs pin 401/403 and rate math —
 * this pack pins the tenant SQL so a later change cannot count another
 * org's roster or drop the member-only fence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  userCount: vi.fn(),
  placementCount: vi.fn(),
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

vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { count: h.userCount },
    placementRecord: { count: h.placementCount },
    $queryRaw: h.queryRaw,
  },
}));

const { GET } = await import('@/app/api/admin/analytics/dashboard/route');
const { MEMBER_ONLY_WHERE } = await import('@/lib/admin/memberOnlyWhere');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest() {
  return new Request('http://localhost/api/admin/analytics/dashboard');
}

describe('GET /api/admin/analytics/dashboard tenant SQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.userCount.mockResolvedValue(10);
    h.placementCount.mockResolvedValue(2);
    h.queryRaw.mockResolvedValue([{ avg: 65000 }]);
  });

  it('returns 401 before tenant resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.userCount).not.toHaveBeenCalled();
  });

  it('returns 403 before tenant resolution when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.userCount).not.toHaveBeenCalled();
  });

  it('counts members and placements with actor org + MEMBER_ONLY_WHERE and binds org on salary SQL', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.userCount).toHaveBeenNthCalledWith(1, {
      where: { deletedAt: null, organizationId: ORG_ID, ...MEMBER_ONLY_WHERE },
    });
    expect(h.userCount).toHaveBeenNthCalledWith(2, {
      where: {
        deletedAt: null,
        organizationId: ORG_ID,
        enrolledProgram: { not: null },
        ...MEMBER_ONLY_WHERE,
      },
    });
    expect(h.userCount).toHaveBeenNthCalledWith(3, {
      where: {
        deletedAt: null,
        organizationId: ORG_ID,
        assessmentCompleted: true,
        ...MEMBER_ONLY_WHERE,
      },
    });
    expect(h.placementCount).toHaveBeenCalledWith({
      where: { user: { organizationId: ORG_ID, deletedAt: null, ...MEMBER_ONLY_WHERE } },
    });
    expect(h.queryRaw).toHaveBeenCalled();
    const rawArgs = h.queryRaw.mock.calls[0];
    expect(rawArgs).toContain(ORG_ID);
    expect(JSON.stringify(rawArgs)).toContain('organization_id');
  });

  it('returns 500 Internal server error when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.userCount).not.toHaveBeenCalled();
  });
});
