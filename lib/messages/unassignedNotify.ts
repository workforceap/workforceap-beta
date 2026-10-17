import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { WAP_STAFF_COUNSELOR_AFFILIATION } from '@/lib/counselor/autoAssign';
import { counselorMemberThreadLink } from '@/lib/messages/staffLinks';
import { notifyStaffOfMemberPortalMessageEmail } from '@/lib/messages/notifyStaffOfMemberMessageEmail';

export type UnassignedNotifyResult = {
  notifiedUserIds: string[];
  fallback: 'counselors' | 'admins' | 'none';
};

/**
 * Safety net for a member message whose thread still has no counselorUserId.
 * Prefer active WAP staff counselors in the member's org. If that pool is
 * empty, notify org admins the same way the onboarding-stalls cron does.
 */
export async function notifyUnassignedMemberMessage(input: {
  memberId: string;
  organizationId: string | null;
  threadId: string;
  senderLabel: string;
  messagePreview: string;
}): Promise<UnassignedNotifyResult> {
  const { memberId, organizationId, threadId, senderLabel, messagePreview } = input;
  const title = `Unassigned member message from ${senderLabel}`;

  if (organizationId) {
    const counselors = await prisma.counselor.findMany({
      where: {
        active: true,
        affiliation: WAP_STAFF_COUNSELOR_AFFILIATION,
        user: { organizationId, deletedAt: null },
      },
      select: { userId: true },
    });
    const counselorUserIds = Array.from(new Set(counselors.map((row) => row.userId)));
    if (counselorUserIds.length > 0) {
      const link = counselorMemberThreadLink(memberId);
      await Promise.all(
        counselorUserIds.map((userId) =>
          createNotification({
            userId,
            type: 'message',
            title,
            body: messagePreview,
            data: {
              threadId,
              memberId,
              link,
              unassigned: true,
            },
          }),
        ),
      );
      await Promise.all(
        counselorUserIds.map((userId) =>
          notifyStaffOfMemberPortalMessageEmail({
            staffUserId: userId,
            organizationId,
            memberFullName: senderLabel,
            bodyPreview: messagePreview,
            title,
            threadPath: link,
          }),
        ),
      );
      return { notifiedUserIds: counselorUserIds, fallback: 'counselors' };
    }
  }

  const [profileAdmins, userRoleAdmins] = await Promise.all([
    prisma.profile.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        ...(organizationId ? { user: { organizationId, deletedAt: null } } : {}),
      },
      select: { userId: true },
    }),
    prisma.userRole.findMany({
      where: {
        role: { name: 'admin' },
        ...(organizationId ? { user: { organizationId, deletedAt: null } } : {}),
      },
      select: { userId: true },
    }),
  ]);
  const adminUserIds = Array.from(
    new Set([...profileAdmins.map((row) => row.userId), ...userRoleAdmins.map((row) => row.userId)]),
  );
  if (adminUserIds.length === 0) {
    return { notifiedUserIds: [], fallback: 'none' };
  }

  const adminUsers = await prisma.user.findMany({
    where: { id: { in: adminUserIds }, deletedAt: null },
    select: { id: true },
  });
  const notifiedUserIds = adminUsers.map((row) => row.id);
  const adminLink = '/admin/messages';
  await Promise.all(
    notifiedUserIds.map((userId) =>
      createNotification({
        userId,
        type: 'message',
        title,
        body: messagePreview,
        data: {
          threadId,
          memberId,
          link: adminLink,
          unassigned: true,
        },
      }),
    ),
  );
  if (organizationId) {
    await Promise.all(
      notifiedUserIds.map((userId) =>
        notifyStaffOfMemberPortalMessageEmail({
          staffUserId: userId,
          organizationId,
          memberFullName: senderLabel,
          bodyPreview: messagePreview,
          title,
          threadPath: adminLink,
        }),
      ),
    );
  }
  return { notifiedUserIds, fallback: notifiedUserIds.length ? 'admins' : 'none' };
}
