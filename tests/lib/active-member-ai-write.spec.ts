import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), pending: vi.fn(), interactive: vi.fn(), write: vi.fn(),
}));

const tx = { user: {}, aIToolResult: {} };
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: mocks.interactive }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: mocks.lock, billingLifecyclePending: mocks.pending,
}));

import { withActiveMemberAIWrite } from '@/lib/ai/activeMemberWrite';

const ID = '10000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.interactive.mockReturnValue(true);
  mocks.lock.mockResolvedValue(undefined);
  mocks.pending.mockResolvedValue(false);
  mocks.write.mockResolvedValue('saved');
});

describe('AI member write barrier', () => {
  it('serializes active writes with deletion of the same member', async () => {
    expect(await withActiveMemberAIWrite(ID, mocks.write)).toBe('saved');
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.pending).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(tx);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.pending.mock.invocationCallOrder[0]);
    expect(mocks.pending.mock.invocationCallOrder[0]).toBeLessThan(mocks.write.mock.invocationCallOrder[0]);
  });

  it('rejects after a deletion marker wins the lock', async () => {
    let releaseDeletion: (() => void) | undefined;
    const deletionOwnsLock = new Promise<void>((resolve) => { releaseDeletion = resolve; });
    mocks.lock.mockImplementationOnce(async () => deletionOwnsLock);
    mocks.pending.mockImplementation(async () => true);

    const staleWrite = withActiveMemberAIWrite(ID, mocks.write);
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    expect(mocks.pending).not.toHaveBeenCalled();
    releaseDeletion?.();

    await expect(staleWrite).rejects.toThrow('This account is no longer active.');
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('uses the persisted state check without an advisory lock on flattened Preview', async () => {
    mocks.interactive.mockReturnValue(false);
    mocks.pending.mockResolvedValue(true);
    await expect(withActiveMemberAIWrite(ID, mocks.write))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
