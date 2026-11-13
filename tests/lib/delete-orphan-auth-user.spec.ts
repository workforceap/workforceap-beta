import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique } },
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: async <T>(fn: () => Promise<T>) => fn(),
}));

import { deleteOrphanAuthUserAfterFailedProvision } from '@/lib/admin/deleteOrphanAuthUser';

const id = '10000000-0000-4000-8000-000000000001';
const deleteUser = vi.fn();
const admin = { auth: { admin: { deleteUser } } } as unknown as Parameters<
  typeof deleteOrphanAuthUserAfterFailedProvision
>[0];

describe('deleteOrphanAuthUserAfterFailedProvision', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deleteUser.mockResolvedValue({ data: {}, error: null });
  });

  it('does not delete Auth when an app User row already claims the id', async () => {
    findUnique.mockResolvedValueOnce({ id });
    expect(await deleteOrphanAuthUserAfterFailedProvision(admin, id)).toBe(false);
    expect(findUnique).toHaveBeenCalledWith({ where: { id }, select: { id: true } });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes Auth only when no app User row exists', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await deleteOrphanAuthUserAfterFailedProvision(admin, id)).toBe(true);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('keeps Auth when the app-row lookup fails', async () => {
    findUnique.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await deleteOrphanAuthUserAfterFailedProvision(admin, id)).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('reports a failed Auth delete without throwing', async () => {
    findUnique.mockResolvedValueOnce(null);
    deleteUser.mockResolvedValueOnce({ data: null, error: { message: 'Auth unavailable' } });
    expect(await deleteOrphanAuthUserAfterFailedProvision(admin, id)).toBe(false);
  });
});
