'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Menu, ShieldHalf, X } from 'lucide-react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import { getBestActiveHref } from '@/lib/nav/activeRoute';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import {
  type PortalNavItem,
  type PortalRole,
  type NavBadgeKey,
  type NavTab,
  NAV_GROUP_LABELS,
  GROUP_ORDER,
  NAV_TAB_META,
  NAV_TAB_ORDER,
  navItemsForActiveRoute,
  badgeTotalForItem,
  getActiveTab,
} from '@/lib/nav/portalNav';
import { withContextualToolRow } from '@/lib/nav/memberToolRoutes';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import SuperAdminViewSwitcher, { useIsSuperAdmin } from '@/components/super-admin-view-switcher';
import PortalHeaderActions from './PortalHeaderActions';
import PortalRoleSwitcher from './PortalRoleSwitcher';
import { SignOutButton } from './SignOutButton';
import MobileBottomNav from '@/components/MobileBottomNav';
import MemberPortalTopNav from './MemberPortalTopNav';
import GlobalSearch from './GlobalSearch';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';
import type { MemberShellIdentity } from '@/lib/member/memberIdentity';
import { Avatar } from '@/components/portal/kit/Avatar';
import LanguageToggle from '@/components/portal/LanguageToggle';
import ThemeSelector from '@/components/theme/ThemeSelector';
import UnreviewedLocaleBanner from '@/components/portal/UnreviewedLocaleBanner';
import { useTranslations, useLocale } from 'next-intl';
import { useWorkspaceMobileScrollChrome } from '@/hooks/useWorkspaceMobileScrollChrome';

// Map non-member portal roles to MobileBottomNav variants. Member uses
// MemberPortalTopNav (sticky-top horizontal-scroll) per /plan-design-review
// Decision 3 (2026-04-25).
const ROLE_TO_NAV_VARIANT: Partial<Record<PortalRole, 'employer' | 'partner' | 'counselor' | 'admin'>> = {
  employer: 'employer',
  partner: 'partner',
  counselor: 'counselor',
  admin: 'admin',
};

/**
 * Who is signed in (WAP-101). One link — avatar + name (+ email) — to
 * Profile & settings, rendered in the header and repeated in the mobile
 * drawer. Sign out stays its own control; identity is never the sign-out.
 */
function ShellIdentity({
  identity,
  variant,
  onNavigate,
  title,
}: {
  identity: MemberShellIdentity;
  variant: 'header' | 'sidebar';
  onNavigate?: () => void;
  title: string;
}) {
  const base = variant === 'header' ? 'workspace-shell-identity' : 'workspace-sidebar-identity';
  return (
    <Link
      href={identity.href}
      prefetch={false}
      className={`${base} wa-kit-focus`}
      onClick={onNavigate}
      title={title}
      data-testid={`${base}-link`}
    >
      <Avatar
        initials={identity.initials}
        size={variant === 'header' ? 30 : 36}
        src={identity.avatarUrl ?? undefined}
        className={`${base}__avatar`}
      />
      <span className={`${base}__text`}>
        <span className={`${base}__name`}>{identity.name}</span>
        {identity.email ? <span className={`${base}__email`}>{identity.email}</span> : null}
      </span>
    </Link>
  );
}

export default function WorkspaceShell({
  portalRole,
  navItems,
  identity,
  workspaceLabel,
  contextLabel,
  minimalMobileHeader = false,
  superAdmin,
  superAdminImpersonating,
  superAdminBackHref,
  superAdminBackLabel,
  topBanner,
  footer,
  headerBadge,
  contextLogoUrl,
  marketingSiteHref,
  marketingSiteLabel,
  navHrefMap,
  showResumeUploadHint,
  readOnlyAudit = false,
  portalRoles,
  attributionLabel,
  partnerAccentColor,
  orgPrimaryColor,
  orgAccentColor,
  children,
}: {
  portalRole: PortalRole;
  navItems: PortalNavItem[];
  /** Signed-in member identity for the shell (name, initials/avatar, profile link). */
  identity?: MemberShellIdentity | null;
  workspaceLabel: string;
  contextLabel: string;
  /** Reduce header chrome on mobile when bottom nav is primary (member portal). */
  minimalMobileHeader?: boolean;
  /** Optional square logo next to company name (employer portal). */
  contextLogoUrl?: string | null;
  superAdmin?: boolean;
  /** True when super_admin is viewing another org (cookie), not their own portal row */
  superAdminImpersonating?: boolean;
  superAdminBackHref?: string;
  superAdminBackLabel?: string;
  topBanner?: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional pill next to context (e.g. Hiring Partner tier) */
  headerBadge?: string;
  /** Public marketing site — shown prominently in header when set (e.g. member portal). */
  marketingSiteHref?: string;
  marketingSiteLabel?: string;
  /** Rewrite canonical member nav hrefs (e.g. /dev/member proofs). */
  navHrefMap?: Record<string, string>;
  /** Member: prompt to upload resume when none on file */
  showResumeUploadHint?: boolean;
  /** Authenticated audit capability: render the shell without polling providers or mutable notification state. */
  readOnlyAudit?: boolean;
  /** Optional set of role-switch targets for authenticated multi-role users */
  portalRoles?: PortalSwitcherRole[];
  /**
   * Small "Powered by …" attribution shown on the right of the header.
   * Used in white-labeled partner portals where the partner brand owns the left side.
   */
  attributionLabel?: string;
  /**
   * Optional partner-scoped accent color (hex). When provided, exposed as the
   * `--partner-accent` CSS variable on the shell root so partner-specific UI
   * can opt in without overriding the global `--color-accent`.
   */
  partnerAccentColor?: string | null;
  /** Org-level primary brand color (hex). Exposed as `--org-primary-color`. */
  orgPrimaryColor?: string | null;
  /** Org-level accent/secondary brand color (hex). Exposed as `--org-accent-color`. */
  orgAccentColor?: string | null;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  // next/navigation usePathname() keeps the locale prefix (e.g. /en/admin), but
  // nav hrefs are locale-less (/admin) — strip the active locale so active-route
  // matching (and the crimson active rail item) works across every portal.
  const rawPathname = usePathname() ?? '';
  const pathname =
    rawPathname === `/${locale}`
      ? '/'
      : rawPathname.startsWith(`/${locale}/`)
        ? rawPathname.slice(locale.length + 1)
        : rawPathname;
  // AI Career Tools has ~22 tool routes and no rail row of its own, which used to
  // leave the rail highlighting the hub (or nothing) on every one of them.
  // Rather than 22 permanent rows, the rail grows exactly ONE contextual row —
  // the tool you are actually in — nested under AI Career Tools, and drops it
  // again the moment you leave. `withContextualToolRow` is a no-op on the hub
  // itself and on every non-toolkit route.
  const { items: railNavItems, toolItem: contextualToolItem } =
    portalRole === 'member' ? withContextualToolRow(navItems, pathname) : { items: navItems, toolItem: null };
  const activeHref = getBestActiveHref(pathname, navItemsForActiveRoute(railNavItems));
  const hasTabs = railNavItems.some((i) => i.tab);
  const activeTab = hasTabs ? getActiveTab(pathname, railNavItems) : null;
  // Members: left command-rail always visible from 769px up (laptops included —
  // ops asked that the side menu never hide behind a hamburger on a laptop),
  // MemberPortalTopNav on small screens (<=768). Do not also paint the
  // overflowing flat tab bar (FINDING-023). Other roles still get tab-filtered rails.
  const desktopNavItems =
    portalRole === 'member'
      ? railNavItems
      : hasTabs && activeTab
        ? railNavItems.filter((i) => i.tab === activeTab)
        : railNavItems;
  const mobileDrawerNavItems = railNavItems;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState(false);
  const [badges, setBadges] = useState<Partial<Record<NavBadgeKey, number>>>({});
  const [badgeFetchError, setBadgeFetchError] = useState(false);
  const isCollapsedDesktop = collapsed && wide;
  const isMobileDrawer = drawerOpen && !wide;
  const isSuperAdmin = useIsSuperAdmin(Boolean(superAdmin));
  const tNav = useTranslations('nav');
  const tWorkspace = useTranslations('workspace');
  const tGroup = useTranslations('group');
  /**
   * Translates a nav label string using the appropriate namespace.
   * Falls back to the original English string if no key is found.
   */
  const translateLabel = (label: string): string => {
    // Workspace labels
    const wsMap: Record<string, string> = {
      'WorkforceAP site': tWorkspace('publicSite'),
      'Member portal': tWorkspace('member'),
      'Employer portal': tWorkspace('employer'),
      'Partner portal': tWorkspace('partner'),
      'Counselor portal': tWorkspace('counselor'),
      'Admin workspace': tWorkspace('admin'),
    };
    if (label in wsMap) return wsMap[label];
    // Group labels
    const grpMap: Record<string, string> = {
      'Workflows': tGroup('workflows'),
      'Insights': tGroup('insights'),
      'Manage': tGroup('manage'),
    };
    if (label in grpMap) return grpMap[label];
    // Nav labels
    const navMap: Record<string, string> = {
      'Home': tNav('dashboard'),
      'My program': tNav('myProgram'),
      'My Classes': tNav('training'),
      'My certificates': tNav('myCertificates'),
      'My career plan': tNav('careerPlan'),
      'WIOA Qualification': tNav('wioaQualification'),
      'Job board': tNav('jobBoard'),
      'Job applications': tNav('jobApplications'),
      'Resume': tNav('resume'),
      'My progress': tNav('myProgress'),
      'Career Toolkit': tNav('careerToolkit'),
      'AI Career Tools': tNav('careerToolkit'),
      'AI Counselor': tNav('aiCounselor'),
      'Learning Hub': tNav('learningHub'),
      'Find your career': tNav('findYourCareer'),
      'Training preassessment': tNav('trainingPreassessment'),
      'Weekly recap': tNav('weeklyRecap'),
      'Counselor Chat': tNav('counselorChat'),
      'Advisor Chat': tNav('counselorChat'),
      'Messages': tNav('counselorChat'),
      'Resources': tNav('resources'),
      'Help & Support': tNav('help'),
      'Member Guide': tNav('memberGuide'),
      'Profile & settings': tNav('profile'),
      'My account': tNav('myAccount'),
      'Sign out': tNav('signOut'),
    };
    if (label in navMap) return navMap[label];
    return label;
  };
  /**
   * Name of the page the member is on. Fills the otherwise-empty mobile header
   * band (the tagline is hidden below 769px), so a phone finally says where you
   * are — including inside an AI Career Tools tool.
   */
  const currentPageItem = railNavItems.find((item) => item.href === activeHref);
  const currentPageLabel = currentPageItem ? translateLabel(currentPageItem.label) : null;
  const mainRef = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const trapRef = useFocusTrap(isMobileDrawer, closeDrawer);
  useWorkspaceMobileScrollChrome();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const collapseKey = `wa_nav_collapsed_${portalRole}`;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    try {
      if ('inert' in el) {
        (el as HTMLElement & { inert?: boolean }).inert = isMobileDrawer;
      }
    } catch {
      /* Safari / older browsers — skip; drawer overlay still blocks interaction */
    }
    return () => {
      try {
        if ('inert' in el) {
          (el as HTMLElement & { inert?: boolean }).inert = false;
        }
      } catch {
        /* ignore */
      }
    };
  }, [isMobileDrawer]);

  // Body scroll lock with scroll position preservation
  useEffect(() => {
    if (isMobileDrawer) {
      const scrollY = window.scrollY;
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add('sidebar-open');
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
  }, [isMobileDrawer]);

  useEffect(() => {
    // Persistent left rail from tablet-landscape / laptop widths up (>=769px).
    // Below that, members get MemberPortalTopNav and other roles the drawer.
    // Keep in sync with the `(min-width: 769px)` shell rules in
    // css/portal-main-extracted.css.
    const mq = window.matchMedia('(min-width: 769px)');
    const fn = () => setWide(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  /** Enables `html[data-portal-role="…"]` rules in main.css (e.g. member mobile header chrome). */
  useEffect(() => {
    document.documentElement.setAttribute('data-portal-role', portalRole);
    return () => {
      document.documentElement.removeAttribute('data-portal-role');
    };
  }, [portalRole]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapseKey) === '1');
    } catch {
      /* ignore */
    }
  }, [collapseKey]);

  useEffect(() => {
    if (readOnlyAudit) {
      setBadgeFetchError(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setBadgeFetchError(false);
        const r = await fetch(`/api/portal/nav-badges?role=${encodeURIComponent(portalRole)}`, {
          credentials: 'include',
        });
        if (!r.ok) {
          if (!cancelled) setBadgeFetchError(true);
          return;
        }
        const data = (await r.json()) as Partial<Record<NavBadgeKey, number>>;
        if (!cancelled) {
          startTransition(() => setBadges(data));
        }
      } catch {
        if (!cancelled) setBadgeFetchError(true);
      }
    };

    const deferId = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 0);

    const onRefresh = () => void load();
    window.addEventListener('wa-nav-badges-refresh', onRefresh);
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
      window.removeEventListener('wa-nav-badges-refresh', onRefresh);
    };
  }, [portalRole, readOnlyAudit]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(collapseKey, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const headerRef = useRef<HTMLElement>(null);
  const tabBarRef = useRef<HTMLElement | null>(null);

  // Measure header + optional tab bar so sticky regions and sidebar offset stay in sync
  useEffect(() => {
    const headerEl = headerRef.current;
    const tabEl = tabBarRef.current;
    const update = () => {
      const hh = headerEl?.offsetHeight ?? 0;
      const th = tabEl?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--workspace-header-h', `${hh}px`);
      document.documentElement.style.setProperty('--workspace-tab-bar-h', `${th}px`);
      document.documentElement.style.setProperty('--workspace-top-offset', `${hh + th}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver(update);
    if (headerEl) ro.observe(headerEl);
    if (tabEl) ro.observe(tabEl);
    return () => ro.disconnect();
  }, [hasTabs, activeTab]);

  const firstHref = navItems[0]?.href ?? '/';
  const memberGroupLabels: Partial<Record<string, string>> = portalRole === 'member' ? {
    workflows: tGroup('memberTools'),
    insights: tGroup('memberProgress'),
    manage: tGroup('memberAccount'),
  } : {};
  const resumeUploadHint = showResumeUploadHint ? (
    <div className="workspace-resume-upload-hint" role="status">
      <span className="workspace-resume-upload-hint__text">
        No resume on file yet — upload one to power AI tools and your coach.
      </span>
      <Link href="/dashboard/resume" prefetch={false} className="workspace-resume-upload-hint__cta">
        Upload resume
      </Link>
    </div>
  ) : null;

  const rootStyle: React.CSSProperties | undefined = (() => {
    const style: Record<string, string> = {};
    if (partnerAccentColor && /^#[0-9A-Fa-f]{6}$/.test(partnerAccentColor)) {
      style['--partner-accent'] = partnerAccentColor;
    }
    if (orgPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(orgPrimaryColor)) {
      style['--org-primary-color'] = orgPrimaryColor;
    }
    if (orgAccentColor && /^#[0-9A-Fa-f]{6}$/.test(orgAccentColor)) {
      style['--org-accent-color'] = orgAccentColor;
    }
    return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined;
  })();

  return (
    <div className="workspace-shell-root" data-workspace-role={portalRole} style={rootStyle}>
      {/* Mirror the data-portal-role effect at parse time so <html>/<body> take the
          portal canvas on first paint instead of after hydration (WAP-153). The
          value is a fixed PortalRole union member, never user input. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-portal-role',${JSON.stringify(portalRole)});`,
        }}
      />
      {readOnlyAudit ? (
        <span hidden data-portal-audit-suppressed="workspace-nav-badges-and-notification-polling" />
      ) : null}
      {badgeFetchError ? <span hidden data-portal-error-state="workspace-nav-badges" /> : null}
      <header
        ref={headerRef}
        className={`workspace-shell-header${minimalMobileHeader ? ' workspace-shell-header--minimal-mobile' : ''}`}
      >
        <div className="workspace-shell-header__brand">
          <button
            type="button"
            className="workspace-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label={tNav('openMenu')}
            aria-expanded={drawerOpen}
            aria-controls="workspace-sidebar"
          >
            <Menu size={22} strokeWidth={2} aria-hidden />
          </button>
          <div className="workspace-shell-brand-block">
            <Link href={firstHref} prefetch={false} className="workspace-shell-brand">
              WorkforceAP
            </Link>
            <div className="workspace-shell-brand-meta">
              <span className="workspace-shell-tagline">{translateLabel(workspaceLabel)}</span>
              {currentPageLabel ? (
                <span className="workspace-shell-current-page" title={currentPageLabel}>
                  {currentPageLabel}
                </span>
              ) : null}
              {marketingSiteHref ? (
                <Link
                  href={marketingSiteHref}
                  prefetch={false}
                  className="workspace-shell-public-site-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} aria-hidden />
                  {marketingSiteLabel ?? tNav('publicSite')}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="workspace-shell-header__meta">
          {contextLogoUrl ? (
            <span className="workspace-shell-context-logo-wrap" aria-hidden>
              <Image
                src={contextLogoUrl}
                alt=""
                width={36}
                height={36}
                className="workspace-shell-context-logo"
              />
            </span>
          ) : null}
          {identity ? (
            <ShellIdentity identity={identity} variant="header" title={tNav('profile')} />
          ) : (
            <span className="workspace-shell-context workspace-shell-context--chip" title={contextLabel}>
              {contextLabel}
            </span>
          )}
          {headerBadge ? (
            <span className="workspace-shell-tier-badge" title={headerBadge}>
              {headerBadge}
            </span>
          ) : null}
          {/* Role switcher: show PortalRoleSwitcher for multi-role non-super-admins, OR for super-admins when impersonating (so they can switch within context) */}
          {!isSuperAdmin && portalRoles && portalRoles.length > 1 ? (
            <PortalRoleSwitcher userRoles={portalRoles} currentRole={portalRole} />
          ) : null}
          {/* SuperAdminViewSwitcher: primary navigation for super admins; shown in all portal contexts */}
          <SuperAdminViewSwitcher initialIsSuperAdmin={isSuperAdmin} />
          {/* When super admin is impersonating, show an inline impersonation chip for clarity */}
          {superAdmin && superAdminImpersonating ? (
            <span className="workspace-shell-impersonating-chip" title="You are viewing this workspace as an administrator">
              <span className="workspace-shell-impersonating-indicator" />
              Viewing as
            </span>
          ) : null}
          {/* Global search for admin now lives in the command rail (see
              workspace-sidebar-search below), matching the admin-full mockup. */}
          <PortalHeaderActions
            badges={badges}
            hidePublicSite={Boolean(marketingSiteHref)}
            readOnlyAudit={readOnlyAudit}
          />
          {attributionLabel ? (
            <span
              className="workspace-shell-attribution"
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-on-surface-variant)',
                whiteSpace: 'nowrap',
                marginLeft: '0.25rem',
              }}
              aria-label={attributionLabel}
            >
              {attributionLabel}
            </span>
          ) : null}
        </div>
      </header>

      {portalRole !== 'member' ? resumeUploadHint : null}

      {superAdmin && superAdminImpersonating && superAdminBackHref && (
        <div className="workspace-super-admin-banner">
          Viewing as <strong>{contextLabel}</strong>.{' '}
          <Link href={superAdminBackHref} prefetch={false}>{superAdminBackLabel ?? 'Switch'}</Link>
        </div>
      )}

      <div
        className={`workspace-drawer-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={closeDrawer}
        onKeyDown={(e) => e.key === 'Escape' && closeDrawer()}
        role="presentation"
        tabIndex={-1}
      />

      {hasTabs && activeTab && portalRole !== 'member' ? (
        <nav
          ref={tabBarRef}
          className="workspace-tab-bar"
          aria-label={tNav('workspaceTabs')}
        >
          <div className="workspace-tab-bar-inner">
            {NAV_TAB_ORDER.map((tab) => {
              const meta = NAV_TAB_META[tab];
              const isActive = tab === activeTab;
              const firstItem = navItems.find((i) => i.tab === tab);
              return (
                <Link
                  key={tab}
                  href={firstItem?.href ?? '/dashboard'}
                  prefetch={false}
                  className={`workspace-tab${isActive ? ' workspace-tab--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={closeDrawer}
                >
                  <LegacyGlyph name={meta.icon} size={20} className="workspace-tab-icon" />
                  <span className="workspace-tab-label">{translateLabel(meta.label)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      <div className="workspace-shell-body">
        <aside
          id="workspace-sidebar"
          ref={trapRef}
          inert={!wide && !drawerOpen}
          aria-hidden={!wide && !drawerOpen ? true : undefined}
          role={isMobileDrawer ? 'dialog' : undefined}
          aria-modal={isMobileDrawer ? true : undefined}
          aria-label={isMobileDrawer ? `${translateLabel(workspaceLabel)} navigation` : undefined}
          className={`workspace-sidebar ${drawerOpen ? 'open' : ''} ${isCollapsedDesktop ? 'workspace-sidebar--collapsed' : ''}`}
          data-contextual-tool={contextualToolItem?.href ?? undefined}
        >
          <div className="workspace-sidebar-inner">
            <div className="workspace-sidebar-toolbar">
              {portalRole === 'admin' ? (
                /* Branded admin command-rail header (matches admin-full mockup:
                   shield tile + product + "Admin · {org}"). Collapses to just
                   the mark when the rail is collapsed. */
                <div className="workspace-sidebar-brand" title={`Admin · ${contextLabel}`}>
                  <span className="workspace-sidebar-brand-mark" aria-hidden>
                    <ShieldHalf size={16} />
                  </span>
                  {!isCollapsedDesktop ? (
                    <span className="workspace-sidebar-brand-text">
                      <span className="workspace-sidebar-brand-name">WorkforceAP</span>
                      <span className="workspace-sidebar-brand-sub">{translateLabel(workspaceLabel)}</span>
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="workspace-sidebar-label">{!wide && hasTabs && activeTab ? translateLabel(NAV_TAB_META[activeTab].label) : translateLabel(workspaceLabel)}</div>
              )}
              {wide ? (
                <button
                  type="button"
                  className="workspace-sidebar-collapse-btn"
                  onClick={toggleCollapse}
                  aria-label={collapsed ? tNav('expandSidebar') : tNav('collapseSidebar')}
                  title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? <ChevronRight size={18} aria-hidden /> : <ChevronLeft size={18} aria-hidden />}
                </button>
              ) : (
                <button
                  type="button"
                  className="workspace-sidebar-collapse-btn workspace-sidebar-close-btn"
                  onClick={closeDrawer}
                  aria-label={tNav('closeMenu')}
                >
                  <X size={18} aria-hidden />
                </button>
              )}
            </div>
            {/* In-rail admin search — matches the mockup's "Search admin…" placement.
                Hidden when the desktop rail is collapsed. */}
            {portalRole === 'admin' && !isCollapsedDesktop ? (
              <div className="workspace-sidebar-search">
                <GlobalSearch />
              </div>
            ) : null}
            <nav aria-label={`${translateLabel(workspaceLabel)} navigation`} className="workspace-sidebar-nav">
              <ul className="workspace-sidebar-list workspace-sidebar-list--root">
                {GROUP_ORDER.map((group) => {
                  const list = wide ? desktopNavItems : mobileDrawerNavItems;
                  // Repeated shortcuts must not paint two current-page entries.
                  const inGroup = list.filter((item, index) =>
                    item.group === group && list.findIndex((candidate) => candidate.href === item.href) === index,
                  );
                  if (inGroup.length === 0) return null;
                  const groupLabel = NAV_GROUP_LABELS[group];
                  const links = (
                    <ul className="workspace-sidebar-list">
                        {inGroup.map((item) => {
                          const isActive = activeHref === item.href;
                          const Icon = item.Icon;
                          const b = badgeTotalForItem(badges, item);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                prefetch={false}
                                className={`workspace-sidebar-link${isActive ? ' active' : ''}${item.nestedUnder ? ' workspace-sidebar-link--nested' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                                data-nested-under={item.nestedUnder}
                                onClick={closeDrawer}
                                title={isCollapsedDesktop ? translateLabel(item.label) : undefined}
                                {...(item.tourTarget ? { 'data-tour': item.tourTarget } : {})}
                              >
                                {Icon ? (
                                  <span className="workspace-sidebar-icon" aria-hidden>
                                    <Icon size={20} className="text-current" />
                                  </span>
                                ) : null}
                                <span
                                  className={`workspace-sidebar-link-label${isCollapsedDesktop ? ' sr-only' : ''}`}
                                >
                                  {translateLabel(item.label)}
                                </span>
                                {b > 0 ? (
                                  <span className="workspace-nav-badge">{b > 99 ? '99+' : b}</span>
                                ) : null}
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  );
                  const disclose = portalRole === 'member' && group !== 'primary' && !isCollapsedDesktop;
                  const groupBadge = inGroup.reduce((total, item) => total + badgeTotalForItem(badges, item), 0);
                  return (
                    <li key={group} className="workspace-sidebar-group">
                      {disclose ? (
                        <details
                          key={`${group}:${activeHref}`}
                          className="workspace-sidebar-section"
                          open={inGroup.some((item) => item.href === activeHref)}
                        >
                          <summary className="workspace-sidebar-section-toggle">
                            <span>{memberGroupLabels[group] ?? translateLabel(groupLabel ?? group)}</span>
                            {groupBadge > 0 ? <span className="workspace-nav-badge">{groupBadge > 99 ? '99+' : groupBadge}</span> : null}
                            <ChevronDown size={16} aria-hidden />
                          </summary>
                          {links}
                        </details>
                      ) : (
                        <>
                          {groupLabel && !isCollapsedDesktop ? (
                            <div className="workspace-sidebar-group-label">{translateLabel(groupLabel)}</div>
                          ) : null}
                          {links}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
            {!isCollapsedDesktop ? <div className="workspace-sidebar-footer">
              {!wide ? (
                <div className="workspace-sidebar-meta">
                  {identity ? (
                    <ShellIdentity identity={identity} variant="sidebar" title={tNav('profile')} onNavigate={closeDrawer} />
                  ) : (
                    <span className="workspace-sidebar-context workspace-sidebar-context--chip" title={contextLabel}>
                      {contextLabel}
                    </span>
                  )}
                  <SuperAdminViewSwitcher initialIsSuperAdmin={isSuperAdmin} />
                </div>
              ) : null}
              {!wide ? (
                <Link href="/" prefetch={false} className="workspace-sidebar-home-link" onClick={closeDrawer}>
                  {translateLabel(PRODUCT_COPY.publicSiteLabel)}
                </Link>
              ) : null}
              <div className="workspace-sidebar-language">
                <LanguageToggle />
              </div>
              <div className={`workspace-sidebar-appearance${isCollapsedDesktop ? ' sr-only' : ''}`}>
                <span className="workspace-sidebar-appearance__label">Appearance</span>
                <ThemeSelector />
              </div>
              <SignOutButton className="workspace-sidebar-signout" onSignOutStart={closeDrawer}>
                {translateLabel('Sign out')}
              </SignOutButton>
            </div> : null}
          </div>
        </aside>

        <div ref={mainRef} className="workspace-shell-main workspace-shell-main--stack">
          {portalRole === 'member' ? <MemberPortalTopNav badgeCounts={badges} hrefMap={navHrefMap} /> : null}
          {portalRole === 'member' ? resumeUploadHint : null}
          {topBanner}
          <UnreviewedLocaleBanner />
          <div className="workspace-shell-main-inner">
            {/* Body grows on short pages and cannot shrink under the legal footer. */}
            <div className="workspace-shell-main-body">{children}</div>
            {footer}
          </div>
        </div>
      </div>
      {/* Mobile bottom nav for non-member roles. Members use MemberPortalTopNav. */}
      {ROLE_TO_NAV_VARIANT[portalRole] ? (
        <MobileBottomNav variant={ROLE_TO_NAV_VARIANT[portalRole]} badgeCounts={badges} />
      ) : null}
    </div>
  );
}
