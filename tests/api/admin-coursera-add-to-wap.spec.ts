// @vitest-environment node
/**
 * POST /api/admin/coursera/reconcile/add-to-wap provisions a WAP account
 * from a Coursera roster email. Unsigned is 401. Actor-org throw and
 * non-admin-in-org are 403 before the roster. Invalid program is 400.
 * Curriculum-pending is 409. Missing roster email is 400 without Auth
 * create. B4B throw is 502.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  listAllUsers: vi.fn(),
  getProgramBySlug: vi.fn(),
  isCurriculumMigrationPending: vi.fn(),
  getSupabaseAdmin: vi.fn(),
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

vi.mock('@/lib/coursera/b4bClient', () => ({
  listAllUsers: h.listAllUsers,
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: h.getProgramBySlug,
  isCurriculumMigrationPending: h.isCurriculumMigrationPending,
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'training assignment is temporarily paused',
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: h.getSupabaseAdmin,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(),
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST } = await import('@/app/api/admin/coursera/reconcile/add-to-wap/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request(body?: unknown) {
  return new Request('http://localhost/api/admin/coursera/reconcile/add-to-wap', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const validBody = {
  email: 'Ada@example.test',
  courseraExternalId: 'ext-1',
  programId: 'b4b-program',
};

describe('POST /api/admin/coursera/reconcile/add-to-wap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdminInOrg.mockResolvedValue(true);
    h.getProgramBySlug.mockReturnValue({ slug: 'help-desk' });
    h.isCurriculumMigrationPending.mockReturnValue(false);
    h.listAllUsers.mockResolvedValue({
      elements: [{ email: 'ada@example.test', externalId: 'ext-1', id: 'c-1' }],
    });
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request(validBody) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(request(validBody) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 before the roster when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await POST(request(validBody) as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('lets a super-admin skip isAdminInOrg', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.isAdminInOrg.mockResolvedValue(false);
    h.listAllUsers.mockResolvedValue({ elements: [] });
    const res = await POST(request(validBody) as never);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('not in the Coursera roster');
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 400 when the email is missing', async () => {
    const res = await POST(request({ courseraExternalId: 'ext-1', programId: 'p' }) as never);
    expect(res.status).toBe(400);
    expect(h.listAllUsers).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid program when programSlug is unknown', async () => {
    h.getProgramBySlug.mockReturnValue(null);
    const res = await POST(request({ ...validBody, programSlug: 'not-a-program' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid program' });
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 409 curriculum-pending before the roster when assignment is paused', async () => {
    h.isCurriculumMigrationPending.mockReturnValue(true);
    const res = await POST(request({ ...validBody, programSlug: 'help-desk' }) as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'training assignment is temporarily paused',
      code: 'CURRICULUM_MIGRATION_PENDING',
    });
    expect(h.listAllUsers).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 502 when the Coursera roster throws, without creating Auth', async () => {
    h.listAllUsers.mockRejectedValue(new Error('b4b down'));
    const res = await POST(request(validBody) as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Coursera roster fetch failed: b4b down' });
    expect(h.captureApiError).toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 400 without Auth create when the email is not on the roster', async () => {
    h.listAllUsers.mockResolvedValue({
      elements: [{ email: 'someone-else@example.test', externalId: 'ext-9' }],
    });
    const res = await POST(request(validBody) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('not in the Coursera roster');
    expect(h.listAllUsers).toHaveBeenCalledWith({ pageLimit: 1000 });
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
