'use client';

import Link from 'next/link';
import DevViewToggle from './DevViewToggle';
import NotificationBell from './NotificationBell';
import { SignOutButton } from './SignOutButton';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { NavBadgeKey } from '@/lib/nav/portalNav';


export default function PortalHeaderActions({
  badges,
  hidePublicSite,
  readOnlyAudit,
}: {
  badges?: Partial<Record<NavBadgeKey, number>>;
  hidePublicSite?: boolean;
  readOnlyAudit?: boolean;
}) {
  return (
    <div className="portal-shell-header__actions">
      <NotificationBell badges={badges} readOnlyAudit={readOnlyAudit} />
      {/* One bell at every breakpoint; only the other actions are hidden. */}
      <div className="portal-shell-header__actions portal-header-actions-desktop">
        <DevViewToggle />
        {!hidePublicSite ? (
          <Link href="/" prefetch={false} className="wa-shell-text-action wa-kit-focus">
            {PRODUCT_COPY.publicSiteLabel}
          </Link>
        ) : null}
        <SignOutButton className="wa-shell-text-action wa-kit-focus" />
      </div>
    </div>
  );
}
