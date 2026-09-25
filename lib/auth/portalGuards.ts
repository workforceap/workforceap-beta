import { cache } from 'react';
import { getEmployerAccountForNav, getPartnerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';

/**
 * Send a denied portal visitor toward another switcher-listed portal. The
 * baseline member role on staff accounts does not grant dashboard access, so
 * use the same role list as the portal switcher instead of assuming that
 * `/dashboard` is a safe fallback. Exclude the denied portal to avoid loops
 * when a stored role row exists without the tenant/association it needs.
 * Bare Employer/Partner role rows are not enough: check the linked account
 * before choosing either destination. The destination's own guard still
 * decides whether that portal can render.
 */
export const deniedPortalHomeHref = cache(async function deniedPortalHomeHref(
  userId: string,
  deniedRole: 'admin' | 'counselor',
): Promise<string> {
  const roles = await getPortalSwitcherRoles(userId);
  for (const candidate of roles) {
    if (candidate.role === deniedRole) continue;
    if (candidate.role === 'employer' && !(await getEmployerAccountForNav(userId))) continue;
    if (candidate.role === 'partner' && !(await getPartnerForUser(userId, { readOnlyAudit: true }))) continue;
    return candidate.homeHref;
  }
  return '/';
});

/**
 * Where to send a logged-in user who reached an Employer portal page without
 * an Employer record. Super admins go back to the employer selector so they
 * choose an explicit preview context; everyone else gets the public marketing
 * page where they can request access.
 *
 * Use at every redirect site in app/(portal)/employer/**:
 *   if (!ctx) redirect(await unlinkedEmployerHref(user.id));
 *
 * Replaces the pattern `redirect('/employers')` from before #735's P-003
 * fix, which sent super admins doing role-switcher dogfooding to a public
 * marketing page (confusing dead-end). The fix landed on the page.tsx but
 * missed the layout.tsx and 11 sibling routes — this helper keeps the rule
 * a single source of truth.
 */
export async function unlinkedEmployerHref(userId: string): Promise<string> {
  return (await isSuperAdmin(userId)) ? '/admin/employers' : '/employers';
}

/** Same as above for the Partner portal. */
export async function unlinkedPartnerHref(userId: string): Promise<string> {
  return (await isSuperAdmin(userId)) ? '/admin/partners' : '/partners';
}
