import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

/**
 * Refresh recipient details immediately before a member-triggered email.
 * A request-cached Auth user or an earlier form read can outlive erasure's
 * committed barrier. A failed lookup must not send from that stale snapshot.
 */
export async function activeMemberNotificationTarget(
  userId: string,
): Promise<{ email: string; fullName: string | null } | null> {
  try {
    const row = await crossTenantOK(() => prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        fullName: true,
        deletedAt: true,
        billingDeletionPendingAt: true,
        billingDeletionOperationId: true,
      },
    }));
    if (!row || row.deletedAt || row.billingDeletionPendingAt || row.billingDeletionOperationId) return null;
    return { email: row.email, fullName: row.fullName };
  } catch (error) {
    console.error('[member notification] Account state could not be verified:', error);
    return null;
  }
}
