import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lockBillingLifecycle, hasUnresolvedBillingSend } = vi.hoisted(() => ({
  lockBillingLifecycle: vi.fn(),
  hasUnresolvedBillingSend: vi.fn(),
}));

vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: lockBillingLifecycle,
  hasUnresolvedBillingSend,
}));

import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { BillingAssignmentInProgressError } from '@/lib/counselor/billingAssignmentGuard';

function transaction() {
  const tx = {
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    counselor: { findFirst: vi.fn().mockResolvedValue({ id: 'counselor-1', userId: 'staff-1' }) },
    counselorAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'assignment-1' }),
    },
    messageThread: { upsert: vi.fn().mockResolvedValue({ id: 'thread-1' }) },
  };
  return tx;
}

describe('counselor handoff while billing is in flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockBillingLifecycle.mockResolvedValue(undefined);
    hasUnresolvedBillingSend.mockResolvedValue(false);
  });

  it('checks under the lifecycle lock before the first member row write', async () => {
    const tx = transaction();
    await assignMemberCounselor(tx as never, {
      memberId: 'member-1', organizationId: 'org-1', counselorUserId: 'staff-1',
    });
    expect(lockBillingLifecycle.mock.invocationCallOrder[0]).toBeLessThan(tx.user.updateMany.mock.invocationCallOrder[0]);
    expect(hasUnresolvedBillingSend.mock.invocationCallOrder[0]).toBeLessThan(tx.user.updateMany.mock.invocationCallOrder[0]);
    expect(tx.counselorAssignment.create).toHaveBeenCalledOnce();
  });

  it('keeps the original counselor when a claimed copy is unresolved', async () => {
    const tx = transaction();
    hasUnresolvedBillingSend.mockResolvedValue(true);
    await expect(assignMemberCounselor(tx as never, {
      memberId: 'member-1', organizationId: 'org-1', counselorUserId: 'staff-1',
    })).rejects.toBeInstanceOf(BillingAssignmentInProgressError);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.counselorAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.counselorAssignment.create).not.toHaveBeenCalled();
    expect(tx.messageThread.upsert).not.toHaveBeenCalled();
  });
});
