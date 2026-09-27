import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const findMany = vi.fn();
const updateMany = vi.fn();
const release = vi.fn();
const abortRepair = vi.fn();
const complete = vi.fn();
const disableAuth = vi.fn();
const capture = vi.fn();
const audit = vi.fn();
const auditEvent = vi.fn();

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-id' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-id' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_org: string, callback: (db: unknown) => unknown) => callback({ user: {
    findFirst: (...args: unknown[]) => findFirst(...args),
    findMany: (...args: unknown[]) => findMany(...args),
    updateMany: (...args: unknown[]) => updateMany(...args),
  } }),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ synthetic: true }) }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  BILLING_LIFECYCLE_UNAVAILABLE_ERROR: 'unavailable',
  beginBillingDeletion: async () => ({ ok: true, operationId: 'owner-1', pendingAt: new Date() }),
  completeBillingDeletion: (...args: unknown[]) => complete(...args),
  releaseBillingDeletion: (...args: unknown[]) => release(...args),
  abortBillingDeletedEmailRepairBeforeAuthChange: (...args: unknown[]) => abortRepair(...args),
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({ disableAuthUserForSoftDelete: (...args: unknown[]) => disableAuth(...args) }));
vi.mock('@/lib/audit', () => ({ auditLog: (...args: unknown[]) => audit(...args) }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: vi.fn(), logAuditEvent: (...args: unknown[]) => auditEvent(...args) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: (...args: unknown[]) => capture(...args) }));

import { POST as freeOne } from '@/app/api/admin/users/[id]/free-email/route';
import { POST as freeBatch } from '@/app/api/admin/users/free-deleted-emails/route';

describe('deleted-email repair owner release', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const target = {
    id, email: 'person@example.com', deletedAt: new Date('2026-09-01T00:00:00Z'),
    profile: { role: 'member' }, userRoles: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(target);
    findMany.mockResolvedValue([target]);
    updateMany.mockResolvedValue({ count: 1 });
    disableAuth.mockResolvedValue({ ok: true });
    complete.mockResolvedValue(undefined);
    release.mockResolvedValue(undefined);
    abortRepair.mockResolvedValue(undefined);
    audit.mockResolvedValue(undefined);
    auditEvent.mockResolvedValue(undefined);
  });

  it('releases the single repair owner after thrown Auth and lost app CAS', async () => {
    disableAuth.mockRejectedValueOnce(new Error('provider timeout'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await freeOne(new Request('http://localhost'), { params: Promise.resolve({ id }) })).status).toBe(500);
    expect(release).toHaveBeenCalledWith(id, 'owner-1');

    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 0 });
    expect((await freeOne(new Request('http://localhost'), { params: Promise.resolve({ id }) })).status).toBe(409);
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
    consoleSpy.mockRestore();
  });

  it('releases the batch repair owner when Auth throws and continues the batch', async () => {
    disableAuth.mockRejectedValueOnce(new Error('provider timeout'));
    const response = await freeBatch(new Request('http://localhost/api/admin/users/free-deleted-emails'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ freed: 0, skipped: 1 });
    expect(release).toHaveBeenCalledWith(id, 'owner-1');
    expect(capture).toHaveBeenCalled();
  });
});
