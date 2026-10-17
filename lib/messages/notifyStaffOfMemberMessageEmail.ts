/**
 * Email staff when a member posts in their portal Messages thread.
 *
 * Fail-soft: the Message row and in-app notification are already committed, so
 * a Resend failure must not turn the HTTP send into an error. Honors
 * `User.notificationsUpdates` (same mute as weekly recap / List-Unsubscribe).
 * Staff reads go through `withTenantScope` (WAP-24).
 */

import { sendPortalMemberMessageEmail } from '@/lib/email';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

export async function notifyStaffOfMemberPortalMessageEmail(args: {
  staffUserId: string;
  organizationId: string;
  memberFullName: string;
  bodyPreview: string;
  /** Matches the in-app bell title for consistent wording. */
  title: string;
  /** Relative portal path staff should open (counselor thread or admin inbox). */
  threadPath: string;
}): Promise<void> {
  try {
    const staff = await withTenantScope(args.organizationId, async (db) =>
      db.user.findFirst({
        where: { id: args.staffUserId, deletedAt: null },
        select: {
          email: true,
          fullName: true,
          organizationId: true,
          notificationsUpdates: true,
        },
      }),
    );

    const to = staff?.email?.trim();
    if (!staff || !to) return;
    if (staff.notificationsUpdates === false) return;

    const result = await sendPortalMemberMessageEmail({
      to,
      staffFullName: staff.fullName?.trim() || 'there',
      memberFullName: args.memberFullName.trim() || 'A member',
      bodyPreview: args.bodyPreview.slice(0, 200),
      title: args.title,
      threadPath: args.threadPath,
      orgId: staff.organizationId,
    });

    if (!result.ok && !result.skipped) {
      console.error('[portal-member-message-email] send failed for staff', args.staffUserId, result.error);
    }
  } catch (err) {
    console.error('[portal-member-message-email] notify failed for staff', args.staffUserId, err);
  }
}
