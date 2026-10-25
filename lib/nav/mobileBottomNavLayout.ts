/**
 * Request header set in middleware so RootLayout can add `html.wap-reserve-mobile-bottom-nav`.
 * CSS uses it for mobile clearance + scroll-padding on first paint (no :has() / client-nav dependency).
 */
export const WAP_RESERVE_MOBILE_BOTTOM_NAV_HEADER = 'x-wap-reserve-mobile-bottom-nav' as const;

/**
 * Member workspaces use a responsive shell nav (member phone nav or desktop
 * sidebar) instead of the generic MobileBottomNav. Middleware strips locale
 * prefixes before setting `x-pathname`.
 */
export function isMemberWorkspacePath(pathnameWithoutLocale: string): boolean {
  return pathnameWithoutLocale === '/dashboard'
    || pathnameWithoutLocale.startsWith('/dashboard/')
    || pathnameWithoutLocale === '/dev/member'
    || pathnameWithoutLocale.startsWith('/dev/member/');
}

/**
 * Paths that do not show a fixed MobileBottomNav on mobile — skip extra #main-content bottom inset.
 * Locale prefix is stripped before this runs (middleware `effectivePath`).
 */
export function shouldReserveMobileBottomNavClearance(pathnameWithoutLocale: string): boolean {
  const p = pathnameWithoutLocale;
  if (p.startsWith('/dashboard')) return false;
  if (p === '/login' || p.startsWith('/login/')) return false;
  if (p.startsWith('/verify-mfa') || p.startsWith('/setup-mfa')) return false;
  /* Most /apply/* funnel pages omit the nav; confirmation includes it */
  if (p === '/apply' || p.startsWith('/apply/')) {
    return p.startsWith('/apply/confirmation');
  }
  return true;
}
