import { cache } from 'react';
import { getProfileRole, getUserRoles, isSuperAdmin } from '@/lib/auth/roles';
import { getPortalSwitcherRoles, type PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
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
  const [profileRole, superAdmin] = await Promise.all([
    withDbRetry(() => getProfileRole(userId)),
    withDbRetry(() => isSuperAdmin(userId)),
  ]);

  const [portalRoles, userRoleNames] = await Promise.all([
    getPortalSwitcherRoles(userId, { superAdmin }),
    withDbRetry(() => getUserRoles(userId)),
  ]);
  const memberInSwitcher = portalRoles.some(({ role }) => role === 'member');
  const memberAccess = superAdmin ||
    (memberInSwitcher && (profileRole === 'member' || userRoleNames.includes('member')));
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
