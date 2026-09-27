import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const updateMany = vi.fn();
const queryRaw = vi.fn();

vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/tenant/scopeProxy', () => ({ makeScopedProxy: (_organizationId: string, tx: unknown) => tx }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    user: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  };
  return { prisma: { ...tx, $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) } };
});

import { beginBillingDeletion, BILLING_DELETION_TAKEOVER_AFTER_MS } from '@/lib/billing/erasureGuard';

describe('abandoned billing deletion recovery', () => {
  const memberId = '123e4567-e89b-12d3-a456-426614174000';
  const organizationId = '223e4567-e89b-12d3-a456-426614174000';
  const oldOwner = '323e4567-e89b-12d3-a456-426614174000';
  const started = new Date('2026-09-26T01:00:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(started.getTime() + BILLING_DELETION_TAKEOVER_AFTER_MS + 1000));
    queryRaw.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('fences an abandoned owner after post-Auth completion failed, then retries under a new token', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: null,
      updatedAt: started,
    });

    const result = await beginBillingDeletion(memberId, organizationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operationId).not.toBe(oldOwner);
    expect(result.pendingAt).toEqual(started);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: memberId,
        organizationId,
        billingDeletionOperationId: oldOwner,
        billingDeletionPendingAt: started,
        updatedAt: started,
      }),
    }));
  });

  it('does not take over an active owner or a restore owner', async () => {
    findFirst.mockResolvedValueOnce({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: null,
      updatedAt: new Date(),
    }).mockResolvedValueOnce({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: started,
      updatedAt: started,
    });

    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'in_progress' });
    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'in_progress' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reports a lost compare-and-swap rather than stealing a newer owner', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: null,
      updatedAt: started,
    });
    updateMany.mockResolvedValue({ count: 0 });
    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'raced' });
  });
});
