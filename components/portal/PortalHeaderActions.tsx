'use client';

import Link from 'next/link';
import DevViewToggle from './DevViewToggle';
import NotificationBell from './NotificationBell';
import { SignOutButton } from './SignOutButton';
import PortalHelpMenu from './PortalHelpMenu';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { NavBadgeKey } from '@/lib/nav/portalNav';
import type { TourKey } from '@/lib/tours/registry';


export default function PortalHeaderActions({
  badges,
  hidePublicSite,
  readOnlyAudit,
  knownIsAdmin,
  helpTourKey,
  helpGuideHref,
  previewMode = false,
}: {
  badges?: Partial<Record<NavBadgeKey, number>>;
  hidePublicSite?: boolean;
  readOnlyAudit?: boolean;
  /** Server-resolved effective role is exactly admin; undefined uses the shared browser snapshot. */
  knownIsAdmin?: boolean;
  /** Registry tour the Help menu can (re)open; the menu is absent when null (flag off / no tour for this persona). */
  helpTourKey?: TourKey | null;
  /** Optional guide page linked from the Help menu. */
  helpGuideHref?: string;
  /** Synthetic fixture chrome has no live notification or sign-out session. */
  previewMode?: boolean;
}) {
  return (
    <div className="portal-shell-header__actions">
      {/* Help sits beside the bell so the tour can be reopened at every breakpoint. */}
      {helpTourKey ? <PortalHelpMenu tourKey={helpTourKey} guideHref={helpGuideHref} previewMode={previewMode} /> : null}
      {!previewMode ? <NotificationBell badges={badges} readOnlyAudit={readOnlyAudit} /> : null}
      {/* One bell at every breakpoint; only the other actions are hidden. */}
      <div className="portal-shell-header__actions portal-header-actions-desktop">
        <DevViewToggle knownIsAdmin={knownIsAdmin} />
        {!hidePublicSite ? (
          <Link href="/" prefetch={false} className="wa-shell-text-action wa-kit-focus">
            {PRODUCT_COPY.publicSiteLabel}
          </Link>
        ) : null}
        {!previewMode ? <SignOutButton className="wa-shell-text-action wa-kit-focus" /> : null}
      </div>
    </div>
  );
}
