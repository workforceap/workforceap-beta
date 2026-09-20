'use client';

import { Menu, X } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import LanguageToggle from '@/components/portal/LanguageToggle';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { usePathname } from 'next/navigation';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { CURRENT_USER_MAX_AGE_MS, fetchCurrentUser } from '@/lib/auth/currentUserClient';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/** Module-level TTL cache so auth checks survive re-mounts across pages. */
let lastAuthCheckAt = 0;

const navItems = [
  {
    label: 'About Us',
    children: [
      { href: '/what-we-do', label: 'What We Do' },
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/apply', label: 'Membership' },
      { href: '/leadership', label: 'Leadership' },
      { href: '/faq', label: 'FAQ' },
      { href: '/donate', label: 'Donate' },
    ],
  },
  {
    label: 'Programs',
    children: [
      { href: '/programs', label: 'Programs' },
      { href: '/find-your-path', label: 'Find Your Path' },
      { href: '/career-quiz', label: 'Free Career Quiz' },
      { href: '/program-comparison', label: 'Compare Programs' },
      { href: '/salary-guide', label: 'Salary Guide' },
    ],
  },
  { href: '/partners', label: 'Partners' },
  { href: '/employers', label: 'Employers' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact Us' },
];

function dropdownMenuId(baseId: string, label: string) {
  return `${baseId}-${label.replace(/\s+/g, '-').toLowerCase()}`;
}

/** Limit viewport prefetch to high-intent funnel routes; cuts parallel `_rsc` requests from the chrome. */
const PREFETCH_HIGH_PRIORITY = new Set(['/apply', '/programs', '/find-your-path']);
function marketingNavPrefetch(pathname: string): boolean {
  const path = pathname.split('?')[0] ?? pathname;
  return PREFETCH_HIGH_PRIORITY.has(path);
}

/**
 * The user is already in the apply / pathfinder funnel — show the
 * page's own CTAs and suppress the nav "Apply Now" so we don't compete
 * with the form they're filling out.
 */
function isOnApplyFunnel(pathnameWithoutLocale: string): boolean {
  if (pathnameWithoutLocale === '/find-your-path') return true;
  return pathnameWithoutLocale === '/apply' || pathnameWithoutLocale.startsWith('/apply/');
}

type GuestSignInCTAKey =
  | 'memberSignIn'
  | 'counselorSignIn'
  | 'employerSignIn'
  | 'partnerSignIn'
  | 'adminSignIn';

type GuestLoginSubmenuItem = {
  submenuKind: 'guestSignIn';
  href: string;
  signInCtaKey: GuestSignInCTAKey;
};

type PortalLinkSubmenuItem = { submenuKind: 'portalLink'; href: string; label: string };

/** Explicit `cta` keys — localized to “Member / Counselor / … Sign In” (never duplicate generic “Sign In”). */
const GUEST_LOGIN_SUBMENU: GuestLoginSubmenuItem[] = [
  { submenuKind: 'guestSignIn', href: '/login?redirectTo=/dashboard', signInCtaKey: 'memberSignIn' },
  { submenuKind: 'guestSignIn', href: '/login?redirectTo=/counselor', signInCtaKey: 'counselorSignIn' },
  { submenuKind: 'guestSignIn', href: '/login?redirectTo=/employer', signInCtaKey: 'employerSignIn' },
  { submenuKind: 'guestSignIn', href: '/login?redirectTo=/partner', signInCtaKey: 'partnerSignIn' },
  { submenuKind: 'guestSignIn', href: '/login?redirectTo=/admin', signInCtaKey: 'adminSignIn' },
];

type PortalSubmenuItem = GuestLoginSubmenuItem | PortalLinkSubmenuItem;

/** Partner-exclusive session: alternate sign-in shortcuts only */
const PARTNER_EXCLUSIVE_LOGIN_SUBMENU: GuestLoginSubmenuItem[] =
  GUEST_LOGIN_SUBMENU.slice(0, 3);

export default function MainNav() {
  const pathname = usePathname() ?? '/';
  const { pathnameWithoutLocale } = splitLocalePrefix(pathname);
  // Stable literal instead of useId(): the nav sits behind a next/dynamic
  // boundary, so React's useId counter diverges between server and client
  // render order, producing a hydration mismatch on every page. There is
  // exactly one MainNav per page, so a fixed id is safe.
  const navMenuId = 'main-nav-menu';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  /** Primary nav target + optional submenu for portal entry points */
  const [portalState, setPortalState] = useState<{
    primary: { href: string; label: string };
    submenu: PortalSubmenuItem[];
  }>({
      primary: { href: '/login', label: 'Login' },
      submenu: GUEST_LOGIN_SUBMENU,
  });
  const menuRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);
  const tNav = useTranslations('nav');
  const tCta = useTranslations('cta');
  /** Static `tCta` keys so each flyout row stays distinct (Member / Counselor / … Sign In). */
  const guestSignInLabels = useMemo(
    () =>
      ({
        memberSignIn: tCta('memberSignIn'),
        counselorSignIn: tCta('counselorSignIn'),
        employerSignIn: tCta('employerSignIn'),
        partnerSignIn: tCta('partnerSignIn'),
        adminSignIn: tCta('adminSignIn'),
      }) satisfies Record<GuestSignInCTAKey, string>,
    [tCta],
  );
  const translateLabel = (label: string): string => {
    const navMap: Record<string, string> = {
      'Programs': tNav('programs'),
      'Check Eligibility': tNav('checkEligibility'),
      'Find Your Path': tNav('findYourPath'),
      'Free Career Quiz': tNav('freeCareerQuiz'),
      'Compare Programs': tNav('comparePrograms'),
      'Salary Guide': tNav('salaryGuide'),
      'Membership': tNav('membership'),
      'Partners': tNav('partners'),
      'Employers': tNav('employers'),
      'Blog': tNav('blog'),
      'Donate': tNav('donate'),
      'Contact Us': tNav('contactUs'),
      'About Us': tNav('aboutUs'),
      'What We Do': tNav('whatWeDo'),
      'How It Works': tNav('howItWorks'),
      'Leadership': tNav('leadership'),
      'FAQ': tNav('faq'),
      'Member dashboard': tNav('dashboard'),
      'Account settings': tNav('myAccount'),
      'Account': tNav('myAccount'),
      'Employer portal': tNav('employer'),
      'Partner portal': tNav('partner'),
      'Partner': tNav('partner'),
    };
    if (label in navMap) return navMap[label];
    const ctaMap: Record<string, string> = {
      'Apply Now': tCta('applyNow'),
      'Login': tCta('logIn'),
    };
    if (label in ctaMap) return ctaMap[label];
    return label;
  };

  const portalSubmenuLabel = (item: PortalSubmenuItem): string =>
    item.submenuKind === 'guestSignIn'
      ? guestSignInLabels[item.signInCtaKey]
      : translateLabel(item.label);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setActiveDropdown(null);
    document.body.classList.remove('mobile-nav-open');
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.pageYOffset > 60);
    const onResize = () => {
      if (window.innerWidth > 900) closeMobile();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [closeMobile]);

  useEffect(() => {
    let cancelled = false;
    /** Cap refresh rate so tab-switching every few seconds doesn't spam /api/auth/me. */
    const REFRESH_THROTTLE_MS = CURRENT_USER_MAX_AGE_MS;
    const doFetch = async () => {
      try {
        // Shared snapshot (WAP-27): portal shells on the same page reuse this read.
        const data = await fetchCurrentUser({ maxAgeMs: REFRESH_THROTTLE_MS });
        if (cancelled) return;
        if (!data.role) {
          setPortalState({
            primary: { href: '/login', label: 'Login' },
            submenu: GUEST_LOGIN_SUBMENU,
          });
          return;
        }
        const partnerExclusive = !!data.partner && !data.superAdmin;
        if (partnerExclusive) {
          setPortalState({
            primary: { href: '/partner', label: 'Partner' },
            submenu: PARTNER_EXCLUSIVE_LOGIN_SUBMENU,
          });
          return;
        }
        const sub: PortalSubmenuItem[] = [
          { submenuKind: 'portalLink', href: '/dashboard', label: 'Member dashboard' },
        ];
        if (data.employer) {
          sub.push({ submenuKind: 'portalLink', href: '/employer', label: 'Employer portal' });
        }
        if (data.partner && data.superAdmin) {
          sub.push({ submenuKind: 'portalLink', href: '/partner', label: 'Partner portal' });
        }
        sub.push({ submenuKind: 'portalLink', href: '/dashboard/account', label: 'Account settings' });
        setPortalState({
          primary: { href: '/dashboard', label: 'Account' },
          submenu: sub,
        });
      } catch {
        if (!cancelled) {
          setPortalState({
            primary: { href: '/login', label: 'Login' },
            submenu: GUEST_LOGIN_SUBMENU,
          });
        }
      }
    };
    const refreshPortalLinks = (force = false) => {
      const now = Date.now();
      if (!force && now - lastAuthCheckAt < REFRESH_THROTTLE_MS) return;
      lastAuthCheckAt = now;
      void doFetch();
    };
    refreshPortalLinks(true);
    const onFocus = () => refreshPortalLinks(false);
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, []);

  useEffect(() => { closeMobile(); }, [pathnameWithoutLocale, closeMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const menu = menuRef.current;
    if (!menu) return;
    const getFocusable = () =>
      Array.from(menu.querySelectorAll<HTMLElement>('a[href]:not([tabindex="-1"]), button:not([disabled]):not([aria-hidden="true"])')).filter((el) => !el.hasAttribute('disabled'));
    const t = window.setTimeout(() => getFocusable()[0]?.focus(), 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMobile(); toggleRef.current?.focus(); return; }
      if (e.key !== 'Tab' || !menu) return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0]; const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) { if (active === first) { e.preventDefault(); last.focus(); } }
      else if (active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(t); document.removeEventListener('keydown', onKeyDown); previouslyFocused?.focus?.(); };
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    if (!activeDropdown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveDropdown(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeDropdown]);

  useEffect(() => {
    if (!activeDropdown) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const root = navContainerRef.current; const t = e.target;
      if (!root || !(t instanceof Node) || root.contains(t)) return;
      setActiveDropdown(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => { document.removeEventListener('mousedown', onPointerDown); document.removeEventListener('touchstart', onPointerDown); };
  }, [activeDropdown]);

  const toggleMobile = () => {
    if (mobileOpen) { closeMobile(); } else { setMobileOpen(true); document.body.classList.add('mobile-nav-open'); }
  };

  const isActive = (href: string) => pathnameWithoutLocale === href;
  const isParentActive = (children: { href: string }[]) => children.some((c) => pathnameWithoutLocale === c.href);

  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent, label: string, isOpen: boolean, subMenuId: string) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveDropdown(isOpen ? null : label); return; }
      if (e.key === 'Escape') { e.preventDefault(); setActiveDropdown(null); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault(); if (!isOpen) setActiveDropdown(label);
        queueMicrotask(() => { document.getElementById(subMenuId)?.querySelector<HTMLElement>('a[href]')?.focus(); });
      }
    }, []
  );

  const portalHrefActive = (href: string) => {
    const p = pathnameWithoutLocale;
    if (href === '/login' || href.startsWith('/login?')) return p === '/login';
    if (href === '/partner') return p.startsWith('/partner');
    if (href === '/dashboard') {
      return (
        p.startsWith('/dashboard') ||
        p.startsWith('/employer') ||
        p.startsWith('/admin') ||
        p.startsWith('/counselor') ||
        p.startsWith('/mentor') ||
        p.startsWith('/account') ||
        p.startsWith('/dashboard/account')
      );
    }
    return p === href || p.startsWith(`${href}/`);
  };

  const loginDropdownId = `${navMenuId}-login-submenu`;
  const isLoginMenuOpen = activeDropdown === '__login__';
  const loginSubmenuItems = portalState.submenu.filter((item) => item.href !== portalState.primary.href);

  return (
    <nav className={`main-nav main-nav--depth${scrolled ? ' scrolled' : ''}`} aria-label="Main navigation">
      <div className="nav-container" ref={navContainerRef}>
        <LocalizedLink href="/" prefetch={false} className="logo nav-brand" aria-label="Workforce Advancement Project home" onClick={closeMobile}>
          <img src="/images/wap_logo.png" alt="Workforce Advancement Project" width={210} height={107} className="nav-logo-image" />
        </LocalizedLink>

        {/* Mobile toggle */}
        <button ref={toggleRef} type="button" className="mobile-nav-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls={navMenuId} onClick={toggleMobile}>
          {mobileOpen ? <X size={26} strokeWidth={2} aria-hidden /> : <Menu size={26} strokeWidth={2} aria-hidden />}
        </button>

        {/* Mobile backdrop */}
        <button
          type="button"
          className={`mobile-nav-backdrop${mobileOpen ? ' visible' : ''}`}
          aria-label="Close navigation menu"
          aria-hidden={!mobileOpen}
          tabIndex={mobileOpen ? 0 : -1}
          onClick={closeMobile}
          {...(!mobileOpen ? { 'data-nav-hidden': 'true' } : {})}
        />

        {/* Nav links — single list, used for both desktop and mobile */}
        <ul ref={menuRef} id={navMenuId} className={`nav-menu${mobileOpen ? ' mobile-open' : ''}`}>
          {navItems.flatMap((item) => {
            if ('children' in item && item.children) {
              const parentActive = isParentActive(item.children);
              const subMenuId = dropdownMenuId(navMenuId, item.label);
              const isOpen = activeDropdown === item.label;
              /* Mobile: flatten — children visible, parent is a non-interactive heading */
              if (mobileOpen) {
                return [
                  <li key={`${item.label}-heading`} className="mobile-nav-group-heading">
                    <span>{translateLabel(item.label)}</span>
                  </li>,
                  ...item.children.map((child) => (
                    <li key={child.href}>
                      <LocalizedLink
                        href={child.href}
                        prefetch={false}
                        className={isActive(child.href) ? 'active' : undefined}
                        onClick={closeMobile}
                      >
                        {translateLabel(child.label)}
                      </LocalizedLink>
                    </li>
                  )),
                ];
              }
              return [
                <li
                  key={item.label}
                  className={`dropdown${isOpen ? ' active' : ''}`}
                  onMouseEnter={() => { if (window.innerWidth > 900) setActiveDropdown(item.label); }}
                  onMouseLeave={() => { if (window.innerWidth > 900) setActiveDropdown((cur) => (cur === item.label ? null : cur)); }}
                >
                  <button
                    type="button"
                    id={`${subMenuId}-trigger`}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    aria-controls={subMenuId}
                    className={`dropdown-trigger${parentActive ? ' active' : ''}`}
                    onClick={() => setActiveDropdown(isOpen ? null : item.label)}
                    onKeyDown={(e) => handleDropdownKeyDown(e, item.label, isOpen, subMenuId)}
                  >
                    {translateLabel(item.label)}
                  </button>
                  <ul className="dropdown-menu" id={subMenuId} role="menu" aria-labelledby={`${subMenuId}-trigger`}>
                    {item.children.map((child) => (
                      <li key={child.href} role="none">
                        <LocalizedLink
                          href={child.href}
                          prefetch={false}
                          role="menuitem"
                          className={isActive(child.href) ? 'active' : undefined}
                          onClick={closeMobile}
                        >
                          {translateLabel(child.label)}
                        </LocalizedLink>
                      </li>
                    ))}
                  </ul>
                </li>,
              ];
            }
            return [
              <li key={item.href}>
                <LocalizedLink
                  href={item.href!}
                  prefetch={marketingNavPrefetch(item.href!)}
                  className={isActive(item.href!) ? 'active' : undefined}
                  onClick={closeMobile}
                >
                  {translateLabel(item.label)}
                </LocalizedLink>
              </li>,
            ];
          })}
          {mobileOpen ? (
            <>
              <li className="mobile-nav-group-heading"><span>{translateLabel(portalState.primary.label)}</span></li>
              {/* Mobile renders the FULL submenu (not loginSubmenuItems): the group
                  heading above is not a link, so the primary destination (e.g.
                  "Member dashboard" → /dashboard) must stay in the list or members
                  only see "Account settings" and land on the wrong page. */}
              {portalState.submenu.length > 0 ? portalState.submenu.map((item) => (
                <li key={item.href}>
                  <LocalizedLink
                    href={item.href}
                    prefetch={false}
                    className={portalHrefActive(item.href.split('?')[0]) ? 'active' : undefined}
                    onClick={closeMobile}
                  >
                    {portalSubmenuLabel(item)}
                  </LocalizedLink>
                </li>
              )) : null}
            </>
          ) : (
          <li
            key="nav-login-portal"
            className={`dropdown nav-login-dropdown${isLoginMenuOpen ? ' active' : ''}`}
            onMouseEnter={() => {
              if (window.innerWidth > 900 && loginSubmenuItems.length > 0) setActiveDropdown('__login__');
            }}
            onMouseLeave={() => { if (window.innerWidth > 900) setActiveDropdown((cur) => (cur === '__login__' ? null : cur)); }}
          >
            <div className="nav-login-split">
              <LocalizedLink
                href={portalState.primary.href}
                prefetch={false}
                className={`nav-login-primary${portalHrefActive(portalState.primary.href) ? ' active' : ''}`}
                onClick={closeMobile}
              >
                {translateLabel(portalState.primary.label)}
              </LocalizedLink>
              {loginSubmenuItems.length > 0 ? (
                <button
                  type="button"
                  id={`${loginDropdownId}-trigger`}
                  className={`nav-login-flyout-trigger${isLoginMenuOpen ? ' active' : ''}`}
                  aria-expanded={isLoginMenuOpen}
                  aria-haspopup="true"
                  aria-controls={loginDropdownId}
                  onClick={() => setActiveDropdown(isLoginMenuOpen ? null : '__login__')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveDropdown(isLoginMenuOpen ? null : '__login__');
                    }
                    if (e.key === 'Escape') setActiveDropdown(null);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (!isLoginMenuOpen) setActiveDropdown('__login__');
                      queueMicrotask(() => {
                        document.getElementById(loginDropdownId)?.querySelector<HTMLElement>('a[href]')?.focus();
                      });
                    }
                  }}
                  aria-label="More sign-in and portal options"
                >
                  <span className="nav-login-flyout-chevron" aria-hidden />
                </button>
              ) : null}
            </div>
            {loginSubmenuItems.length > 0 ? (
              <ul className="dropdown-menu nav-login-flyout-menu" id={loginDropdownId} role="menu">
                {loginSubmenuItems.map((item) => (
                  <li key={item.href} role="none">
                    <LocalizedLink
                      href={item.href}
                      prefetch={false}
                      role="menuitem"
                      className={portalHrefActive(item.href.split('?')[0]) ? 'active' : undefined}
                      onClick={closeMobile}
                    >
                      {portalSubmenuLabel(item)}
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
          )}
          {!isOnApplyFunnel(pathnameWithoutLocale) && (mobileOpen ? (
            <>
              <li className="mobile-nav-group-heading"><span>{translateLabel('Apply Now')}</span></li>
              <li>
                <LocalizedLink
                  href="/apply"
                  prefetch={true}
                  onClick={closeMobile}
                >
                  {translateLabel('Check Eligibility')}
                </LocalizedLink>
              </li>
              <li>
                <LocalizedLink
                  href="/apply"
                  prefetch={true}
                  className={marketingButtonPresets.navApplyCta()}
                  onClick={closeMobile}
                >
                  {translateLabel('Apply Now')}
                </LocalizedLink>
              </li>
            </>
          ) : (
          <li>
            <LocalizedLink
              href="/apply"
              prefetch={true}
              className={marketingButtonPresets.navApplyCta()}
              onClick={closeMobile}
            >
              {translateLabel('Apply Now')}
            </LocalizedLink>
          </li>
          ))}
          <li className="nav-theme-mobile-item" key="theme-toggle-mobile">
            <div className="nav-theme-mobile-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="nav-lang-hidden"><LanguageToggle /></span>
              <ThemeToggle variant="marketing" />
            </div>
          </li>
        </ul>

        {/* Desktop-only theme toggle + language */}
        <div className="nav-theme-slot-desktop" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="nav-lang-hidden"><LanguageToggle /></span>
          <ThemeToggle variant="marketing" />
        </div>
      </div>
    </nav>
  );
}
