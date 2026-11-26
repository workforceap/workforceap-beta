// @vitest-environment node
/**
 * GET /api/admin/coursera/inspect-by-email builds a PII dossier. Org admins
 * must resolve an actor org and pass isAdminInOrg before the tenant lookup.
 * A missing WAP user skips local mapping/xAPI for org admins; super-admins
 * still read xAPI by email with no org filter — pin that rather than
 * "fixing" it. Roster fetch failures stay 200 with diagnosis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findFirst: vi.fn(),
  findManyUsers: vi.fn(),
  progressFindMany: vi.fn(),
  memberProgressCount: vi.fn(),
  mappingRaw: vi.fn(),
  xapiCount: vi.fn(),
  xapiLatest: vi.fn(),
  unprocessedRaw: vi.fn(),
  listAllUsers: vi.fn(),
  getEnrollmentReports: vi.fn(),
  getCourseGradebookReports: vi.fn(),
  ensureCourseraMappingTables: vi.fn(),
  captureApiError: vi.fn(),
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
  isSuperAdmin: h.isSuperAdmin,
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

vi.mock('@/lib/coursera/b4bClient', () => ({
  listAllUsers: h.listAllUsers,
  getEnrollmentReports: h.getEnrollmentReports,
  getCourseGradebookReports: h.getCourseGradebookReports,
}));

vi.mock('@/lib/xapi/mappings', () => ({
  ensureCourseraMappingTables: h.ensureCourseraMappingTables,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    courseProgress: { findMany: h.progressFindMany },
    memberProgramProgress: { count: h.memberProgressCount },
    user: { findMany: h.findManyUsers },
    xapiStatement: { count: h.xapiCount, findFirst: h.xapiLatest },
    $queryRaw: h.mappingRaw,
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      $queryRaw: h.unprocessedRaw,
      user: tx.user,
      xapiStatement: tx.xapiStatement,
    },
  };
});

const { GET } = await import('@/app/api/admin/coursera/inspect-by-email/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const EMAIL = 'learner@example.test';

function request(email = EMAIL) {
  const url = new URL('http://localhost/api/admin/coursera/inspect-by-email');
  if (email !== undefined) url.searchParams.set('email', email);
  return new Request(url);
}

describe('GET /api/admin/coursera/inspect-by-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isAdminInOrg.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.findFirst.mockResolvedValue(null);
    h.findManyUsers.mockResolvedValue([]);
    h.progressFindMany.mockResolvedValue([]);
    h.memberProgressCount.mockResolvedValue(0);
    h.mappingRaw.mockResolvedValue([]);
    h.xapiCount.mockResolvedValue(0);
    h.xapiLatest.mockResolvedValue(null);
    h.unprocessedRaw.mockResolvedValue([{ count: BigInt(0) }]);
    h.listAllUsers.mockResolvedValue({ elements: [], pagesFetched: 1 });
    h.getEnrollmentReports.mockResolvedValue({ elements: [] });
    h.getCourseGradebookReports.mockResolvedValue({ elements: [] });
    h.ensureCourseraMappingTables.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.listAllUsers).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing or invalid email before the tenant lookup', async () => {
    const missing = await GET(request('') as never);
    expect(missing.status).toBe(400);
    const invalid = await GET(request('not-an-email') as never);
    expect(invalid.status).toBe(400);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('looks up the WAP user in the actor org and skips xAPI when no member exists', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          email: { equals: EMAIL, mode: 'insensitive' },
        },
      }),
    );
    expect(h.xapiCount).not.toHaveBeenCalled();
    expect(h.findManyUsers).not.toHaveBeenCalled();
    expect(body.wap.userId).toBeNull();
    expect(body.xapiActivity).toEqual({
      statementCount: 0,
      latestStatementAt: null,
      unprocessedCount: 0,
    });
    expect(body.diagnosis.some((line: string) => line.includes('No WAP user'))).toBe(true);
  });

  it('lets a super-admin read xAPI by email with no org filter when no in-org user exists', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.xapiCount.mockResolvedValue(3);
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.findManyUsers).not.toHaveBeenCalled();
    expect(h.xapiCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorEmail: { equals: EMAIL, mode: 'insensitive' } },
      }),
    );
    expect(await res.json()).toMatchObject({
      xapiActivity: { statementCount: 3, unprocessedCount: 0 },
    });
  });

  it('stays 200 when the Coursera roster throws', async () => {
    h.listAllUsers.mockRejectedValue(new Error('b4b down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coursera.foundInRoster).toBe(false);
    expect(body.diagnosis.some((line: string) => line.includes('b4b down'))).toBe(true);
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 500 when the tenant lookup throws', async () => {
    h.findFirst.mockRejectedValue(new Error('db down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
