'use client';

import LocalizedLink from '@/components/LocalizedLink';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { NavBadgeKey } from '@/lib/nav/portalNav';
import { isActiveRoute, type ActiveNavSearch } from '@/lib/nav/activeRoute';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

/**
 * Responsive breakpoint for mobile nav visibility
 * Matches Tailwind md breakpoint (768px)
 */
const MOBILE_NAV_BREAKPOINT = 768;

// `labelKey` resolves against the `nav.mobileBottomNav` message namespace
// (see messages/*.json) so this persistent piece of mobile chrome renders in
// the active locale instead of hardcoded English.
const MARKETING_TABS = [
  { href: '/', labelKey: 'marketing.home', icon: 'home' },
  { href: '/find-your-path', labelKey: 'marketing.path', icon: 'explore' },
  { href: '/programs', labelKey: 'marketing.programs', icon: 'school' },
  { href: '/apply', labelKey: 'marketing.apply', icon: 'assignment_turned_in' },
];

const EMPLOYER_TABS = [
  { href: '/employer', labelKey: 'employer.overview', icon: 'dashboard' },
  { href: '/employer/jobs', labelKey: 'employer.jobs', icon: 'work' },
  { href: '/employer/pipeline', labelKey: 'employer.pipeline', icon: 'account_tree' },
  { href: '/employer/messages', labelKey: 'employer.messages', icon: 'chat' },
];

const COUNSELOR_TABS = [
  { href: '/counselor/today', labelKey: 'counselor.today', icon: 'calendar_month' },
  { href: '/counselor/inbox', labelKey: 'counselor.inbox', icon: 'inbox' },
  { href: '/counselor/students', labelKey: 'counselor.members', icon: 'groups' },
  { href: '/counselor/messages', labelKey: 'counselor.messages', icon: 'chat' },
];

const PARTNER_TABS = [
  { href: '/partner', labelKey: 'partner.overview', icon: 'dashboard' },
  { href: '/partner/referred-members', labelKey: 'partner.members', icon: 'groups' },
  { href: '/partner/messages', labelKey: 'partner.messages', icon: 'chat' },
  { href: '/partner/milestones', labelKey: 'partner.milestones', icon: 'flag' },
  { href: '/partner/outcomes', labelKey: 'partner.outcomes', icon: 'bar_chart' },
];

type BottomTab = {
  href: string;
  labelKey: string;
  icon: string;
  tourTarget?: string;
};

/**
 * Admin tabs follow the rail's role gate (lib/nav/portalNav.ts): /admin/messages
 * is super-admin only and redirects an org admin back to /admin, so an org admin
 * gets Applications — the decision workbench — in that slot instead (WAP-190).
 * Like the rail row, Applications is current on `?queue=applications` only,
 * not on the workbench's other queues or its bare metrics view.
 */
const ADMIN_SUPER_TABS: BottomTab[] = [
  { href: '/admin', labelKey: 'admin.today', icon: 'home' },
  { href: '/admin/students', labelKey: 'admin.students', icon: 'groups' },
  { href: '/admin/messages', labelKey: 'admin.messages', icon: 'chat' },
];

const ADMIN_ORG_TABS: BottomTab[] = [
  { href: '/admin', labelKey: 'admin.today', icon: 'home' },
  { href: '/admin/students', labelKey: 'admin.students', icon: 'groups' },
  { href: '/admin/command-center?queue=applications', labelKey: 'admin.applications', icon: 'assignment_turned_in' },
];

interface MobileBottomNavProps {
  variant?: 'marketing' | 'portal' | 'employer' | 'counselor' | 'partner' | 'admin';
  badgeCounts?: Partial<Record<NavBadgeKey, number>>;
  /** Admin variant only: the same super-admin context the admin rail filters on. */
  superAdmin?: boolean;
  /**
   * The page's query string (`useSearchParams()`), passed by the portal shell
   * so a tab whose href carries a query (admin Applications) is matched the
   * way the rail matches it (lib/nav/activeRoute.ts). Without it such a tab is
   * never current. Read here as a prop, not a hook, so the marketing bar never
   * depends on search params.
   */
  search?: ActiveNavSearch;
}

function prefetchForBottomTab(variant: MobileBottomNavProps['variant'], href: string): boolean {
  if (variant === 'marketing') {
    return href === '/apply' || href === '/programs' || href === '/find-your-path';
  }
  return false;
}

export default function MobileBottomNav({ variant = 'marketing', badgeCounts, superAdmin = false, search }: MobileBottomNavProps) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('nav.mobileBottomNav');
  const tNav = useTranslations('nav');
  // Member portal switched from bottom-tab to sticky-top horizontal-scroll nav
  // (/plan-design-review Decision 3, 2026-04-25). The top nav is rendered by
  // WorkspaceShell. Pages that still call <MobileBottomNav variant="portal"/>
  // become no-ops so the change ships without touching 40+ page files.
  if (variant === 'portal') return null;
  const tabs: BottomTab[] =
    variant === 'employer' ? EMPLOYER_TABS
    : variant === 'counselor' ? COUNSELOR_TABS
    : variant === 'partner' ? PARTNER_TABS
    : variant === 'admin' ? (superAdmin ? ADMIN_SUPER_TABS : ADMIN_ORG_TABS)
    : MARKETING_TABS;
  return (
    <>
      {/* Mobile-only visibility: hidden on desktop (≥768px) */}
      {/* Bottom clearance: `marketing.css` — middleware `html.wap-reserve-mobile-bottom-nav` + `html:has(nav#mobile-bottom-nav)` */}
      <style>{`
        @media (min-width: ${MOBILE_NAV_BREAKPOINT}px) {
          .mobile-bottom-nav-root {
            display: none !important;
          }
        }
        @media (max-width: ${MOBILE_NAV_BREAKPOINT - 1}px) {
          .mobile-bottom-nav-root {
            display: flex !important;
          }
        }
      `}</style>
      <nav
        id="mobile-bottom-nav"
        aria-label={t('ariaLabel')}
        className={`marketing-bottom-nav mobile-bottom-nav-root mobile-bottom-nav--${variant}`}
        style={{
          position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        zIndex: 60,
        display: 'flex',
        justifyContent: variant === 'marketing' ? 'space-around' : 'space-between',
        alignItems: 'center',
        gap: variant === 'marketing' ? 0 : '0.25rem',
        paddingLeft: variant === 'marketing' ? '0.5rem' : '0.25rem',
        paddingRight: variant === 'marketing' ? '0.5rem' : '0.25rem',
        paddingTop: '0.5rem',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {tabs.map((tab) => {
        const { href, labelKey, icon } = tab;
        const label = t(labelKey);
        const tourTarget = tab.tourTarget;
        const exactMatch = ['/', '/dashboard', '/admin', '/employer', '/counselor', '/partner'];
        const isActive = href.includes('?')
          ? isActiveRoute(pathname, href, [], false, search)
          : exactMatch.includes(href)
            ? pathname === href
            : pathname.startsWith(href);
        // Member badge logic moved to MemberPortalTopNav. Other variants do not
        // surface unread-message badges in the bottom nav today.
        const b = 0;
        const showBadge = b > 0;
        return (
          <LocalizedLink
            key={href}
            href={href}
            prefetch={prefetchForBottomTab(variant, href)}
            className={`marketing-bottom-nav__link${isActive ? ' marketing-bottom-nav__link--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            {...(tourTarget ? { 'data-tour': tourTarget } : {})}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <LegacyGlyph name={icon} size={28} strokeWidth={isActive ? 2.5 : 2} />
              {b > 0 ? (
                <span
                  aria-label={tNav('unreadCount', { count: b })}
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'var(--color-accent, #ad2c4d)',
                    border: '1.5px solid var(--color-white, #fff)',
                    color: '#fff',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    lineHeight: 1,
                  }}
                >
                  {b > 99 ? '99+' : b}
                </span>
              ) : null}
            </span>
            <span className="marketing-bottom-nav__label">{label}</span>
          </LocalizedLink>
        );
      })}
      </nav>
    </>
  );
}
