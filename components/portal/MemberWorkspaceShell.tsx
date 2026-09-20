'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import WorkspaceShell from './WorkspaceShell';
import DashboardFooter from './DashboardFooter';
import DashboardPageErrorBoundary from './DashboardPageErrorBoundary';
import { MEMBER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import { trackFunnelEvent } from '@/lib/analytics/events';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { MemberShellIdentity } from '@/lib/member/memberIdentity';

export default function MemberWorkspaceShell({
  identity,
  hasResume = true,
  superAdmin,
  portalRoles,
  readOnlyAudit = false,
  children,
}: {
  /** Signed-in member's name / email / avatar for the shell header and drawer. */
  identity?: MemberShellIdentity | null;
  /** Member has an original or enhanced resume on file */
  hasResume?: boolean;
  superAdmin?: boolean;
  portalRoles?: PortalSwitcherRole[];
  readOnlyAudit?: boolean;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (readOnlyAudit) return;
    if (searchParams?.get('verified') === '1') {
      trackFunnelEvent('member_signup', 'email_verified');
      trackFunnelEvent('member_signup', 'dashboard_first_visit');
      // Remove the param without adding to history
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('verified');
      const newUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
      if (newUrl) router.replace(newUrl);
    }
  }, [readOnlyAudit, searchParams, pathname, router]);

  return (
    <WorkspaceShell
      portalRole="member"
      navItems={MEMBER_PORTAL_NAV_ITEMS}
      identity={identity}
      workspaceLabel={PRODUCT_COPY.memberWorkspace}
      contextLabel="My account"
      minimalMobileHeader
      marketingSiteHref="https://www.workforceap.org/"
      marketingSiteLabel="WorkforceAP.org"
      showResumeUploadHint={hasResume === false}
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      footer={<DashboardFooter />}
    >
      <DashboardPageErrorBoundary>{children}</DashboardPageErrorBoundary>
    </WorkspaceShell>
  );
}
