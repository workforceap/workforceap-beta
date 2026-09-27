import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), pending: vi.fn(), interactive: vi.fn(), write: vi.fn(),
}));
const tx = { user: {}, profile: {} };
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: mocks.interactive }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: mocks.lock, billingLifecyclePending: mocks.pending,
}));

import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

const ID = '10000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.interactive.mockReturnValue(true);
  mocks.lock.mockResolvedValue(undefined);
  mocks.pending.mockResolvedValue(false);
  mocks.write.mockResolvedValue('saved');
});

describe('member PII write barrier', () => {
  it('locks and rechecks persisted state before writing', async () => {
    expect(await withActiveMemberWrite(ID, mocks.write)).toBe('saved');
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.pending).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(tx);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.pending.mock.invocationCallOrder[0]);
    expect(mocks.pending.mock.invocationCallOrder[0]).toBeLessThan(mocks.write.mock.invocationCallOrder[0]);
  });

  it('refuses a stale write after erasure wins the lock', async () => {
    let finishErasure: (() => void) | undefined;
    const erasure = new Promise<void>((resolve) => { finishErasure = resolve; });
    mocks.lock.mockImplementationOnce(async () => erasure);
    mocks.pending.mockResolvedValue(true);
    const staleWrite = withActiveMemberWrite(ID, mocks.write);
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    finishErasure?.();
    await expect(staleWrite).rejects.toBeInstanceOf(MemberLifecycleWriteError);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('checks the persisted marker on flattened Preview transactions', async () => {
    mocks.interactive.mockReturnValue(false);
    mocks.pending.mockResolvedValue(true);
    await expect(withActiveMemberWrite(ID, mocks.write)).rejects.toBeInstanceOf(MemberLifecycleWriteError);
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
