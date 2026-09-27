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

import { beginBillingDeletion, beginBillingIdentityEdit } from '@/lib/billing/erasureGuard';

describe('billing deletion owner fails closed', () => {
  const memberId = '123e4567-e89b-12d3-a456-426614174000';
  const organizationId = '223e4567-e89b-12d3-a456-426614174000';
  const oldOwner = '323e4567-e89b-12d3-a456-426614174000';
  const started = new Date('2026-09-26T01:00:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-09-26T01:00:00Z'));
    queryRaw.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('never steals an old deletion token even years after its last update', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: null,
      updatedAt: started,
    });

    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'in_progress' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('does not mistake a stale identity edit or restore hold for a deletion', async () => {
    findFirst.mockResolvedValueOnce({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: oldOwner,
      billingDeletionCompletedAt: null,
      updatedAt: started,
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

  it('lets a later explicit retry claim only a released token', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: null,
      billingDeletionCompletedAt: null,
      updatedAt: started,
    });
    const result = await beginBillingDeletion(memberId, organizationId);
    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: memberId, organizationId, billingDeletionOperationId: null }),
    }));
  });

  it('reports a lost compare-and-swap instead of replacing another owner', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: started,
      billingDeletionOperationId: null,
      billingDeletionCompletedAt: null,
    });
    updateMany.mockResolvedValue({ count: 0 });
    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'raced' });
  });

  it('holds deletion behind a claimed milestone send until its receipt is settled', async () => {
    findFirst.mockResolvedValue({
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
      billingDeletionCompletedAt: null,
    });
    // Billing sends are clear; the next query sees the owned milestone claim.
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'cascade-1' }]);
    expect(await beginBillingDeletion(memberId, organizationId)).toEqual({ ok: false, reason: 'in_progress' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(queryRaw.mock.calls[2][0].join('')).toContain("dispatch_state #>> '{claimId}' IS NOT NULL");

    queryRaw.mockResolvedValue([]);
    expect((await beginBillingDeletion(memberId, organizationId)).ok).toBe(true);
  });

  it('holds recipient identity edits behind an unsettled milestone send', async () => {
    findFirst.mockResolvedValue({ id: memberId });
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'cascade-1' }]);
    expect(await beginBillingIdentityEdit(memberId, organizationId, 'member@example.invalid'))
      .toEqual({ ok: false, reason: 'in_progress' });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
