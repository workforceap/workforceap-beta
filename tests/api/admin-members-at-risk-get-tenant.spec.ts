// @vitest-environment node
/**
 * GET /api/admin/members/at-risk lists saved risk scores and member PII.
 * Auth must run before the shared reader. Org admins pass organizationId;
 * super-admins pass `{ platform: true }` with no org filter (pinned). A
 * reader throw currently echoes `details` in the 500 body (pinned, not
 * stripped in a coverage run).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAdminOrCounselor: vi.fn(),
  isSuperAdmin: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  loadPersisted: vi.fn(),
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

vi.mock('@/lib/auth/roles', () => ({
  requireAdminOrCounselor: h.requireAdminOrCounselor,
  isSuperAdmin: h.isSuperAdmin,
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/member/persistedAtRisk', () => ({
  loadPersistedAtRiskMembers: h.loadPersisted,
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

const { GET } = await import('@/app/api/admin/members/at-risk/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getRequest(query = '') {
  return new Request(`http://localhost/api/admin/members/at-risk${query}`);
}

describe('GET /api/admin/members/at-risk tenant and auth gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireAdminOrCounselor.mockResolvedValue({ ok: true, userId: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.loadPersisted.mockResolvedValue({ total: 0, rows: [] });
  });

  it('returns 401 before the shared reader when unsigned', async () => {
    h.requireAdminOrCounselor.mockResolvedValue({
      ok: false,
      error: 'Unauthorized',
      status: 401,
    });
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.loadPersisted).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is neither admin nor counselor', async () => {
    h.requireAdminOrCounselor.mockResolvedValue({
      ok: false,
      error: 'Forbidden: admin or counselor access required',
      status: 403,
    });
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Forbidden: admin or counselor access required',
    });
    expect(h.loadPersisted).not.toHaveBeenCalled();
  });

  it('loads saved cases for the actor org', async () => {
    const res = await GET(getRequest('?threshold=0&limit=20') as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.loadPersisted).toHaveBeenCalledWith(
      { organizationId: ORG_ID },
      { threshold: 0, status: undefined, limit: 20 },
    );
  });

  it('omits the org filter for a super-admin and passes platform: true (pinned)', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.loadPersisted).toHaveBeenCalledWith(
      { platform: true },
      { threshold: 50, status: undefined, limit: 20 },
    );
  });

  it('echoes reader error details on 500 (pinned, not stripped)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.loadPersisted.mockRejectedValue(new Error('cross-tenant scan failed'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Failed to fetch at-risk members',
      details: 'cross-tenant scan failed',
    });
    spy.mockRestore();
  });
});
