/**
 * Email a member when staff post in their portal Messages thread.
 *
 * Fail-soft: the Message row and in-app notification are already committed, so
 * a Resend failure must not turn the HTTP send into an error. Honors
 * `User.notificationsUpdates` (same mute as weekly recap / List-Unsubscribe).
 * Member/staff reads go through `withTenantScope` (WAP-24).
 */

import { sendPortalStaffMessageEmail } from '@/lib/email';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

export async function notifyMemberOfStaffPortalMessageEmail(args: {
  memberId: string;
  staffUserId: string;
  organizationId: string;
  bodyPreview: string;
  /** Matches the in-app bell title for consistent wording. */
  title: string;
}): Promise<void> {
  try {
    const { member, staff } = await withTenantScope(args.organizationId, async (db) => {
      const memberRow = await db.user.findFirst({
        where: { id: args.memberId, deletedAt: null },
        select: {
          email: true,
          fullName: true,
          organizationId: true,
          notificationsUpdates: true,
        },
      });
      const staffRow = await db.user.findFirst({
        where: { id: args.staffUserId },
        select: { fullName: true },
      });
      return { member: memberRow, staff: staffRow };
    });

    const to = member?.email?.trim();
    if (!member || !to) return;
    if (member.notificationsUpdates === false) return;

    const result = await sendPortalStaffMessageEmail({
      to,
      memberFullName: member.fullName?.trim() || 'there',
      staffFullName: staff?.fullName?.trim() || 'WorkforceAP staff',
      bodyPreview: args.bodyPreview.slice(0, 200),
      title: args.title,
      orgId: member.organizationId,
    });

    if (!result.ok && !result.skipped) {
      console.error('[portal-message-email] send failed for member', args.memberId, result.error);
    }
  } catch (err) {
    console.error('[portal-message-email] notify failed for member', args.memberId, err);
  }
}
