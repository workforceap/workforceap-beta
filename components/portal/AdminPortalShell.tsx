'use client';

import { useMemo } from 'react';
import WorkspaceShell from './WorkspaceShell';
import AdminFooter from '@/components/admin/AdminFooter';
import TourOfferStrip from '@/components/onboarding/TourOfferStrip';
import TourProviderWrapper from '@/components/onboarding/TourProviderWrapper';
import { ADMIN_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { TourOffer } from '@/lib/tours/getTourOffer';

/** Guide page the Help menu links beside "Take the tour" (app/admin/guide). */
export const ADMIN_GUIDE_HREF = '/admin/guide';

export default function AdminPortalShell({
  children,
  superAdmin = false,
  portalRoles,
  readOnlyAudit = false,
  tour = null,
}: {
  children: React.ReactNode;
  superAdmin?: boolean;
  portalRoles?: PortalSwitcherRole[];
  readOnlyAudit?: boolean;
  /**
   * Admin guided tour gate from `getTourOffer` (tours wave 4). `enabled`
   * shows the header Help menu and mounts the tour engine; `offer` shows the
   * first-login strip. Null (flag row absent, lookup failed) renders the
   * pre-flag shell unchanged.
   */
  tour?: TourOffer | null;
}) {
  const navItems = useMemo(
    () => ADMIN_PORTAL_NAV_ITEMS.filter((item) => !item.requiresSuperAdminContext || superAdmin),
    [superAdmin]
  );
  const helpTourKey = tour?.enabled ? tour.key : null;

  const shell = (
    <WorkspaceShell
      portalRole="admin"
      navItems={navItems}
      workspaceLabel={PRODUCT_COPY.adminWorkspace}
      contextLabel="Administrator"
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      footer={<AdminFooter />}
      helpTourKey={helpTourKey}
      helpGuideHref={helpTourKey ? ADMIN_GUIDE_HREF : undefined}
    >
      {tour?.enabled && tour.offer && !readOnlyAudit ? <TourOfferStrip tourKey={tour.key} /> : null}
      {children}
    </WorkspaceShell>
  );

  // The admin route group sits outside app/(portal), whose layout mounts the
  // tour engine (PortalLayoutClient → TourProviderWrapper). Mount it here only
  // when `guided_tours_v2` is on for this admin, so the flag-off tree is the
  // pre-flag shell byte for byte.
  return helpTourKey ? <TourProviderWrapper>{shell}</TourProviderWrapper> : shell;
}
