import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createNotification } = vi.hoisted(() => ({
  createNotification: vi.fn(),
}));

vi.mock('@/lib/notifications/create', () => ({ createNotification }));

import { notifyCounselorOfStaffAssignment } from '@/lib/counselor/staffAssignmentNotify';

const member = {
  memberId: 'member-1',
  memberName: 'Ada Member',
  previousCounselorUserId: 'counselor-old',
};

describe('notifyCounselorOfStaffAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue(undefined);
  });

  it('does not notify on an unassign', async () => {
    await notifyCounselorOfStaffAssignment({
      counselorUserId: null,
      actorUserId: 'admin-1',
      members: [member],
      logPrefix: '[test]',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not notify a counselor acting on their own caseload', async () => {
    await notifyCounselorOfStaffAssignment({
      counselorUserId: 'counselor-1',
      actorUserId: 'counselor-1',
      members: [member],
      logPrefix: '[test]',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips members who already had this counselor', async () => {
    await notifyCounselorOfStaffAssignment({
      counselorUserId: 'counselor-1',
      actorUserId: 'admin-1',
      members: [{ ...member, previousCounselorUserId: 'counselor-1' }],
      logPrefix: '[test]',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('deep-links a single newly assigned member', async () => {
    await notifyCounselorOfStaffAssignment({
      counselorUserId: 'counselor-1',
      actorUserId: 'admin-1',
      members: [member],
      logPrefix: '[test]',
    });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'counselor-1',
      type: 'task_assigned',
      title: 'A member was assigned to you',
      body: 'Ada Member was assigned to you.',
      data: { memberId: 'member-1', link: '/counselor/students/member-1' },
    });
  });

  it('summarizes several newly assigned members into one notification', async () => {
    await notifyCounselorOfStaffAssignment({
      counselorUserId: 'counselor-1',
      actorUserId: 'admin-1',
      members: [
        member,
        { memberId: 'member-2', memberName: 'Bea', previousCounselorUserId: null },
        { memberId: 'member-keep', memberName: 'Already', previousCounselorUserId: 'counselor-1' },
      ],
      logPrefix: '[test]',
    });
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'counselor-1',
      type: 'task_assigned',
      title: '2 members were assigned to you',
      body: '2 members were added to your caseload.',
      data: { count: 2, link: '/counselor/students' },
    });
  });

  it('logs and does not throw when the notification side channel fails', async () => {
    const err = new Error('notify down');
    createNotification.mockRejectedValueOnce(err);
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      await expect(
        notifyCounselorOfStaffAssignment({
          counselorUserId: 'counselor-1',
          actorUserId: 'admin-1',
          members: [member],
          logPrefix: '[bulk-update]',
        }),
      ).resolves.toBeUndefined();
    } finally {
      console.error = original;
    }
    expect(errors[0]?.[0]).toBe('[bulk-update] assignment committed but counselor notification failed');
    expect(errors[0]?.[1]).toBe(err);
  });
});
