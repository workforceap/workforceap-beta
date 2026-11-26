// @vitest-environment node
/**
 * GET /api/admin/metrics loads member-only tenant SQL for the actor org.
 * Unsigned and non-admin callers currently share 401 (not a distinct 403)
 * — pin that rather than "fixing" it. Tenant resolution and the payload
 * loader must not run until that gate passes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getAdminMetrics: vi.fn(),
  queryRaw: vi.fn(),
  countUnmatchedLearners: vi.fn(),
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

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
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

vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({
  isReadOnlyPortalAuditHeader: () => false,
}));

vi.mock('@/lib/admin/metrics', () => ({
  getAdminMetrics: h.getAdminMetrics,
}));

vi.mock('@/lib/coursera/progressQueries', () => ({
  countUnmatchedLearners: h.countUnmatchedLearners,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { $queryRaw: h.queryRaw },
}));

const { GET } = await import('@/app/api/admin/metrics/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest() {
  return new Request('http://localhost/api/admin/metrics');
}

describe('GET /api/admin/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.getAdminMetrics.mockResolvedValue({
      totalMembers: 10,
      placementStats: { enrolled: 4, placed: 1, placementRate: 25 },
      aiToolRuns: 2,
      applicationsSubmitted: 3,
    });
    h.countUnmatchedLearners.mockResolvedValue(0);
    h.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      if (/DATE_TRUNC/.test(sql)) return [];
      if (/AVG\(/.test(sql)) return [{ avg: null }];
      return [{ count: 0 }];
    });
  });

  it('returns 401 before tenant resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.getAdminMetrics).not.toHaveBeenCalled();
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('returns 401 before tenant resolution when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.getAdminMetrics).not.toHaveBeenCalled();
  });

  it('loads metrics for the actor organization only', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalMembers).toBe(10);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.getAdminMetrics).toHaveBeenCalledWith(ORG_ID, expect.anything());
    expect(h.countUnmatchedLearners).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ includeTestAccounts: false, strict: true }),
    );
    expect(h.queryRaw.mock.calls.length).toBeGreaterThan(0);
    for (const call of h.queryRaw.mock.calls) {
      expect(call).toContain(ORG_ID);
    }
  });

  it('returns 500 Failed to load metrics when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load metrics' });
    expect(h.getAdminMetrics).not.toHaveBeenCalled();
  });
});
