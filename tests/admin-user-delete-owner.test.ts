import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findFirst = vi.fn();
const updateMany = vi.fn();
const release = vi.fn();
const complete = vi.fn();
const disableAuth = vi.fn();
const audit = vi.fn();
const auditEvent = vi.fn();

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-id' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true, isSuperAdmin: async () => true }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-id' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findFirst: (...args: unknown[]) => findFirst(...args), updateMany: (...args: unknown[]) => updateMany(...args) } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_org: string, callback: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return callback(prisma);
  },
  crossTenantOK: async (callback: () => unknown) => callback(),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ synthetic: true }) }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  BILLING_LIFECYCLE_UNAVAILABLE_ERROR: 'unavailable',
  BILLING_SEND_IN_PROGRESS_ERROR: 'send unresolved',
  beginBillingDeletion: async () => ({ ok: true, operationId: 'owner-1', pendingAt: new Date() }),
  beginBillingIdentityEdit: vi.fn(),
  completeBillingDeletion: (...args: unknown[]) => complete(...args),
  endBillingIdentityEdit: vi.fn(),
  releaseBillingDeletion: (...args: unknown[]) => release(...args),
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({ disableAuthUserForSoftDelete: (...args: unknown[]) => disableAuth(...args) }));
vi.mock('@/lib/audit', () => ({ auditLog: (...args: unknown[]) => audit(...args) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: (...args: unknown[]) => auditEvent(...args) }));

import { DELETE } from '@/app/api/admin/users/[id]/route';

describe('super-admin DELETE owns the exact member version', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const deletedAt = new Date('2026-09-01T00:00:00Z');
  const target = { id, email: `deleted_${id}_1717080000000_person@example.com@deleted.invalid`, deletedAt };
  const request = () => new NextRequest(`http://localhost/api/admin/users/${id}`, { method: 'DELETE' });
  const context = { params: Promise.resolve({ id }) };

  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(target);
    updateMany.mockResolvedValue({ count: 1 });
    disableAuth.mockResolvedValue({ ok: true, alreadyMissing: false });
    complete.mockResolvedValue(undefined);
    release.mockResolvedValue(undefined);
    audit.mockResolvedValue(undefined);
    auditEvent.mockResolvedValue(undefined);
  });

  it('preserves the original deletedAt and compare-and-sets by owner', async () => {
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id, billingDeletionOperationId: 'owner-1' },
    }));
    expect(updateMany).toHaveBeenCalledWith({
      where: { id, email: target.email, deletedAt, billingDeletionOperationId: 'owner-1' },
      data: { deletedAt, email: target.email },
    });
    expect(complete).toHaveBeenCalledWith(id, 'owner-1');
    expect(release).not.toHaveBeenCalled();
  });

  it('refuses a changed row after ownership and releases only that owner', async () => {
    findFirst.mockResolvedValueOnce(target).mockResolvedValueOnce({ ...target, email: 'changed@example.com' });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
    expect(disableAuth).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
  });

  it('never turns an irreversible admin erase into a restorable soft delete', async () => {
    findFirst.mockResolvedValue({ ...target, email: `erased_${id}_1717080000000@deleted.invalid` });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
    expect(disableAuth).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
  });

  it('releases the owner after an Auth failure or lost database CAS', async () => {
    disableAuth.mockResolvedValueOnce({ ok: false, message: 'provider unavailable' });
    expect((await DELETE(request(), context)).status).toBe(502);
    expect(release).toHaveBeenCalledWith(id, 'owner-1');

    vi.clearAllMocks();
    findFirst.mockResolvedValue(target);
    updateMany.mockResolvedValue({ count: 0 });
    release.mockResolvedValue(undefined);
    expect((await DELETE(request(), context)).status).toBe(409);
    expect(disableAuth).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
  });
});
