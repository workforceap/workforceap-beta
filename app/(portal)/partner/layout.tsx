import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { getUser } from '@/lib/auth/server';
import { cookies, headers } from 'next/headers';
import { getPartnerForUser, isSuperAdmin, SUPER_ADMIN_PARTNER_COOKIE } from '@/lib/auth/roles';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import PartnerPortalShell from '@/components/portal/PartnerPortalShell';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { getHomeTourForRole } from '@/lib/tours/registry';

export const metadata: Metadata = {
  title: 'Partner Portal',
};

export default async function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner');

  const superUser = await isSuperAdmin(user.id);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const ctx = await getPartnerForUser(user.id, { isSuperAdminHint: superUser, readOnlyAudit });
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));
  const partnerTour = getHomeTourForRole('partner');
  const [portalRoles, tour] = await Promise.all([
    getPortalSwitcherRoles(user.id, {
      superAdmin: superUser,
      hasPartner: true,
    }),
    // Guided tour gate (flag `guided_tours_v2` + this user's tour state). Never throws.
    partnerTour ? getTourOffer(user.id, partnerTour.key) : Promise.resolve(null),
  ]);

  const cookieStore = await cookies();
  const superAdminImpersonating = superUser && Boolean(cookieStore.get(SUPER_ADMIN_PARTNER_COOKIE)?.value);

  return (
    <PartnerPortalShell
      partnerName={ctx.partner.name}
      partnerLogoUrl={ctx.partner.logoUrl}
      partnerBrandColor={ctx.partner.brandColor}
      orgPrimaryColor={ctx.orgBranding.primaryColor}
      orgAccentColor={ctx.orgBranding.accentColor}
      superAdmin={superUser && !ctx.hasDirectPartnerLink}
      knownSuperAdmin={superUser}
      superAdminImpersonating={superAdminImpersonating}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      tour={tour}
    >
      {children}
    </PartnerPortalShell>
  );
}
