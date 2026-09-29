import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findManyCounselors,
  findManyProfiles,
  findManyUserRoles,
  findManyUsers,
  createNotification,
} = vi.hoisted(() => ({
  findManyCounselors: vi.fn(),
  findManyProfiles: vi.fn(),
  findManyUserRoles: vi.fn(),
  findManyUsers: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselor: { findMany: findManyCounselors },
    profile: { findMany: findManyProfiles },
    userRole: { findMany: findManyUserRoles },
    user: { findMany: findManyUsers },
  },
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification,
}));

import { notifyUnassignedMemberMessage } from '@/lib/messages/unassignedNotify';

const base = {
  memberId: 'member-1',
  organizationId: 'org-1',
  threadId: 'thread-1',
  senderLabel: 'Jane Doe',
  messagePreview: 'I am stuck',
};

describe('notifyUnassignedMemberMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue(undefined);
  });

  it('notifies active WAP counselors when the thread is still unassigned', async () => {
    findManyCounselors.mockResolvedValue([{ userId: 'counselor-1' }, { userId: 'counselor-2' }]);

    await expect(notifyUnassignedMemberMessage(base)).resolves.toEqual({
      notifiedUserIds: ['counselor-1', 'counselor-2'],
      fallback: 'counselors',
    });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'counselor-1',
        type: 'message',
        title: 'Unassigned member message from Jane Doe',
        data: expect.objectContaining({
          threadId: 'thread-1',
          memberId: 'member-1',
          link: '/counselor/messages?memberId=member-1',
          unassigned: true,
        }),
      }),
    );
    expect(findManyProfiles).not.toHaveBeenCalled();
  });

  it('falls back to org admins when no WAP counselors exist', async () => {
    findManyCounselors.mockResolvedValue([]);
    findManyProfiles.mockResolvedValue([{ userId: 'admin-1' }]);
    findManyUserRoles.mockResolvedValue([{ userId: 'admin-2' }]);
    findManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await expect(notifyUnassignedMemberMessage(base)).resolves.toEqual({
      notifiedUserIds: ['admin-1', 'admin-2'],
      fallback: 'admins',
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        data: expect.objectContaining({ link: '/admin/messages', unassigned: true }),
      }),
    );
  });

  it('returns none when neither counselors nor admins exist', async () => {
    findManyCounselors.mockResolvedValue([]);
    findManyProfiles.mockResolvedValue([]);
    findManyUserRoles.mockResolvedValue([]);

    await expect(notifyUnassignedMemberMessage(base)).resolves.toEqual({
      notifiedUserIds: [],
      fallback: 'none',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
