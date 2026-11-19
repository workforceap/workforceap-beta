// @vitest-environment node
/**
 * GET /api/admin/analytics/programs lists the actor org catalog and groups
 * enrollments by enrolledProgram inside that org. Completions SQL joins
 * users and course_enrollments on organization_id. Enrollment groupBy
 * still does not apply MEMBER_ONLY_WHERE — pin that current where-clause
 * rather than adding the fence in a coverage run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    organizationProgramCatalog: { findMany: h.findMany },
    user: { groupBy: h.groupBy },
    $queryRaw: h.queryRaw,
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)),
    },
  };
});

const { GET } = await import('@/app/api/admin/analytics/programs/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest() {
  return new Request('http://localhost/api/admin/analytics/programs');
}

describe('GET /api/admin/analytics/programs tenant SQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([{ id: 'p1', name: 'IT Support' }]);
    h.groupBy.mockResolvedValue([{ enrolledProgram: 'IT Support', _count: { id: 10 } }]);
    h.queryRaw.mockResolvedValue([{ program: 'IT Support', count: 4 }]);
  });

  it('returns 401 before tenant resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before tenant resolution when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.groupBy).not.toHaveBeenCalled();
  });

  it('lists the actor catalog, groups enrollments without MEMBER_ONLY_WHERE, and binds org twice on completions SQL', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programs).toEqual([
      {
        programId: 'p1',
        programName: 'IT Support',
        enrolled: 10,
        completed: 4,
        completionRate: 40,
      },
    ]);
    expect(h.findMany).toHaveBeenCalledWith({
      take: 500,
      where: { organizationId: ORG_ID },
      select: { id: true, name: true },
    });
    expect(h.groupBy).toHaveBeenCalledWith({
      by: ['enrolledProgram'],
      where: {
        organizationId: ORG_ID,
        deletedAt: null,
        enrolledProgram: { not: null },
      },
      _count: { id: true },
    });
    const groupWhere = h.groupBy.mock.calls[0][0].where as Record<string, unknown>;
    expect(groupWhere).not.toHaveProperty('NOT');
    expect(groupWhere).not.toHaveProperty('email');
    expect(h.queryRaw).toHaveBeenCalled();
    const rawArgs = h.queryRaw.mock.calls[0] as unknown[];
    expect(rawArgs.filter((arg) => arg === ORG_ID)).toHaveLength(2);
  });

  it('returns 500 Internal server error when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
