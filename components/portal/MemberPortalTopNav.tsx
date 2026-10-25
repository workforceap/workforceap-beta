'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import { getBestActiveHref, type ActiveNavLink } from '@/lib/nav/activeRoute';
import { MEMBER_PORTAL_NAV_ITEMS, navItemsForActiveRoute, type NavBadgeKey } from '@/lib/nav/portalNav';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { localizeHref } from '@/lib/i18n/localizeHref';

/**
 * The rail's matching rule (href, aliases, `exact`) for each member route,
 * keyed by href. Keep the first row if future rail configuration repeats a
 * destination; the member rail currently has unique hrefs.
 */
const RAIL_LINKS = new Map<string, ActiveNavLink>();
for (const link of navItemsForActiveRoute(MEMBER_PORTAL_NAV_ITEMS)) {
  if (!RAIL_LINKS.has(link.href)) RAIL_LINKS.set(link.href, link);
}

/** Centre a destination horizontally without scrolling the document. */
function centerRailItem(list: HTMLUListElement, item: HTMLElement) {
  const target = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
  const max = Math.max(0, list.scrollWidth - list.clientWidth);
  const next = Math.max(0, Math.min(target, max));
  if (typeof list.scrollTo === 'function') {
    list.scrollTo({ left: next, behavior: 'auto' });
  } else {
    list.scrollLeft = next;
  }
}

export default function MemberPortalTopNav({
  badgeCounts,
  hrefMap,
}: {
  badgeCounts?: Partial<Record<NavBadgeKey, number>>;
  /** Rewrite canonical /dashboard hrefs (used by /dev/member proofs). */
  hrefMap?: Record<string, string>;
}) {
  // Portal paths may use an explicit locale (/es/dashboard/messages) or rely
  // on the language cookie (/dashboard/messages). Match the canonical route,
  // then retain an explicit URL locale when rendering phone tab destinations.
  const rawPathname = usePathname() ?? '/dashboard';
  const { locale: explicitLocale, pathnameWithoutLocale: pathname } = splitLocalePrefix(rawPathname);
  const t = useTranslations('nav');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const navRef = useRef<HTMLElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const setVar = () => {
      document.documentElement.style.setProperty('--member-portal-top-nav-h', `${el.offsetHeight}px`);
      // Compact chrome can expand after native keyboard focus scrolls the page.
      // Keep that focused destination visible as the rail geometry changes.
      const list = listRef.current;
      const focused = el.querySelector<HTMLElement>('.member-portal-top-nav__link:focus-visible');
      const item = focused?.parentElement;
      if (list && item && list.contains(item)) centerRailItem(list, item);
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
   * Centre a primary destination inside the strip. Secondary destinations
   * stay visible in the utility row, so no page-level scroll is needed.
   */
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // A keyboard user can reach the server-rendered links before hydration.
    // Preserve that destination instead of moving the strip back to the page
    // that happened to be active when this effect first ran.
    const focusedItem = list.querySelector<HTMLElement>('.member-portal-top-nav__link:focus')?.parentElement;
    const item = focusedItem ?? activeItemRef.current;
    if (!item) return;
    centerRailItem(list, item);
  }, [pathname]);

  // No early-tap replay here. The strip is display:none on phones while the
  // member bottom tab bar is mounted (css/portal-main-extracted.css) and above
  // 768px (css/portal.css), so no tap can land on this button before
  // hydration, and the shared `more` early-tap kind now belongs to the bar's
  // More button, claimed by WorkspaceShell alone (lib/portal/earlyShellTap.ts).

  /**
   * Escape closes the open "More pages" list and puts focus back on its button
   * (the same disclosure contract as DashboardProgramSelector). Outside taps
   * deliberately do not close it: the list is in flow and pushes the page down,
   * so dismissing it on a stray tap would shift the page under the finger.
   */
  const onNavKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || !moreOpen) return;
    event.preventDefault();
    setMoreOpen(false);
    moreBtnRef.current?.focus();
  };

  const remap = (href: string) => hrefMap?.[href] ?? href;

  /**
   * Five daily destinations match the desktop rail. The preassessment stays
   * directly visible (an established support requirement). Every other
   * existing shortcut remains in the expandable page list; the current one
   * is also visible while that list is closed.
   */
  const tabs = [
    { canonical: '/dashboard', label: t('dashboard'), icon: 'home', primary: true },
    { canonical: '/dashboard/program', label: t('myProgram'), icon: 'school', primary: true },
    { canonical: '/dashboard/jobs', label: t('jobBoard'), icon: 'work', primary: true },
    { canonical: '/dashboard/ai-tools', label: t('careerToolkit'), icon: 'auto_awesome', primary: true },
    { canonical: '/dashboard/messages', label: t('counselorChat'), icon: 'chat', badgeKey: 'counselor_messages_unread' as NavBadgeKey, primary: true },
    // Ops (10/8/26): members were not finding the preassessment; keep it a tap away.
    { canonical: '/dashboard/assessment', label: t('wioaPreassessment'), icon: 'assignment_turned_in' },
    { canonical: '/dashboard/readiness', label: t('myProgress'), icon: 'check_circle' },
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

  type Tab = (typeof tabs)[number];
  const primary = tabs.filter((tab) => tab.primary);
  const assessment = tabs.find((tab) => tab.canonical === '/dashboard/assessment');
  const secondary = tabs.filter((tab) => !tab.primary && tab !== assessment);
  const currentSecondary = secondary.find((tab) => tab.canonical === activeCanonical);
  const extraPages = secondary.filter((tab) => tab !== currentSecondary);

  const renderLink = (tab: Tab, inPrimary = false) => {
    const mappedHref = remap(tab.canonical);
    const href = explicitLocale ? localizeHref(mappedHref, explicitLocale) : mappedHref;
    const active = tab.canonical === activeCanonical;
    const badge = tab.badgeKey ? badgeCounts?.[tab.badgeKey] : undefined;
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={() => setMoreOpen(false)}
        onFocus={(event) => {
          const list = listRef.current;
          const link = event.currentTarget;
          const item = link.parentElement;
          if (!inPrimary || !list || !item || !link.matches(':focus-visible')) return;
          centerRailItem(list, item);
          // Recheck after the native focus scroll settles. Only the link that
          // still owns keyboard focus may move the rail, never the document.
          requestAnimationFrame(() => {
            if (listRef.current === list && document.activeElement === link && link.matches(':focus-visible')) {
              centerRailItem(list, item);
            }
          });
        }}
        className={`member-portal-top-nav__link${active ? ' member-portal-top-nav__link--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <LegacyGlyph name={tab.icon} size={17} className="member-portal-top-nav__icon" />
        <span className="member-portal-top-nav__label">{tab.label}</span>
        {badge && badge > 0 ? (
          <span className="member-portal-top-nav__badge" aria-label={
            tab.badgeKey === 'applications_new'
              ? t('pendingApplicationsCount', { count: badge })
              : t('unreadCount', { count: badge })
          }>{badge > 9 ? '9+' : badge}</span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav ref={navRef} className="member-portal-top-nav" aria-label={t('memberPortal')} onKeyDown={onNavKeyDown}>
      <ul ref={listRef} className="member-portal-top-nav__list">
        {primary.map((tab) => (
            <li
              key={tab.canonical}
              ref={tab.canonical === activeCanonical ? activeItemRef : undefined}
              className="member-portal-top-nav__item"
            >
              {renderLink(tab, true)}
            </li>
        ))}
      </ul>
      {(assessment || currentSecondary || extraPages.length > 0) && (
        <div className="member-portal-top-nav__utilities">
          {assessment && renderLink(assessment)}
          {currentSecondary && renderLink(currentSecondary)}
          {extraPages.length > 0 && (
            <button
              ref={moreBtnRef}
              type="button"
              className="member-portal-top-nav__link member-portal-top-nav__more"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <LegacyGlyph name="menu" size={17} className="member-portal-top-nav__icon" />
              <span>{t('morePages')}</span>
            </button>
          )}
        </div>
      )}
      <ul id={moreId} className="member-portal-top-nav__extra" hidden={!moreOpen}>
        {extraPages.map((tab) => <li key={tab.canonical}>{renderLink(tab)}</li>)}
      </ul>
    </nav>
  );
}

// Ensure the component is treeshakeable when imported via dynamic.
export const _topNavStyleRef: CSSProperties = {};
