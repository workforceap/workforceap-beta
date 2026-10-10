// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ globalUpdate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { updateMany: mocks.globalUpdate } } }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));

import { TenantScopeViolation, withTenantScope } from '@/lib/tenant/withTenantScope';

type ScopedClient = NonNullable<Parameters<typeof withTenantScope>[2]>;
function transactionClient() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return { updateMany, client: { user: { updateMany } } as unknown as ScopedClient };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.globalUpdate.mockResolvedValue({ count: 1 });
});

describe('withTenantScope transaction ownership', () => {
  it('retains the default application client for existing callers', async () => {
    await withTenantScope('org-a', (db) => db.user.updateMany({ where: { id: 'member' }, data: { deletedAt: null } }));
    expect(mocks.globalUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'member', organizationId: 'org-a' }, data: { deletedAt: null },
    });
  });

  it('scopes the supplied transaction without losing its compare-and-set predicates', async () => {
    const { client, updateMany } = transactionClient();
    const deletedAt = new Date('2026-09-01T00:00:00Z');
    const result = await withTenantScope('org-a', (db) => db.user.updateMany({
      where: { id: 'member', email: 'retired@example.test', deletedAt },
      data: { deletedAt: null, email: 'restored@example.test' },
    }), client);
    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'member', email: 'retired@example.test', deletedAt, organizationId: 'org-a' },
      data: { deletedAt: null, email: 'restored@example.test' },
    });
    expect(mocks.globalUpdate).not.toHaveBeenCalled();
  });

  it.each(['where', 'data'] as const)('rejects a foreign tenant in %s before touching either client', async (field) => {
    const { client, updateMany } = transactionClient();
    await expect(withTenantScope('org-a', (db) => db.user.updateMany({
      where: { id: 'member', ...(field === 'where' ? { organizationId: 'org-b' } : {}) },
      data: { deletedAt: null, ...(field === 'data' ? { organizationId: 'org-b' } : {}) },
    }), client)).rejects.toBeInstanceOf(TenantScopeViolation);
    expect(updateMany).not.toHaveBeenCalled();
    expect(mocks.globalUpdate).not.toHaveBeenCalled();
  });

  it('propagates transaction failures without retrying outside the transaction', async () => {
    const { client, updateMany } = transactionClient();
    const failure = new Error('synthetic transaction aborted');
    updateMany.mockRejectedValue(failure);
    await expect(withTenantScope('org-a', (db) => db.user.updateMany({
      where: { id: 'member' }, data: { deletedAt: null },
    }), client)).rejects.toBe(failure);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(mocks.globalUpdate).not.toHaveBeenCalled();
  });

  it('still rejects an empty tenant before executing the transaction callback', async () => {
    const { client, updateMany } = transactionClient();
    const callback = vi.fn();
    await expect(withTenantScope(' ', callback, client)).rejects.toThrow('orgId required');
    expect(callback).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
