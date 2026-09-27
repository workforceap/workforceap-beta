import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lockBillingLifecycle, hasUnresolvedBillingSend, billingLifecyclePending } = vi.hoisted(() => ({
  lockBillingLifecycle: vi.fn(),
  hasUnresolvedBillingSend: vi.fn(),
  billingLifecyclePending: vi.fn(),
}));

vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: lockBillingLifecycle,
  hasUnresolvedBillingSend,
  billingLifecyclePending,
}));

import { assertBillingAssignmentMutable, BillingAssignmentInProgressError } from '@/lib/counselor/billingAssignmentGuard';

describe('billing assignment lifecycle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockBillingLifecycle.mockResolvedValue(undefined);
    hasUnresolvedBillingSend.mockResolvedValue(false);
    billingLifecyclePending.mockResolvedValue(false);
  });

  it('takes the same member lifecycle lock as the send claim before reading send status', async () => {
    const tx = {} as never;
    await assertBillingAssignmentMutable(tx, 'member-1');
    expect(lockBillingLifecycle).toHaveBeenCalledWith(tx, 'member-1');
    expect(hasUnresolvedBillingSend).toHaveBeenCalledWith(tx, 'member-1');
    expect(lockBillingLifecycle.mock.invocationCallOrder[0]).toBeLessThan(hasUnresolvedBillingSend.mock.invocationCallOrder[0]);
    expect(lockBillingLifecycle.mock.invocationCallOrder[0]).toBeLessThan(billingLifecyclePending.mock.invocationCallOrder[0]);
  });

  it('blocks reassignment after deletion or identity-edit marker commits', async () => {
    billingLifecyclePending.mockResolvedValue(true);
    await expect(assertBillingAssignmentMutable({} as never, 'member-1'))
      .rejects.toBeInstanceOf(BillingAssignmentInProgressError);
    expect(hasUnresolvedBillingSend).not.toHaveBeenCalled();
  });

  it('fails closed while a claimed or ambiguous copy can still reach the provider', async () => {
    hasUnresolvedBillingSend.mockResolvedValue(true);
    await expect(assertBillingAssignmentMutable({} as never, 'member-1'))
      .rejects.toBeInstanceOf(BillingAssignmentInProgressError);
  });

  it('does not check status if the lifecycle lock failed', async () => {
    lockBillingLifecycle.mockRejectedValue(new Error('transaction unavailable'));
    await expect(assertBillingAssignmentMutable({} as never, 'member-1'))
      .rejects.toThrow('transaction unavailable');
    expect(hasUnresolvedBillingSend).not.toHaveBeenCalled();
  });

  it('keeps ordinary assignment available on migrated Preview without an advisory lock', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    try {
      await assertBillingAssignmentMutable({} as never, 'member-1');
      expect(lockBillingLifecycle).not.toHaveBeenCalled();
      expect(billingLifecyclePending).toHaveBeenCalledOnce();
      expect(hasUnresolvedBillingSend).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still rejects a persisted deletion marker on migrated Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    billingLifecyclePending.mockResolvedValue(true);
    try {
      await expect(assertBillingAssignmentMutable({} as never, 'member-1'))
        .rejects.toBeInstanceOf(BillingAssignmentInProgressError);
      expect(lockBillingLifecycle).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
