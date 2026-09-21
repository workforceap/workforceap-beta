'use client';

import WorkspaceShell from './WorkspaceShell';
import DashboardFooter from './DashboardFooter';
import { EMPLOYER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { TourOffer } from '@/lib/tours/getTourOffer';
import TourOfferStrip from '@/components/onboarding/TourOfferStrip';

/** Guide page the Help menu links beside "Take the tour" (the nav's "How it works"). */
export const EMPLOYER_GUIDE_HREF = '/employer/guide';

export default function EmployerPortalShell({
  companyName,
  companyLogoUrl,
  employerTier,
  superAdmin,
  superAdminImpersonating,
  portalRoles,
  readOnlyAudit = false,
  tour = null,
  children,
}: {
  companyName: string;
  companyLogoUrl?: string | null;
  employerTier?: string;
  superAdmin?: boolean;
  superAdminImpersonating?: boolean;
  portalRoles?: PortalSwitcherRole[];
  readOnlyAudit?: boolean;
  /**
   * Employer guided tour gate from `getTourOffer` (tours wave 3). `enabled`
   * shows the header Help menu; `offer` shows the first-login strip. Null (flag
   * row absent, lookup failed) renders the pre-flag shell unchanged.
   */
  tour?: TourOffer | null;
  children: React.ReactNode;
}) {
  const headerBadge = employerTier === 'partner' ? 'Hiring Partner' : undefined;
  const helpTourKey = tour?.enabled ? tour.key : null;
  return (
    <WorkspaceShell
      portalRole="employer"
      navItems={EMPLOYER_PORTAL_NAV_ITEMS}
      workspaceLabel={PRODUCT_COPY.employerWorkspace}
      contextLabel={companyName}
      contextLogoUrl={companyLogoUrl}
      headerBadge={headerBadge}
      superAdmin={superAdmin}
      superAdminImpersonating={superAdminImpersonating}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      superAdminBackHref={superAdmin ? '/employer' : undefined}
      superAdminBackLabel="Switch company"
      footer={<DashboardFooter />}
      helpTourKey={helpTourKey}
      helpGuideHref={helpTourKey ? EMPLOYER_GUIDE_HREF : undefined}
    >
      {tour?.enabled && tour.offer && !readOnlyAudit ? <TourOfferStrip tourKey={tour.key} /> : null}
      {children}
    </WorkspaceShell>
  );
}
