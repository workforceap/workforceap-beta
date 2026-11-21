// @vitest-environment node
/**
 * POST /api/admin/members/[id]/reset-password emails a credential reset.
 * Super-admin is required, then the lookup still goes through
 * withTenantScope(actor org): an Org A super-admin cannot reset an Org B
 * member by UUID. The success JSON currently includes the member email
 * (pinned, not redacted in a coverage run).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findFirst: vi.fn(),
  sendReset: vi.fn(),
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

vi.mock('@/lib/auth/passwordReset', () => ({
  sendPasswordResetEmail: h.sendReset,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST } = await import('@/app/api/admin/members/[id]/reset-password/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-446655440004';

const params = { params: Promise.resolve({ id: MEMBER_ID }) };
const foreignParams = { params: Promise.resolve({ id: FOREIGN_ID }) };

function post(id = MEMBER_ID) {
  return new Request(`http://localhost/api/admin/members/${id}/reset-password`, {
    method: 'POST',
  });
}

describe('POST /api/admin/members/[id]/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ email: 'ada@org.test', fullName: 'Ada Member' });
    h.sendReset.mockResolvedValue({ error: null, via: 'resend' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(post() as never, params);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.sendReset).not.toHaveBeenCalled();
  });

  it('returns 403 without a send when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await POST(post() as never, params);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden — super admin only' });
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.sendReset).not.toHaveBeenCalled();
  });

  it('returns 404 without a send when the member is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await POST(post(FOREIGN_ID) as never, foreignParams);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID },
      select: { email: true, fullName: true },
    });
    expect(h.sendReset).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('sends the reset for a same-org member and includes the email in the success JSON (pinned)', async () => {
    const res = await POST(post() as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: 'Password reset email sent to ada@org.test',
    });
    expect(h.sendReset).toHaveBeenCalledWith('ada@org.test', '/reset-password', { orgId: ORG_ID });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_member_reset_password',
        targetId: MEMBER_ID,
        metadata: { orgId: ORG_ID },
      }),
    );
  });

  it('answers 500 with a generic error when the provider refuses, without echoing the email', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.sendReset.mockResolvedValue({ error: { message: 'user_not_found' }, via: 'supabase' });
    const res = await POST(post() as never, params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Unable to send the password reset email. Please try again in a few minutes.',
    });
    expect(JSON.stringify(body)).not.toContain('ada@org.test');
    expect(h.auditLog).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await POST(post() as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.sendReset).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
