// @vitest-environment node
/**
 * POST /api/admin/coursera/seed-canonical-mappings-from-b4b walks the live
 * B4B directory into the global mapping table. Unsigned is 401. Actor-org
 * throw and non-admin-in-org are 403 before load/seed. The seeder is called
 * with actorUserId + contents only — no organizationId — pin that.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  loadB4BContents: vi.fn(),
  seed: vi.fn(),
  captureApiError: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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

vi.mock('@/lib/coursera/programContentsCache', () => ({
  loadB4BContents: h.loadB4BContents,
}));

vi.mock('@/lib/coursera/seedCanonicalMappingsFromB4B', () => ({
  seedCanonicalMappingsFromB4B: h.seed,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST } = await import('@/app/api/admin/coursera/seed-canonical-mappings-from-b4b/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request() {
  return new Request('http://localhost/api/admin/coursera/seed-canonical-mappings-from-b4b', {
    method: 'POST',
  });
}

const contents = [{ id: 'course-1', name: 'Help Desk 101' }];
const summary = {
  contentsScanned: 1,
  coursesScanned: 1,
  coursesMatched: 1,
  coursesUnmatched: 0,
  totalCreated: 1,
  totalUpdated: 0,
  totalConflicts: 0,
  perCourse: [],
};

describe('POST /api/admin/coursera/seed-canonical-mappings-from-b4b', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdminInOrg.mockResolvedValue(true);
    h.loadB4BContents.mockResolvedValue(contents);
    h.seed.mockResolvedValue(summary);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.loadB4BContents).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.loadB4BContents).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 403 before B4B load when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(request() as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.loadB4BContents).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
  });

  it('lets a super-admin seed without isAdminInOrg and without passing org to the seeder', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.loadB4BContents).toHaveBeenCalledTimes(1);
    expect(h.seed).toHaveBeenCalledWith({ actorUserId: ADMIN_ID, contents });
    expect(h.seed.mock.calls[0][0]).not.toHaveProperty('organizationId');
    expect(await res.json()).toEqual(summary);
  });

  it('returns the seeder summary for an org admin', async () => {
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.seed).toHaveBeenCalledWith({ actorUserId: ADMIN_ID, contents });
    expect(await res.json()).toEqual(summary);
  });

  it('returns 500 with the seeder message when the B4B walk throws', async () => {
    h.seed.mockRejectedValue(new Error('contents cache empty'));
    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'contents cache empty' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
