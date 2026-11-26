// @vitest-environment node
/**
 * GET /api/admin/pipeline/at-risk-stats. Unsigned and non-staff callers
 * currently share 403 (not a distinct 401) — pin that rather than
 * "fixing" it. Admins count inside the actor org; super-admins omit the
 * org filter. Counselor assignment scoping is already pinned in
 * counselor-routes.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
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
  isCounselor: h.isCounselor,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    atRiskAlert: {
      count: h.count,
      findMany: h.findMany,
    },
  },
}));

const { GET } = await import('@/app/api/admin/pipeline/at-risk-stats/route');
const { THRESHOLDS } = await import('@/lib/member/atRiskScoring');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest() {
  return new Request('http://localhost/api/admin/pipeline/at-risk-stats');
}

describe('GET /api/admin/pipeline/at-risk-stats tenant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isCounselor.mockResolvedValue(false);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.count.mockResolvedValue(0);
    h.findMany.mockResolvedValue([]);
  });

  it('returns 403 before role checks when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.isCounselor).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('returns 403 before tenant resolution when the caller is not staff', async () => {
    h.isAdmin.mockResolvedValue(false);
    h.isCounselor.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('counts critical/open alerts for the actor org at the CRITICAL threshold', async () => {
    h.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      criticalCount: 3,
      alertsSentToday: 1,
      counselorsWithPending: [],
    });
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.count).toHaveBeenNthCalledWith(1, {
      where: {
        user: { organizationId: ORG_ID },
        score: { gte: THRESHOLDS.CRITICAL },
        status: { in: ['open', 'acknowledged'] },
      },
    });
    expect(h.count.mock.calls[1][0].where).toEqual(
      expect.objectContaining({
        user: { organizationId: ORG_ID },
        notifiedCounselorAt: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    );
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { organizationId: ORG_ID },
          score: { gte: THRESHOLDS.CRITICAL },
          status: { in: ['open', 'acknowledged'] },
        },
      }),
    );
  });

  it('omits the org filter for a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.count.mock.calls[0][0].where).toEqual({
      score: { gte: THRESHOLDS.CRITICAL },
      status: { in: ['open', 'acknowledged'] },
    });
    expect(h.count.mock.calls[0][0].where).not.toHaveProperty('user');
  });

  it('returns 500 Internal server error when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.count).not.toHaveBeenCalled();
  });
});
