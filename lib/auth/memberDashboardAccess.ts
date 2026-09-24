import { cache } from 'react';
import { getProfileRole, getStoredRoleIdentity, isSuperAdmin } from '@/lib/auth/roles';
import { getPortalSwitcherRoles, type PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import { normalizeRoleName } from '@/lib/auth/roleAccess';
import { withDbRetry } from '@/lib/db/withDbRetry';

export type MemberDashboardAccess = {
  portalRoles: PortalSwitcherRole[];
  superAdmin: boolean;
  redirectTo: string | null;
};

/**
 * Layouts and pages can render in parallel. Both must await this request-cached
 * decision before reading member data; a layout redirect alone is not a guard
 * for the page's loader.
 */
export const getMemberDashboardAccess = cache(async function getMemberDashboardAccess(
  userId: string,
): Promise<MemberDashboardAccess> {
  const [profileRole, superAdmin, storedIdentity] = await Promise.all([
    withDbRetry(() => getProfileRole(userId)),
    withDbRetry(() => isSuperAdmin(userId)),
    withDbRetry(() => getStoredRoleIdentity(userId)),
  ]);

  const portalRoles = await getPortalSwitcherRoles(userId, { superAdmin });
  const memberInSwitcher = portalRoles.some(({ role }) => role === 'member');
  const nonMemberPortal = portalRoles.some(({ role }) => role !== 'member');
  // `user_roles.member` is a baseline row on staff accounts. Mixed portal
  // identities need a separate, reviewed member entitlement before access.
  const memberAccess = storedIdentity.userExists && !storedIdentity.deletedAt && (
    superAdmin || (
      normalizeRoleName(storedIdentity.profileRole) === 'member' &&
      profileRole === 'member' && memberInSwitcher && !nonMemberPortal
    )
  );
  if (memberAccess) return { portalRoles, superAdmin, redirectTo: null };

  const adminHome = profileRole === 'admin'
    ? portalRoles.find(({ role }) => role === 'admin')?.homeHref
    : undefined;
  return {
    portalRoles,
    superAdmin,
    redirectTo: adminHome ?? portalRoles.find(({ role }) => role !== 'member')?.homeHref ?? '/',
  };
});
