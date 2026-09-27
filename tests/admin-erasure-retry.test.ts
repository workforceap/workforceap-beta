import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const findFirst = vi.fn();
const deleteMany = vi.fn();
const release = vi.fn();
const storageDelete = vi.fn();
const authRetire = vi.fn();
const authDelete = vi.fn();
const anonymize = vi.fn();

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-id' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true, isSuperAdmin: async () => true }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-id' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findFirst: (...args: unknown[]) => findFirst(...args), deleteMany: (...args: unknown[]) => deleteMany(...args) } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_orgId: string, callback: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return callback(prisma);
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ synthetic: true }) }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  BILLING_LIFECYCLE_UNAVAILABLE_ERROR: 'unavailable',
  BILLING_SEND_IN_PROGRESS_ERROR: 'send unresolved',
  beginBillingDeletion: async () => ({ ok: true, operationId: 'owner-1', pendingAt: new Date() }),
  completeBillingDeletion: vi.fn(),
  releaseBillingDeletion: (...args: unknown[]) => release(...args),
}));
vi.mock('@/lib/gdpr/deleteUserStorage', () => ({
  ACCOUNT_STORAGE_DELETE_FAILED: 'Storage cleanup failed',
  MEMBER_FILES_BUCKET: 'files',
  MEMBER_RESUME_BUCKET: 'resumes',
  deleteUserStorageObjects: (...args: unknown[]) => storageDelete(...args),
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({
  disableAuthUserForIrreversibleErase: (...args: unknown[]) => authRetire(...args),
  deleteAuthUserForErasure: (...args: unknown[]) => authDelete(...args),
}));
vi.mock('@/lib/member/anonymizeMember', () => ({ anonymizeMember: (...args: unknown[]) => anonymize(...args) }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: vi.fn(), logAuditEvent: vi.fn() }));

import { POST } from '@/app/api/admin/members/[id]/erase/route';

describe('admin erasure retry boundary', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const user = {
    id,
    email: 'private@example.com',
    deletedAt: null,
    profile: { role: 'member', resumeOriginalPath: null, resumeEnhancedPath: null },
    userRoles: [],
    userCertifications: [],
    courseEnrollments: [],
  };
  const request = () => new Request(`http://localhost/api/admin/members/${id}/erase`, { method: 'POST', body: '{}' });
  const context = { params: Promise.resolve({ id }) };

  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(user);
    release.mockResolvedValue(undefined);
    storageDelete.mockResolvedValue({ ok: true });
    authRetire.mockResolvedValue({ ok: true, alreadyMissing: false });
    authDelete.mockResolvedValue({ ok: true, alreadyMissing: false });
    anonymize.mockResolvedValue({ userId: id });
    deleteMany.mockResolvedValue({ count: 1 });
  });

  it('releases its owner on Storage failure without touching Auth', async () => {
    storageDelete.mockResolvedValue({ ok: false, error: new Error('storage unavailable') });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
    expect(authDelete).not.toHaveBeenCalled();
    expect(authRetire).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('keeps a non-force anonymized account retryable after Auth failure', async () => {
    findFirst.mockResolvedValue({ ...user, courseEnrollments: [{ id: 'enrollment-1' }] });
    authRetire.mockResolvedValue({ ok: false, message: 'provider unavailable' });
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    expect(anonymize).toHaveBeenCalledWith(id, expect.objectContaining({ reason: 'admin_erase' }), expect.anything());
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('continues the non-force retirement path for a previously anonymized enrollment', async () => {
    findFirst.mockResolvedValue({
      ...user,
      email: `erased_${id}_1717080000000@deleted.invalid`,
      deletedAt: new Date('2026-09-01T00:00:00Z'),
      courseEnrollments: [{ id: 'enrollment-1' }],
    });
    authRetire.mockResolvedValue({ ok: false, message: 'provider unavailable' });
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    expect(authRetire).toHaveBeenCalled();
    expect(authDelete).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('maps a post-Auth foreign key hold to a safe conflict and releases the owner', async () => {
    deleteMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('subgroup leader FK', {
      code: 'P2003', clientVersion: '7.4.0', meta: { field_name: 'subgroup_leader_id_fkey' },
    }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request(), context);
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).not.toContain('subgroup_leader_id_fkey');
    expect(authDelete).toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
    consoleSpy.mockRestore();
  });
});
