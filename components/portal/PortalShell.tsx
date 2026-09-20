'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import PortalNav from './PortalNav';
import PortalRoleSwitcher from './PortalRoleSwitcher';
import type { PortalRole } from '@/lib/nav/portalNav';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const MEMBER_PORTAL_PREFIXES = ['/dashboard', '/programs', '/apply', '/certifications', '/profile'];
const DEDICATED_SHELL_PREFIXES = ['/employer', '/partner', '/counselor'];

function isMemberPortalPath(path: string) {
  return MEMBER_PORTAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function hasDedicatedShell(path: string) {
  return DEDICATED_SHELL_PREFIXES.some((p) => path.startsWith(p));
}

// Strip locale prefix so /en/dashboard is treated the same as /dashboard
function stripLocale(path: string) {
  return path.replace(/^\/(en|es|fr|pt)(?=\/|$)/, '');
}

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const normalizedPath = stripLocale(pathname);
  const isDashboard = normalizedPath.startsWith('/dashboard');
  const isPartnerPortal = normalizedPath.startsWith('/partner');
  const isDedicatedShell = hasDedicatedShell(normalizedPath);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const showNav = !isDashboard && !isPartnerPortal && !isDedicatedShell;

  // Roles come from the shared current-user snapshot (WAP-27) and only when
  // this shell renders its own nav; the workspace shells (/dashboard,
  // /employer, /partner, /counselor) already know the roles server-side.
  const { user } = useCurrentUser({ enabled: showNav });
  const userRoles = (user?.availablePortals ?? []) as { role: PortalRole; roleLabel: string; homeHref: string }[];

  // Determine current portal based on pathname (strip locale prefix first)
  const currentRole: PortalRole = normalizedPath.startsWith('/employer')
    ? 'employer'
    : normalizedPath.startsWith('/partner')
      ? 'partner'
      : normalizedPath.startsWith('/counselor')
        ? 'counselor'
        : normalizedPath.startsWith('/admin')
          ? 'admin'
          : 'member';

  // Body scroll lock when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      const scrollY = window.scrollY;
      document.body.classList.add('sidebar-open');
      document.body.style.top = `-${scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.classList.remove('sidebar-open');
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      document.body.classList.remove('sidebar-open');
      document.body.style.top = '';
    };
  }, [sidebarOpen]);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const showRoleSwitcher = userRoles.length > 1;

  return (
    <>
      {showNav && (
        <>
          {showRoleSwitcher && (
            <PortalRoleSwitcher userRoles={userRoles} currentRole={currentRole} />
          )}
          <button
            type="button"
            className="portal-hamburger md:wa-hidden"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          >
            <span className="portal-hamburger-bar" />
            <span className="portal-hamburger-bar" />
            <span className="portal-hamburger-bar" />
          </button>
          {sidebarOpen && (
            <div
              className="portal-drawer-overlay open"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <PortalNav 
            className={sidebarOpen ? 'open' : ''} 
            currentRole={currentRole}
            currentPath={pathname}
          />
        </>
      )}
      <div className="portal-touch-target">{children}</div>
    </>
  );
}
