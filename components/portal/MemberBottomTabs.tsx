'use client';

import type { Ref } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Briefcase, Ellipsis, GraduationCap, Home, MessageSquare, type LucideIcon } from 'lucide-react';
import { getBestActiveHref, type ActiveNavLink } from '@/lib/nav/activeRoute';
import { MEMBER_PORTAL_NAV_ITEMS, navItemsForActiveRoute, type NavBadgeKey } from '@/lib/nav/portalNav';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { localizeHref } from '@/lib/i18n/localizeHref';
import NavigationPending from './NavigationPending';
import styles from './MemberBottomTabs.module.css';

/**
 * The rail's matching rule (href, aliases, `exact`) for every member route.
 * The current tab is chosen the way the rail chooses its row (longest match
 * wins, Home only matches itself), so a page that belongs to another rail row
 * (Job applications, Skill missions, ...) marks no tab current.
 */
const RAIL_LINKS: ActiveNavLink[] = navItemsForActiveRoute(MEMBER_PORTAL_NAV_ITEMS);

type TabKey = 'tabHome' | 'tabProgram' | 'tabJobs' | 'tabMessages';

const TABS: ReadonlyArray<{
  canonical: string;
  labelKey: TabKey;
  Icon: LucideIcon;
  badgeKey?: NavBadgeKey;
}> = [
  { canonical: '/dashboard', labelKey: 'tabHome', Icon: Home },
  { canonical: '/dashboard/program', labelKey: 'tabProgram', Icon: GraduationCap },
  { canonical: '/dashboard/jobs', labelKey: 'tabJobs', Icon: Briefcase },
  { canonical: '/dashboard/messages', labelKey: 'tabMessages', Icon: MessageSquare, badgeKey: 'counselor_messages_unread' },
];

export type MemberBottomTabsProps = {
  /** Existing nav badge counts (`/api/portal/nav-badges`); Messages reads the unread count. */
  badgeCounts?: Partial<Record<NavBadgeKey, number>>;
  /** Rewrite canonical /dashboard hrefs (used by /dev/member proofs). */
  hrefMap?: Record<string, string>;
  /** The phone drawer is open: the bar goes inert behind it and More reports expanded. */
  menuOpen?: boolean;
  /**
   * Opens the shell's phone drawer (the same drawer the hamburger opens).
   * Receives the More button so the drawer can return focus to it on close.
   */
  onMore: (trigger: HTMLButtonElement) => void;
  /** The More button, for the shell's early-tap replay and focus return. */
  moreRef?: Ref<HTMLButtonElement>;
};

/**
 * Phone-first member navigation: a fixed bottom tab bar (Home, Program, Jobs,
 * Messages, More) shown at or below the drawer breakpoint (768px). It is the
 * member counterpart of the staff `MobileBottomNav` and is never rendered for
 * staff roles (WorkspaceShell gates it on `portalRole === 'member'`), so it
 * takes over the shared `nav#mobile-bottom-nav` contract: `CookieConsentBanner`
 * measures that id to sit above the bar, and the root layout's "Skip to
 * navigation" link targets it.
 *
 * The four destinations are plain server-rendered links with `aria-current`
 * from the pathname, so they navigate before hydration. More is a button, not
 * a fifth link: it carries `data-early-tap="more"`, so a tap before hydration
 * is recorded by the inline early-tap script and replayed by WorkspaceShell,
 * the one owner of both early-tap kinds (`menu` for the hamburger, `more` for
 * this button), which opens the drawer once it mounts.
 */
export default function MemberBottomTabs({ badgeCounts, hrefMap, menuOpen = false, onMore, moreRef }: MemberBottomTabsProps) {
  // Portal paths may carry an explicit locale (/es/dashboard/jobs) or rely on
  // the language cookie (/dashboard/jobs). Match the canonical route, then keep
  // an explicit URL locale on the destinations.
  const rawPathname = usePathname() ?? '/dashboard';
  const { locale: explicitLocale, pathnameWithoutLocale: pathname } = splitLocalePrefix(rawPathname);
  const t = useTranslations('nav');

  const remap = (href: string) => hrefMap?.[href] ?? href;
  const activeCanonical = getBestActiveHref(
    pathname,
    RAIL_LINKS.map((link) => {
      const remapped = remap(link.href);
      return remapped !== link.href ? { ...link, aliases: [...(link.aliases ?? []), remapped] } : link;
    }),
  );

  return (
    <nav
      id="mobile-bottom-nav"
      tabIndex={-1}
      className={styles.bar}
      aria-label={t('memberTabsLabel')}
      data-member-bottom-tabs=""
      inert={menuOpen}
    >
      <ul className={styles.list}>
        {TABS.filter((tab) => !hrefMap || tab.canonical in hrefMap).map(({ canonical, labelKey, Icon, badgeKey }) => {
          const mapped = remap(canonical);
          const href = explicitLocale ? localizeHref(mapped, explicitLocale) : mapped;
          const active = canonical === activeCanonical;
          const badge = badgeKey ? (badgeCounts?.[badgeKey] ?? 0) : 0;
          return (
            <li key={canonical} className={styles.item}>
              <Link
                href={href}
                prefetch={false}
                className={`${styles.tab} wa-kit-focus`}
                aria-current={active ? 'page' : undefined}
                // Visible label first, then the count, so the name still contains the label.
                aria-label={badge > 0 ? `${t(labelKey)}, ${t('unreadCount', { count: badge })}` : undefined}
                data-active={active ? 'true' : undefined}
              >
                <span className={styles.iconWrap}>
                  <Icon size={20} strokeWidth={active ? 2.25 : 2} aria-hidden />
                  {badge > 0 ? (
                    <span className={styles.badge} aria-hidden="true">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  ) : null}
                </span>
                <span className={styles.label}>{t(labelKey)}</span>
                <NavigationPending />
              </Link>
            </li>
          );
        })}
        <li className={styles.item}>
          <button
            ref={moreRef}
            type="button"
            className={`${styles.tab} wa-kit-focus`}
            data-early-tap="more"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="workspace-sidebar"
            onClick={(event) => onMore(event.currentTarget)}
          >
            <span className={styles.iconWrap}>
              <Ellipsis size={20} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.label}>{t('tabMore')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
