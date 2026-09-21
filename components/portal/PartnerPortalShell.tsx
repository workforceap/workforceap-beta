'use client';

import WorkspaceShell from './WorkspaceShell';
import DashboardFooter from './DashboardFooter';
import { PARTNER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { TourOffer } from '@/lib/tours/getTourOffer';
import TourOfferStrip from '@/components/onboarding/TourOfferStrip';

/** Guide page the Help menu links beside "Take the tour" (the nav's "Referral guide"). */
export const PARTNER_GUIDE_HREF = '/partner/guide';

export default function PartnerPortalShell({
  partnerName,
  partnerLogoUrl,
  partnerBrandColor,
  orgPrimaryColor,
  orgAccentColor,
  superAdmin,
  superAdminImpersonating,
  portalRoles,
  readOnlyAudit = false,
  tour = null,
  children,
}: {
  partnerName: string;
  partnerLogoUrl?: string | null;
  partnerBrandColor?: string | null;
  orgPrimaryColor?: string | null;
  orgAccentColor?: string | null;
  superAdmin?: boolean;
  superAdminImpersonating?: boolean;
  portalRoles?: PortalSwitcherRole[];
  readOnlyAudit?: boolean;
  /**
   * Partner guided tour gate from `getTourOffer` (tours wave 3). `enabled`
   * shows the header Help menu; `offer` shows the first-login strip. Null (flag
   * row absent, lookup failed) renders the pre-flag shell unchanged.
   */
  tour?: TourOffer | null;
  children: React.ReactNode;
}) {
  const helpTourKey = tour?.enabled ? tour.key : null;
  return (
    <WorkspaceShell
      portalRole="partner"
      navItems={PARTNER_PORTAL_NAV_ITEMS}
      workspaceLabel={PRODUCT_COPY.partnerWorkspace}
      contextLabel={partnerName}
      contextLogoUrl={partnerLogoUrl ?? undefined}
      partnerAccentColor={partnerBrandColor ?? undefined}
      orgPrimaryColor={orgPrimaryColor ?? undefined}
      orgAccentColor={orgAccentColor ?? undefined}
      attributionLabel="Powered by WorkforceAP"
      superAdmin={superAdmin}
      superAdminImpersonating={superAdminImpersonating}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      superAdminBackHref={superAdmin ? '/partner' : undefined}
      superAdminBackLabel="Switch partner"
      footer={<DashboardFooter />}
      helpTourKey={helpTourKey}
      helpGuideHref={helpTourKey ? PARTNER_GUIDE_HREF : undefined}
    >
      {tour?.enabled && tour.offer && !readOnlyAudit ? <TourOfferStrip tourKey={tour.key} /> : null}
      {children}
    </WorkspaceShell>
  );
}
