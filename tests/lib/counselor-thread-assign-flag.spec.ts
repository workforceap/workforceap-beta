import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findUniqueThread,
  createThread,
  updateThread,
  findFirstUser,
  findFirstAssignment,
  ensureSelfServeCounselorAssigned,
  lockMember,
} = vi.hoisted(() => ({
  lockMember: vi.fn(),
  findUniqueThread: vi.fn(),
  createThread: vi.fn(),
  updateThread: vi.fn(),
  findFirstUser: vi.fn(),
  findFirstAssignment: vi.fn(),
  ensureSelfServeCounselorAssigned: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    messageThread: { findUnique: findUniqueThread, create: createThread, update: updateThread },
    user: { findFirst: findFirstUser },
    counselorAssignment: { findFirst: findFirstAssignment },
    $queryRaw: lockMember,
  };
  return { prisma: { ...prisma, $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma) } };
});

vi.mock('@/lib/counselor/autoAssign', () => ({
  ensureSelfServeCounselorAssigned,
}));

import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';

describe('getOrCreateMemberCounselorThread assignIfUnassigned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockMember.mockResolvedValue([{ organizationId: 'org-1' }]);
    findUniqueThread.mockResolvedValue(null);
    createThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: null });
    findFirstAssignment.mockResolvedValue(null);
    findFirstUser.mockResolvedValue({ organizationId: 'org-1' });
    ensureSelfServeCounselorAssigned.mockResolvedValue({
      assigned: false,
      counselorUserId: null,
      reason: 'no_counselors',
    });
  });

  it('does not assign when staff or shared callers omit the flag', async () => {
    await getOrCreateMemberCounselorThread('member-1');
    expect(ensureSelfServeCounselorAssigned).not.toHaveBeenCalled();
    expect(findFirstUser).not.toHaveBeenCalled();
    expect(createThread).toHaveBeenCalled();
  });

  it('assigns only when the member-initiated flag is set', async () => {
    await getOrCreateMemberCounselorThread('member-1', { assignIfUnassigned: true });
    expect(ensureSelfServeCounselorAssigned).toHaveBeenCalledWith({
      memberId: 'member-1',
      organizationId: 'org-1',
    });
  });

  it('first thread open by a self-serve member ends with the new counselor on the thread', async () => {
    // Existing thread with no owner; auto-assign succeeds; the assignment row
    // is now visible, so the thread's counselorUserId is filled in.
    findUniqueThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: null });
    ensureSelfServeCounselorAssigned.mockResolvedValue({
      assigned: true,
      counselorUserId: 'counselor-1',
      reason: 'assigned',
    });
    findFirstAssignment.mockResolvedValue({ counselor: { userId: 'counselor-1', active: true } });
    updateThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1' });

    const thread = await getOrCreateMemberCounselorThread('member-1', { assignIfUnassigned: true });

    expect(ensureSelfServeCounselorAssigned).toHaveBeenCalledTimes(1);
    expect(updateThread).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { counselorUserId: 'counselor-1' },
    });
    expect(thread.counselorUserId).toBe('counselor-1');
    expect(createThread).not.toHaveBeenCalled();
  });

  it('partner-referred member thread open stays unowned when auto-assign declines', async () => {
    findUniqueThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: null });
    ensureSelfServeCounselorAssigned.mockResolvedValue({
      assigned: false,
      counselorUserId: null,
      reason: 'partner_referred',
    });
    findFirstAssignment.mockResolvedValue(null);

    const thread = await getOrCreateMemberCounselorThread('member-1', { assignIfUnassigned: true });

    expect(updateThread).not.toHaveBeenCalled();
    expect(createThread).not.toHaveBeenCalled();
    expect(thread.counselorUserId).toBeNull();
  });
});


it('replaces a stale non-null thread owner only after locking and validating the current same-org assignment', async () => {
  lockMember.mockResolvedValue([{ organizationId: 'org-1' }]);
  findUniqueThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: 'old-admin', memberLastReadAt: new Date('2026-01-01') });
  findFirstAssignment.mockResolvedValue({ counselor: { userId: 'current', active: true } });
  updateThread.mockImplementation(async ({ data }) => ({ id: 'thread-1', ...data }));
  const result = await getOrCreateMemberCounselorThread('member-1');
  expect(result.counselorUserId).toBe('current');
  expect(findFirstAssignment).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
    memberId: 'member-1', active: true,
    counselor: { active: true, user: { organizationId: 'org-1', deletedAt: null } },
  } }));
  expect(lockMember.mock.invocationCallOrder.at(-1)).toBeLessThan(findFirstAssignment.mock.invocationCallOrder.at(-1)!);
  expect(updateThread).toHaveBeenLastCalledWith({ where: { id: 'thread-1' }, data: { counselorUserId: 'current' } });
});

it('clears stale routing when no valid assignment exists, keeping message history and cursors', async () => {
  lockMember.mockResolvedValue([{ organizationId: 'org-1' }]);
  findUniqueThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: 'old-admin' });
  findFirstAssignment.mockResolvedValue(null);
  await getOrCreateMemberCounselorThread('member-1');
  expect(updateThread).toHaveBeenLastCalledWith({ where: { id: 'thread-1' }, data: { counselorUserId: null } });
});

it('fails closed for an unavailable member before reading an assignment or thread', async () => {
  vi.clearAllMocks();
  lockMember.mockResolvedValue([]);
  await expect(getOrCreateMemberCounselorThread('deleted-member')).rejects.toThrow('Member not found');
  expect(findFirstAssignment).not.toHaveBeenCalled();
  expect(updateThread).not.toHaveBeenCalled();
});


it('reads the new assignment after waiting for a concurrent handoff lock', async () => {
  vi.clearAllMocks();
  let release!: () => void;
  const handoff = new Promise<void>((resolve) => { release = resolve; });
  lockMember.mockImplementationOnce(async () => { await handoff; return [{ organizationId: 'org-1' }]; });
  const pending = getOrCreateMemberCounselorThread('member-1');
  expect(findFirstAssignment).not.toHaveBeenCalled();
  // The handoff commits both records while this refresh waits on the member row.
  findFirstAssignment.mockResolvedValue({ counselor: { userId: 'new-owner', active: true } });
  findUniqueThread.mockResolvedValue({ id: 'thread-1', memberId: 'member-1', counselorUserId: 'new-owner' });
  release();
  expect((await pending).counselorUserId).toBe('new-owner');
  expect(updateThread).not.toHaveBeenCalled();
});
