'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import { getBestActiveHref, type ActiveNavLink } from '@/lib/nav/activeRoute';
import { MEMBER_PORTAL_NAV_ITEMS, navItemsForActiveRoute, type NavBadgeKey } from '@/lib/nav/portalNav';

/**
 * The rail's matching rule (href, aliases, `exact`) for each member route,
 * keyed by href. `/dashboard` appears twice (Home and "My account"); both are
 * `exact`, so the first row is kept.
 */
const RAIL_LINKS = new Map<string, ActiveNavLink>();
for (const link of navItemsForActiveRoute(MEMBER_PORTAL_NAV_ITEMS)) {
  if (!RAIL_LINKS.has(link.href)) RAIL_LINKS.set(link.href, link);
}

export default function MemberPortalTopNav({
  badgeCounts,
  hrefMap,
}: {
  badgeCounts?: Partial<Record<NavBadgeKey, number>>;
  /** Rewrite canonical /dashboard hrefs (used by /dev/member proofs). */
  hrefMap?: Record<string, string>;
}) {
  const locale = useLocale();
  // usePathname() keeps the locale prefix (/es/dashboard/messages) while the
  // tab hrefs are locale-less, so strip the active locale exactly as the rail
  // does (WorkspaceShell); otherwise no tab is current on /es, /fr or /pt.
  const rawPathname = usePathname() ?? '/dashboard';
  const pathname =
    rawPathname === `/${locale}`
      ? '/'
      : rawPathname.startsWith(`/${locale}/`)
        ? rawPathname.slice(locale.length + 1)
        : rawPathname;
  const t = useTranslations('nav');
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const setVar = () => {
      document.documentElement.style.setProperty('--member-portal-top-nav-h', `${el.offsetHeight}px`);
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--member-portal-top-nav-h');
    };
  }, []);

  /**
   * The strip now carries 12 destinations instead of 7, so on a phone the
   * current one is usually off-screen. Centre it inside the strip on every
   * navigation. Scrolling the list directly (rather than `scrollIntoView`)
   * keeps the page itself from jumping.
   */
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = activeItemRef.current;
    if (!list || !item) return;
    const target = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    const max = Math.max(0, list.scrollWidth - list.clientWidth);
    const next = Math.max(0, Math.min(target, max));
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ left: next, behavior: 'auto' });
    } else {
      list.scrollLeft = next;
    }
  }, [pathname]);

  const remap = (href: string) => hrefMap?.[href] ?? href;

  /**
   * Mobile exposed only a handful of the member IA; the rest hid behind the
   * hamburger. These 12 cover the daily destinations. Proofs pass hrefMap to
   * stay on /dev/member; omit unmapped tabs.
   */
  const tabs = [
    { canonical: '/dashboard', label: t('dashboard'), icon: 'home' },
    { canonical: '/dashboard/program', label: t('myProgram'), icon: 'school' },
    { canonical: '/dashboard/jobs', label: t('jobBoard'), icon: 'work' },
    { canonical: '/dashboard/readiness', label: t('myProgress'), icon: 'check_circle' },
    { canonical: '/dashboard/messages', label: t('counselorChat'), icon: 'chat', badgeKey: 'counselor_messages_unread' as NavBadgeKey },
    { canonical: '/dashboard/ai-tools', label: t('careerToolkit'), icon: 'auto_awesome' },
    { canonical: '/dashboard/missions', label: t('skillMissions'), icon: 'flag' },
    { canonical: '/dashboard/job-applications', label: t('jobApplications'), icon: 'assignment', badgeKey: 'applications_new' as NavBadgeKey },
    { canonical: '/dashboard/resume', label: t('resume'), icon: 'description' },
    { canonical: '/dashboard/learning', label: t('learningHub'), icon: 'menu_book' },
    { canonical: '/dashboard/certifications', label: t('myCertificates'), icon: 'workspace_premium' },
    { canonical: '/dashboard/profile', label: t('profile'), icon: 'person' },
  ].filter((tab) => !hrefMap || tab.canonical in hrefMap);

  /**
   * The current tab is chosen the way the rail chooses its row: the longest
   * matching href or alias wins, an `exact` row (Home) only matches its own
   * pathname, and a route with no tab marks nothing current. Each tab carries
   * its rail row's aliases, so /dashboard/ai-tools/application-tracker is Job
   * applications (not AI Career Tools) and /dashboard/settings is Profile.
   * With hrefMap (dev proofs) the remapped href is matched as well.
   */
  const activeCanonical = getBestActiveHref(
    pathname,
    tabs.map((tab) => {
      const rail = RAIL_LINKS.get(tab.canonical);
      const remapped = remap(tab.canonical);
      return {
        href: tab.canonical,
        aliases: [...(remapped !== tab.canonical ? [remapped] : []), ...(rail?.aliases ?? [])],
        exact: rail?.exact,
      };
    }),
  );

  return (
    <nav ref={navRef} className="member-portal-top-nav" aria-label={t('memberPortal')}>
      <ul ref={listRef} className="member-portal-top-nav__list">
        {tabs.map((tab) => {
          const href = remap(tab.canonical);
          const active = tab.canonical === activeCanonical;
          const badge = tab.badgeKey ? badgeCounts?.[tab.badgeKey] : undefined;
          return (
            <li
              key={tab.canonical}
              ref={active ? activeItemRef : undefined}
              className="member-portal-top-nav__item"
            >
              <Link
                href={href}
                prefetch={tab.canonical === '/dashboard'}
                className={`member-portal-top-nav__link${active ? ' member-portal-top-nav__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <LegacyGlyph name={tab.icon} size={17} className="member-portal-top-nav__icon" />
                <span className="member-portal-top-nav__label">{tab.label}</span>
                {badge && badge > 0 ? (
                  <span className="member-portal-top-nav__badge" aria-label={
                    // The applications badge counts the member's own pending
                    // applications, not unread items (WAP-263 item 3).
                    tab.badgeKey === 'applications_new'
                      ? t('pendingApplicationsCount', { count: badge })
                      : t('unreadCount', { count: badge })
                  }>
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <span className="member-portal-top-nav__edge-fade" aria-hidden="true" />
    </nav>
  );
}

// Ensure the component is treeshakeable when imported via dynamic.
export const _topNavStyleRef: CSSProperties = {};
