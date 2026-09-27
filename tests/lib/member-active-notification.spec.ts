import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (read: () => unknown) => read() }));

import { activeMemberNotificationTarget } from '@/lib/member/activeNotification';

const active = {
  email: 'member@example.test', fullName: 'Member', deletedAt: null,
  billingDeletionPendingAt: null, billingDeletionOperationId: null,
};

describe('member-triggered notification recipient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(active);
  });

  it('uses the fresh active app identity instead of an earlier Auth snapshot', async () => {
    expect(await activeMemberNotificationTarget('member-1')).toEqual({
      email: 'member@example.test', fullName: 'Member',
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      select: {
        email: true, fullName: true, deletedAt: true,
        billingDeletionPendingAt: true, billingDeletionOperationId: true,
      },
    });
  });

  it.each([
    ['missing', null],
    ['soft-deleted', { ...active, deletedAt: new Date('2026-09-26') }],
    ['pending', { ...active, billingDeletionPendingAt: new Date('2026-09-26') }],
    ['owned', { ...active, billingDeletionOperationId: 'erase-1' }],
  ])('skips delivery for a %s account', async (_name, row) => {
    mocks.findUnique.mockResolvedValueOnce(row);
    expect(await activeMemberNotificationTarget('member-1')).toBeNull();
  });

  it('fails closed when the fresh account lookup fails', async () => {
    mocks.findUnique.mockRejectedValueOnce(new Error('DB unavailable'));
    expect(await activeMemberNotificationTarget('member-1')).toBeNull();
  });
});
