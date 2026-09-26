import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lockBillingLifecycle, hasUnresolvedBillingSend } = vi.hoisted(() => ({
  lockBillingLifecycle: vi.fn(),
  hasUnresolvedBillingSend: vi.fn(),
}));

vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: lockBillingLifecycle,
  hasUnresolvedBillingSend,
}));

import { assertBillingAssignmentMutable, BillingAssignmentInProgressError } from '@/lib/counselor/billingAssignmentGuard';

describe('billing assignment lifecycle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockBillingLifecycle.mockResolvedValue(undefined);
    hasUnresolvedBillingSend.mockResolvedValue(false);
  });

  it('takes the same member lifecycle lock as the send claim before reading send status', async () => {
    const tx = {} as never;
    await assertBillingAssignmentMutable(tx, 'member-1');
    expect(lockBillingLifecycle).toHaveBeenCalledWith(tx, 'member-1');
    expect(hasUnresolvedBillingSend).toHaveBeenCalledWith(tx, 'member-1');
    expect(lockBillingLifecycle.mock.invocationCallOrder[0]).toBeLessThan(hasUnresolvedBillingSend.mock.invocationCallOrder[0]);
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
});
