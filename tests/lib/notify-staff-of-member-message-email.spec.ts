import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (
    _orgId: string,
    fn: (scopedDb: { user: { findFirst: ReturnType<typeof vi.fn> } }) => unknown,
  ) => fn({ user: { findFirst: db.userFindFirst } }),
}));

vi.mock('@/lib/email', () => ({
  sendPortalMemberMessageEmail: vi.fn(async () => ({ ok: true })),
}));

import { notifyStaffOfMemberPortalMessageEmail } from '@/lib/messages/notifyStaffOfMemberMessageEmail';
import { sendPortalMemberMessageEmail } from '@/lib/email';

describe('notifyStaffOfMemberPortalMessageEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emails staff at their account address', async () => {
    db.userFindFirst.mockResolvedValueOnce({
      email: 'mbrowncsn@sbcglobal.net',
      fullName: 'Michael Brown',
      organizationId: 'org-1',
      notificationsUpdates: true,
    });

    await notifyStaffOfMemberPortalMessageEmail({
      staffUserId: 'staff-1',
      organizationId: 'org-1',
      memberFullName: 'John Cofield',
      bodyPreview: 'Looking forward to also talk about entrepreneurship',
      title: 'New message from John Cofield',
      threadPath: '/counselor/messages?memberId=member-1',
    });

    expect(sendPortalMemberMessageEmail).toHaveBeenCalledWith({
      to: 'mbrowncsn@sbcglobal.net',
      staffFullName: 'Michael Brown',
      memberFullName: 'John Cofield',
      bodyPreview: 'Looking forward to also talk about entrepreneurship',
      title: 'New message from John Cofield',
      threadPath: '/counselor/messages?memberId=member-1',
      orgId: 'org-1',
    });
  });

  it('skips when staff opted out of updates', async () => {
    db.userFindFirst.mockResolvedValueOnce({
      email: 'muted@example.com',
      fullName: 'Muted',
      organizationId: 'org-1',
      notificationsUpdates: false,
    });

    await notifyStaffOfMemberPortalMessageEmail({
      staffUserId: 'staff-2',
      organizationId: 'org-1',
      memberFullName: 'Member',
      bodyPreview: 'Hello',
      title: 'New message from Member',
      threadPath: '/admin/messages',
    });

    expect(sendPortalMemberMessageEmail).not.toHaveBeenCalled();
  });

  it('skips when staff has no email', async () => {
    db.userFindFirst.mockResolvedValueOnce({
      email: '   ',
      fullName: 'No Email',
      organizationId: 'org-1',
      notificationsUpdates: true,
    });

    await notifyStaffOfMemberPortalMessageEmail({
      staffUserId: 'staff-3',
      organizationId: 'org-1',
      memberFullName: 'Member',
      bodyPreview: 'Hello',
      title: 'New message from Member',
      threadPath: '/admin/messages',
    });

    expect(sendPortalMemberMessageEmail).not.toHaveBeenCalled();
  });

  it('does not throw when send fails', async () => {
    db.userFindFirst.mockResolvedValueOnce({
      email: 'staff@example.com',
      fullName: 'Staff',
      organizationId: 'org-1',
      notificationsUpdates: true,
    });
    vi.mocked(sendPortalMemberMessageEmail).mockResolvedValueOnce({ ok: false, error: 'provider down' });

    await expect(
      notifyStaffOfMemberPortalMessageEmail({
        staffUserId: 'staff-4',
        organizationId: 'org-1',
        memberFullName: 'Member',
        bodyPreview: 'Hello',
        title: 'New message from Member',
        threadPath: '/admin/messages',
      }),
    ).resolves.toBeUndefined();
  });
});
