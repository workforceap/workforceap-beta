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
  sendPortalStaffMessageEmail: vi.fn(async () => ({ ok: true })),
}));

import { notifyMemberOfStaffPortalMessageEmail } from '@/lib/messages/notifyMemberOfStaffMessageEmail';
import { sendPortalStaffMessageEmail } from '@/lib/email';

describe('notifyMemberOfStaffPortalMessageEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emails the member at their account address', async () => {
    db.userFindFirst
      .mockResolvedValueOnce({
        email: 'michael.brown@workforceap.org',
        fullName: 'Michael Brown',
        organizationId: 'org-1',
        notificationsUpdates: true,
      })
      .mockResolvedValueOnce({ fullName: 'Jordan Advisor' });

    await notifyMemberOfStaffPortalMessageEmail({
      memberId: 'member-1',
      staffUserId: 'staff-1',
      organizationId: 'org-1',
      bodyPreview: 'Your paperwork is approved.',
      title: 'New message from your advisor',
    });

    expect(sendPortalStaffMessageEmail).toHaveBeenCalledWith({
      to: 'michael.brown@workforceap.org',
      memberFullName: 'Michael Brown',
      staffFullName: 'Jordan Advisor',
      bodyPreview: 'Your paperwork is approved.',
      title: 'New message from your advisor',
      orgId: 'org-1',
    });
  });

  it('skips when the member opted out of updates', async () => {
    db.userFindFirst
      .mockResolvedValueOnce({
        email: 'muted@example.com',
        fullName: 'Muted',
        organizationId: 'org-1',
        notificationsUpdates: false,
      })
      .mockResolvedValueOnce({ fullName: 'Staff' });

    await notifyMemberOfStaffPortalMessageEmail({
      memberId: 'member-2',
      staffUserId: 'staff-1',
      organizationId: 'org-1',
      bodyPreview: 'Hello',
      title: 'New message from WorkforceAP staff',
    });

    expect(sendPortalStaffMessageEmail).not.toHaveBeenCalled();
  });

  it('skips when the member has no email', async () => {
    db.userFindFirst
      .mockResolvedValueOnce({
        email: '   ',
        fullName: 'No Email',
        organizationId: 'org-1',
        notificationsUpdates: true,
      })
      .mockResolvedValueOnce({ fullName: 'Staff' });

    await notifyMemberOfStaffPortalMessageEmail({
      memberId: 'member-3',
      staffUserId: 'staff-1',
      organizationId: 'org-1',
      bodyPreview: 'Hello',
      title: 'New message from WorkforceAP staff',
    });

    expect(sendPortalStaffMessageEmail).not.toHaveBeenCalled();
  });

  it('does not throw when send fails', async () => {
    db.userFindFirst
      .mockResolvedValueOnce({
        email: 'member@example.com',
        fullName: 'Member',
        organizationId: 'org-1',
        notificationsUpdates: true,
      })
      .mockResolvedValueOnce({ fullName: 'Staff' });
    vi.mocked(sendPortalStaffMessageEmail).mockResolvedValueOnce({ ok: false, error: 'provider down' });

    await expect(
      notifyMemberOfStaffPortalMessageEmail({
        memberId: 'member-4',
        staffUserId: 'staff-1',
        organizationId: 'org-1',
        bodyPreview: 'Hello',
        title: 'New message from WorkforceAP staff',
      }),
    ).resolves.toBeUndefined();
  });
});
