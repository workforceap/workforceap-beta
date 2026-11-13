import { prisma } from '@/lib/db/prisma';
import type { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

type Admin = ReturnType<typeof getSupabaseAdmin>;

/**
 * Best-effort rollback for a provision that created an Auth user, then failed
 * the app-row write. `inviteUserByEmail` can return an existing unconfirmed
 * Auth user on success, so deleting that id blindly would lock out a real
 * member. Only delete when no `User` row claims the Auth id. If the app-row
 * lookup itself fails, keep the Auth user (orphan Auth is recoverable; a
 * deleted login is not).
 */
export async function deleteOrphanAuthUserAfterFailedProvision(
  admin: Admin,
  userId: string,
): Promise<boolean> {
  try {
    const appUser = await crossTenantOK(() =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
    );
    if (appUser) return false;
  } catch {
    return false;
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    return !error;
  } catch {
    return false;
  }
}
