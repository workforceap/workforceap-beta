'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import MobileBottomNav from '@/components/MobileBottomNav';

// Only these synthetic fixtures opt into the real partner phone destinations.
// Detail shares the Members current state, just like a real referral detail.
const PARTNER_FIXTURE_ROUTES: Record<string, string> = {
  '/dev/staff/partner': '/partner',
  '/dev/staff/partner-command': '/partner',
  '/dev/staff/partner-members': '/partner/referred-members',
  '/dev/staff/partner-member-detail': '/partner/referred-members/synthetic-member',
};

export default function DevPartnerFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const activePathname = PARTNER_FIXTURE_ROUTES[pathname];
  if (!activePathname) return children;

  return (
    <>
      <p className="wa-kit-meta wa-px-6 wa-pt-4" role="note">
        Partner showcase with synthetic data. Navigation links open the partner portal.
      </p>
      {children}
      {/* Same portal token treatment as WorkspaceShell; existing global
          :has(nav#mobile-bottom-nav) rules reserve the bottom/safe-area inset. */}
      <div className="wa-dev-partner-nav" data-surface="dense">
        <MobileBottomNav variant="partner" activePathname={activePathname} />
      </div>
    </>
  );
}
