// @vitest-environment node
/**
 * GET /api/admin/coursera/reconcile dumps Coursera and WAP emails in one
 * report. Actor-org throw and non-admin-in-org stay 403 before the roster
 * read. WAP users come from withTenantScope(actor org) with deletedAt null
 * and no MEMBER_ONLY_WHERE. Coursera roster failures are 502. Limit clamps
 * at 1000. Matching is by lowercased email.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findMany: vi.fn(),
  listAllUsers: vi.fn(),
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
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findMany: h.findMany } });
  }),
}));

vi.mock('@/lib/coursera/b4bClient', () => ({
  listAllUsers: h.listAllUsers,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET } = await import('@/app/api/admin/coursera/reconcile/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const DEFAULT_PROGRAM = 'TpIlAogTQ8-SJQKIE8PP9w';

function request(query = '') {
  return new Request(`http://localhost/api/admin/coursera/reconcile${query}`);
}

function wapUser(over: Record<string, unknown> = {}) {
  return {
    id: 'wap-1',
    email: 'ada@example.test',
    fullName: 'Ada Lovelace',
    enrolledProgram: null,
    courseEnrollments: [],
    ...over,
  };
}

describe('GET /api/admin/coursera/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isAdminInOrg.mockResolvedValue(true);
    h.findMany.mockResolvedValue([]);
    h.listAllUsers.mockResolvedValue({ elements: [] });
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.listAllUsers).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 403 before the roster when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 502 when the Coursera roster throws, without a WAP read', async () => {
    h.listAllUsers.mockRejectedValue(new Error('b4b down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Coursera roster fetch failed: b4b down' });
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('reads WAP users through withTenantScope(actor org) with deletedAt null', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.listAllUsers).toHaveBeenCalledWith({ pageLimit: 1000 });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        select: expect.objectContaining({
          id: true,
          email: true,
          fullName: true,
          enrolledProgram: true,
        }),
      }),
    );
    const where = h.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).not.toHaveProperty('organizationId');
    expect(where).not.toHaveProperty('role');
    const body = await res.json();
    expect(body.programId).toBe(DEFAULT_PROGRAM);
    expect(body.summary).toEqual({
      courseraUsers: 0,
      wapUsers: 0,
      matched: 0,
      courseraOnly: 0,
      wapOnly: 0,
      wrongCourse: 0,
    });
    expect(body.rows).toEqual([]);
  });

  it('classifies matched, coursera-only, wap-only, and wrong-course by email', async () => {
    h.listAllUsers.mockResolvedValue({
      elements: [
        {
          id: 'c-match',
          email: 'Ada@example.test',
          fullName: 'Ada C',
          membershipProgramIds: [DEFAULT_PROGRAM],
        },
        {
          id: 'c-only',
          email: 'coursera-only@example.test',
          fullName: 'Only Coursera',
        },
        {
          id: 'c-wrong',
          email: 'wrong@example.test',
          fullName: 'Wrong Course',
          membershipProgramIds: ['other-program'],
        },
        { id: 'c-blank', email: '   ' },
      ],
    });
    h.findMany.mockResolvedValue([
      wapUser(),
      wapUser({
        id: 'wap-wrong',
        email: 'wrong@example.test',
        fullName: 'Wrong WAP',
        courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm' }],
      }),
      wapUser({
        id: 'wap-only',
        email: 'wap-only@example.test',
        fullName: 'Only WAP',
        enrolledProgram: 'cybersecurity-professional-certificate-google',
      }),
    ]);

    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({
      courseraUsers: 3,
      wapUsers: 3,
      matched: 1,
      courseraOnly: 1,
      wapOnly: 1,
      wrongCourse: 1,
    });
    expect(body.rows.map((row: { status: string; email: string }) => [row.status, row.email])).toEqual([
      ['wrong-course', 'wrong@example.test'],
      ['coursera-only', 'coursera-only@example.test'],
      ['wap-only', 'wap-only@example.test'],
      ['matched', 'ada@example.test'],
    ]);
    expect(body.rows[0].detail).toContain('it-support-professional-certificate-ibm');
    expect(body.rows[0].wapUserId).toBe('wap-wrong');
    expect(body.rows[3].wapUserId).toBe('wap-1');
  });

  it('uses the requested programId and clamps limit at 1000', async () => {
    h.listAllUsers.mockResolvedValue({
      elements: Array.from({ length: 3 }, (_, i) => ({
        id: `c-${i}`,
        email: `c${i}@example.test`,
      })),
    });
    const res = await GET(request('?programId=custom-program&limit=99999') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programId).toBe('custom-program');
    expect(body.rows).toHaveLength(3);
    expect(body.summary.courseraOnly).toBe(3);
  });

  it('treats a non-positive limit as the default 200 and still returns the report', async () => {
    h.findMany.mockResolvedValue([wapUser()]);
    const res = await GET(request('?limit=-4') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.wapOnly).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it('returns 500 when the tenant WAP read throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
