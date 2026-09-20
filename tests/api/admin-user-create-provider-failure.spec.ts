import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: vi.fn(), isSuperAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: vi.fn((fn: () => unknown) => fn()),
  withTenantScope: vi.fn((_orgId: string, fn: (db: unknown) => Promise<unknown>) => fn({ user: { findFirst: vi.fn() } })),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findFirst: vi.fn(async () => null) }, $transaction: vi.fn() },
}));
const { createAuthUser, getSupabaseAdmin, captureApiError } = vi.hoisted(() => ({
  createAuthUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  captureApiError: vi.fn(),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError }));
vi.mock('@/lib/admin/adminUserProvisioning', () => ({
  ADMIN_USER_ROLES: ['member', 'staff', 'admin', 'super_admin'],
  ensureAppUser: vi.fn(), ensureProfileRole: vi.fn(), syncManagedUserRoles: vi.fn(),
}));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('@/lib/auth/supabaseAdminUsers', () => ({ findSupabaseAuthUserByEmail: vi.fn(async () => null) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));

const { POST } = await import('@/app/api/admin/users/route');
const { getUser } = await import('@/lib/auth/server');
const { getActorOrganizationId } = await import('@/lib/tenant/organization');

const request = () => new Request('http://localhost/api/admin/users', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ fullName: 'New Admin', email: 'new.admin@example.test', role: 'admin', sendResetEmail: false }),
});

/**
 * Audit 2026-09-20: the quick-create form answered 400 "Failed to create
 * user." with no reason when the sign-in provider was unreachable.
 */
describe('POST /api/admin/users provider failure reasons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-a' } as never);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-a');
    getSupabaseAdmin.mockReturnValue({ auth: { admin: { createUser: createAuthUser } } });
  });

  it('answers 503 with a plain reason when the provider is unreachable, without echoing provider text', async () => {
    createAuthUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed: connect ECONNREFUSED 127.0.0.1:54321', status: 0 },
    });
    const response = await POST(request() as never);
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.reason).toBe('unavailable');
    expect(body.error).toMatch(/sign-in provider is unavailable right now/);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|fetch failed/);
    expect(captureApiError).toHaveBeenCalledTimes(1);
  });

  it('answers 503 when the provider client cannot even be built (missing configuration)', async () => {
    getSupabaseAdmin.mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required for admin operations');
    });
    const response = await POST(request() as never);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatch(/unavailable right now/);
    expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('answers 400 with a validation reason when the provider rejects the address', async () => {
    createAuthUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', code: 'email_address_invalid', message: 'Unable to validate email address: invalid format', status: 400 },
    });
    const response = await POST(request() as never);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.reason).toBe('validation');
    expect(body.error).toMatch(/rejected that email address/);
    expect(body.error).not.toContain('Unable to validate');
  });

  it('turns a thrown network error into 503 instead of a bare 500', async () => {
    createAuthUser.mockRejectedValue(new TypeError('fetch failed'));
    const response = await POST(request() as never);
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('unavailable');
  });
});
