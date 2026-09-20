'use client';

import WorkspaceShell from './WorkspaceShell';
import DashboardFooter from './DashboardFooter';
import { COUNSELOR_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { TourOffer } from '@/lib/tours/getTourOffer';
import TourOfferStrip from '@/components/onboarding/TourOfferStrip';

/** Guide page the Help menu links beside "Take the tour". */
export const COUNSELOR_GUIDE_HREF = '/counselor/guide';

export default function CounselorPortalShell({
  children,
  subtitle,
  superAdmin,
  portalRoles,
  readOnlyAudit = false,
  tour = null,
}: {
  children: React.ReactNode;
  subtitle: string;
  superAdmin?: boolean;
  portalRoles?: PortalSwitcherRole[];
  readOnlyAudit?: boolean;
  /**
   * Counselor guided tour gate from `getTourOffer` (tours wave 2). `enabled`
   * shows the header Help menu; `offer` shows the first-login strip. Null (flag
   * row absent, lookup failed) renders the pre-flag shell unchanged.
   */
  tour?: TourOffer | null;
}) {
  const helpTourKey = tour?.enabled ? tour.key : null;
  return (
    <WorkspaceShell
      portalRole="counselor"
      navItems={COUNSELOR_PORTAL_NAV_ITEMS}
      workspaceLabel={PRODUCT_COPY.counselorWorkspace ?? 'Counselor'}
      contextLabel={subtitle}
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      footer={<DashboardFooter />}
      helpTourKey={helpTourKey}
      helpGuideHref={helpTourKey ? COUNSELOR_GUIDE_HREF : undefined}
    >
      {tour?.enabled && tour.offer && !readOnlyAudit ? <TourOfferStrip tourKey={tour.key} /> : null}
      {children}
    </WorkspaceShell>
  );
}
