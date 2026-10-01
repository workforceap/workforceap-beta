'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './SignOutButton';
import LanguageToggle from './LanguageToggle';
import { MEMBER_PORTAL_NAV_ITEMS, PORTAL_NAV } from '@/lib/nav/portalNav';
import { isActiveRoute } from '@/lib/nav/activeRoute';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import type { PortalRole } from '@/lib/nav/portalNav';

export default function PortalNav({ className, currentRole, currentPath }: { className?: string; currentRole?: PortalRole; currentPath?: string; }) {
  const detectedPathname = usePathname();
  const pathname = currentPath ?? detectedPathname ?? '';

  // Get nav items for current role
  const navItems = currentRole ? PORTAL_NAV[currentRole] : MEMBER_PORTAL_NAV_ITEMS;
  const workspaceLabel = currentRole === 'admin' ? 'Admin' : currentRole === 'employer' ? 'Employer workspace' : currentRole === 'partner' ? 'Partner workspace' : currentRole === 'counselor' ? 'Counselor workspace' : PRODUCT_COPY.memberWorkspace;

  return (
    <nav className={`portal-nav${className ? ` ${className}` : ''}`} aria-label={`${workspaceLabel} navigation`}>
      <div className="portal-nav-inner">
        <ul className="portal-nav-links">
          {navItems.map(({ href, label, aliases, exact }) => {
            const isActive = isActiveRoute(pathname, href, aliases, exact);
            return (
              <li key={href}>
                <Link href={href} prefetch={false} className={isActive ? 'active' : undefined}>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="portal-nav-actions">
          <LanguageToggle />
          <Link href="/" prefetch={false} className="portal-nav-home">
            {PRODUCT_COPY.publicSiteLabel}
          </Link>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
