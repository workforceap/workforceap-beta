import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 2 })));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    milestoneCascade: { updateMany },
  },
}));

import { AUTO_EXPIRED_REASON_PREFIX, expireStaleCascades } from '@/lib/milestoneCascade/expireStaleCascades';

describe('expireStaleCascades', () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 2 });
  });

  it('expires only awaiting_approval rows whose TTL has already elapsed', async () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    await expect(expireStaleCascades({ now })).resolves.toEqual({ expired: 2 });

    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: 'awaiting_approval',
        expiresAt: { lt: now },
      },
      data: {
        status: 'expired',
        dismissedAt: now,
        dismissedReason: `${AUTO_EXPIRED_REASON_PREFIX}TTL elapsed without counselor action`,
      },
    });
  });

  it('returns a zero count without inventing a different status filter', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(expireStaleCascades({ now: new Date('2026-10-31T00:00:00.000Z') })).resolves.toEqual({
      expired: 0,
    });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'awaiting_approval' }),
    }));
  });
});
