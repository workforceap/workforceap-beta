import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  target: vi.fn(),
  updateMany: vi.fn(),
  findProfile: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
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
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

const { tenantUserFindFirst, globalUserFindFirst } = vi.hoisted(() => ({
  tenantUserFindFirst: vi.fn(),
  globalUserFindFirst: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: vi.fn((fn: () => unknown) => fn()),
  withTenantScope: vi.fn((_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({
      user: {
        findFirst: (...args: unknown[]) => {
          const where = (args[0] as { where?: { id?: string } } | undefined)?.where;
          return where?.id === 'own-uuid'
            ? tenantUserFindFirst(...args)
            : routeMocks.target(...args);
        },
      },
    }),
  ),
}));

vi.mock('@/lib/admin/adminUserProvisioning', () => ({
  ADMIN_USER_ROLES: ['member', 'staff', 'admin', 'super_admin'],
  ensureProfileRole: vi.fn(),
  syncManagedUserRoles: vi.fn(),
}));

const updateUserById = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById,
        deleteUser: vi.fn(),
      },
    },
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findFirst: globalUserFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: { updateMany: routeMocks.updateMany },
        profile: { findFirst: routeMocks.findProfile },
      }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: routeMocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: routeMocks.event }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  beginBillingDeletion: vi.fn(), completeBillingDeletion: vi.fn(), releaseBillingDeletion: vi.fn(),
  beginBillingIdentityEdit: vi.fn(), endBillingIdentityEdit: vi.fn(),
  BILLING_SEND_IN_PROGRESS_ERROR: 'Billing delivery unresolved',
}));

import { PATCH } from '@/app/api/admin/users/[id]/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { beginBillingIdentityEdit, endBillingIdentityEdit } from '@/lib/billing/erasureGuard';

function patchReq(body: Record<string, unknown>, targetId = 'user-1') {
  return new Request(`http://localhost:3000/api/admin/users/${targetId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type PrivilegedTargetCase = {
  name: string;
  profile: { role: string } | null;
  userRoles: readonly { role: { name: string } }[];
  self?: boolean;
};

const privilegedTargets = [
  { name: 'profile only', profile: { role: 'super_admin' }, userRoles: [] },
  { name: 'UserRole grant only', profile: null, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'both stores privileged', profile: { role: 'super_admin' }, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'stale privileged profile with ordinary grant', profile: { role: 'super_admin' }, userRoles: [{ role: { name: 'member' } }] },
  { name: 'stale ordinary profile with privileged grant', profile: { role: 'member' }, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'privileged self', profile: { role: 'super_admin' }, userRoles: [], self: true },
] satisfies readonly PrivilegedTargetCase[];

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
    routeMocks.target.mockResolvedValue({
      id: 'user-1',
      email: 'old@example.com',
      profile: { role: 'member' },
      userRoles: [],
    });
    routeMocks.updateMany.mockResolvedValue({ count: 1 });
    routeMocks.findProfile.mockResolvedValue({ role: 'member' });
    routeMocks.audit.mockResolvedValue(undefined);
    routeMocks.event.mockResolvedValue(undefined);
    vi.mocked(updateUserById).mockResolvedValue({ error: null });
    globalUserFindFirst.mockResolvedValue(null);
    tenantUserFindFirst.mockResolvedValue({ id: 'user-1', email: 'old@example.com' });
    vi.mocked(beginBillingIdentityEdit).mockResolvedValue({ ok: true, pendingAt: new Date(), operationId: 'edit-1' });
  });

  it('hides a foreign-tenant email collision before changing Supabase auth', async () => {
    globalUserFindFirst.mockResolvedValue({ id: 'foreign-uuid', organizationId: 'org-2' });

    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com', role: 'member' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );
    const text = await res.text();

    expect(res.status).toBe(409);
    expect(JSON.parse(text)).toEqual({ error: 'That email already has an account.' });
    for (const secret of ['foreign-uuid', 'Foreign Name', 'new@example.com', 'admin']) {
      expect(text).not.toContain(secret);
    }
    expect(updateUserById).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an own-tenant collision projection before changing Supabase auth', async () => {
    globalUserFindFirst.mockResolvedValue({ id: 'own-uuid', organizationId: 'org-1' });
    tenantUserFindFirst.mockResolvedValue({
      id: 'own-uuid', fullName: 'Own Name', email: 'new@example.com', profile: { role: 'member' },
    });

    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com', role: 'member' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'That email already has an account. Use the edit or reset tools on the existing user.',
      user: { id: 'own-uuid', fullName: 'Own Name', email: 'new@example.com', role: 'member' },
    });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(privilegedTargets)('denies ordinary admin full-name-only mutation for privileged target: $name', async ({ self, ...roles }) => {
    const targetId = self ? 'admin-1' : 'user-1';
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    routeMocks.target.mockResolvedValue({ id: targetId, email: 'old@example.com', ...roles });

    const res = await PATCH(
      patchReq({ fullName: 'Changed Privileged Name', email: 'old@example.com' }, targetId),
      { params: Promise.resolve({ id: targetId }) },
    );

    expect(res.status).toBe(403);
    expect(routeMocks.target).toHaveBeenCalledWith({
      where: { id: targetId },
      select: expect.objectContaining({
        profile: { select: { role: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      }),
    });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(routeMocks.updateMany).not.toHaveBeenCalled();
    expect(routeMocks.audit).not.toHaveBeenCalled();
    expect(routeMocks.event).not.toHaveBeenCalled();
  });

  it('preserves ordinary same-tenant member administration with role omitted', async () => {
    vi.mocked(isSuperAdmin).mockResolvedValue(false);

    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(vi.mocked(beginBillingIdentityEdit).mock.invocationCallOrder[0]).toBeLessThan(updateUserById.mock.invocationCallOrder[0]);
    expect(endBillingIdentityEdit).toHaveBeenCalledWith('user-1', 'edit-1');
  });

  it('blocks an email or role edit before Auth when a signed copy is unresolved', async () => {
    vi.mocked(beginBillingIdentityEdit).mockResolvedValueOnce({ ok: false, reason: 'unresolved_send' });
    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com', role: 'member' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('billing_send_unresolved');
    expect(updateUserById).not.toHaveBeenCalled();
    expect(routeMocks.updateMany).not.toHaveBeenCalled();
  });

  it('preserves explicit super-admin authority over a privileged target', async () => {
    routeMocks.target.mockResolvedValue({
      id: 'user-1', email: 'old@example.com',
      profile: { role: 'super_admin' }, userRoles: [],
    });

    const res = await PATCH(
      patchReq({ fullName: 'Privileged User', email: 'new@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledOnce();
  });

  it('does not touch Auth when the tenant-scoped target is absent', async () => {
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    routeMocks.target.mockResolvedValue(null);

    const res = await PATCH(
      patchReq({ fullName: 'Other Tenant', email: 'other@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(res.status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls Supabase email back when the database transaction fails after auth update', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('db failed'));

    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com', role: 'member' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );

    expect(res.status).toBe(500);
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(updateUserById).toHaveBeenNthCalledWith(1, 'user-1', {
      email: 'new@example.com',
      email_confirm: true,
    });
    expect(updateUserById).toHaveBeenNthCalledWith(2, 'user-1', {
      email: 'old@example.com',
      email_confirm: true,
    });
    expect(endBillingIdentityEdit).toHaveBeenCalledWith('user-1', 'edit-1');
  });

  it('keeps the billing hold if Auth rollback fails after a DB error', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('db failed'));
    updateUserById.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'rollback failed' } });
    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).reconciliationRequired).toBe(true);
    expect(endBillingIdentityEdit).not.toHaveBeenCalled();
  });

  it('keeps the billing hold when the Auth email result is unknown', async () => {
    updateUserById.mockRejectedValueOnce(new Error('network timeout'));
    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );
    expect(res.status).toBe(503);
    expect((await res.json()).reconciliationRequired).toBe(true);
    expect(routeMocks.updateMany).not.toHaveBeenCalled();
    expect(endBillingIdentityEdit).not.toHaveBeenCalled();
  });

  it('keeps the billing hold if DB changed but releasing it fails', async () => {
    vi.mocked(endBillingIdentityEdit).mockRejectedValueOnce(new Error('db disconnected'));
    const res = await PATCH(
      patchReq({ fullName: 'User One', email: 'new@example.com' }),
      { params: Promise.resolve({ id: 'user-1' }) },
    );
    expect(res.status).toBe(503);
    expect((await res.json()).reconciliationRequired).toBe(true);
    expect(updateUserById).toHaveBeenCalledTimes(1);
  });
});
