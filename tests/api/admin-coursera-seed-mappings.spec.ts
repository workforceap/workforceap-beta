// @vitest-environment node
/**
 * POST /api/admin/coursera/seed-canonical-mappings-from-catalog writes the
 * global Coursera mapping table from the catalog. Unsigned is 401.
 * Actor-org throw and non-admin-in-org are 403 before the seeder. The seeder
 * is called with actorUserId only — no organizationId — pin that.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
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

vi.mock('@/lib/coursera/seedCanonicalMappingsFromCatalog', () => ({
  seedCanonicalMappingsFromCatalog: h.seed,
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

const { POST } = await import('@/app/api/admin/coursera/seed-canonical-mappings-from-catalog/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request() {
  return new Request('http://localhost/api/admin/coursera/seed-canonical-mappings-from-catalog', {
    method: 'POST',
  });
}

const summary = {
  scanned: 12,
  upsertedCreated: 4,
  upsertedUpdated: 1,
  skippedPlaceholder: 7,
  skippedNoProgram: 0,
};

describe('POST /api/admin/coursera/seed-canonical-mappings-from-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdminInOrg.mockResolvedValue(true);
    h.seed.mockResolvedValue(summary);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.seed).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 403 before the seeder when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(request() as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.seed).not.toHaveBeenCalled();
  });

  it('lets a super-admin seed without isAdminInOrg', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.seed).toHaveBeenCalledWith({ actorUserId: ADMIN_ID });
    expect(h.seed.mock.calls[0][0]).not.toHaveProperty('organizationId');
    expect(await res.json()).toEqual(summary);
  });

  it('returns the seeder summary for an org admin', async () => {
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.seed).toHaveBeenCalledWith({ actorUserId: ADMIN_ID });
    expect(await res.json()).toEqual(summary);
  });

  it('returns 500 with the seeder message when the catalog walk throws', async () => {
    h.seed.mockRejectedValue(new Error('courses table missing'));
    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'courses table missing' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
