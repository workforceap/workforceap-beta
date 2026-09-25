export const APP_LOCALES = ['en', 'es', 'fr', 'pt'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

/**
 * Locales whose translations have passed human review and are safe to
 * advertise/auto-select (LanguageToggle UI, Accept-Language auto-detection).
 *
 * `fr` and `pt` remain in `APP_LOCALES` (so /fr/... and /pt/... URLs that are
 * already bookmarked or search-engine-indexed keep resolving instead of
 * 404ing) but are intentionally excluded here until their translations are
 * reviewed — see ENG_REVIEW_i18n.md / docs/I18N-LOCALE-ROUTING.md.
 */
export const REVIEWED_LOCALES = ['en', 'es'] as const;

export function isReviewedLocale(locale: string): locale is (typeof REVIEWED_LOCALES)[number] {
  return (REVIEWED_LOCALES as readonly string[]).includes(locale);
}

/** Cookie persisted when user picks a language (marketing + portal). */
export const WAP_LOCALE_COOKIE = 'wap-locale';

/** Middleware sets this request header so layouts/metadata can read active locale. */
export const WAP_LOCALE_HEADER = 'x-wap-locale';

/** Present only when the browser URL has an explicit /en, /es, /fr, or /pt prefix. */
export const WAP_EXPLICIT_LOCALE_HEADER = 'x-wap-explicit-locale';

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

/** RTL languages (future: ar, he, ur). Currently none. */
export const RTL_LOCALES: readonly string[] = [];

export function isRtlLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Public paths that use /{locale}/… URLs (redirect if prefix missing). */
// NOTE: pure-content marketing leaf routes (/, /about, /what-we-do,
// /how-it-works, /faq, /contact, /impact, /donate, /privacy, /terms,
// /accessibility) are now served by the Astro marketing site (static, at root)
// and intentionally NOT listed here, so the middleware does not /{locale}/-
// redirect them. (/outcomes is temporarily hidden — archived + redirected.)
// Routes below stay Next-owned (dynamic / not yet migrated).
export const LOCALEABLE_PATH_PREFIXES: readonly string[] = [
  '/apply',
  '/wioa-qualification',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/partner-signup',
  '/lp',
];

export function isLocaleableMarketingPath(pathname: string): boolean {
  for (const prefix of LOCALEABLE_PATH_PREFIXES) {
    if (prefix === '/') continue;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Public routes served by the separate Astro deployment.
 *
 * Next-rendered pages must use document navigation for these destinations.
 * A Next `Link` otherwise issues an RSC request that the Astro deployment
 * cannot answer, producing a false 404 before the browser falls back to the
 * working document URL.
 */
const ASTRO_MARKETING_EXACT_PATHS = new Set([
  '/',
  '/about',
  '/accessibility',
  '/blog',
  '/career-quiz',
  '/careers',
  '/careers/thank-you',
  '/contact',
  '/donate',
  '/employers',
  '/faq',
  '/find-your-path',
  '/how-it-works',
  '/impact',
  '/interest-profiler',
  '/leadership',
  '/lp/google-it-automation',
  '/mentor',
  '/partners',
  '/partners/thank-you',
  '/privacy',
  '/program-comparison',
  '/programs',
  '/salary-guide',
  '/terms',
  '/what-we-do',
]);

const ASTRO_MARKETING_NESTED_PREFIXES = ['/blog/', '/leadership/', '/programs/'] as const;

export function isAstroMarketingPath(pathname: string): boolean {
  const { pathnameWithoutLocale } = splitLocalePrefix(pathname);
  return (
    ASTRO_MARKETING_EXACT_PATHS.has(pathnameWithoutLocale) ||
    ASTRO_MARKETING_NESTED_PREFIXES.some((prefix) => pathnameWithoutLocale.startsWith(prefix))
  );
}

/** Paths that never get a /{locale}/ redirect (API, assets, app shells). */
export function isLocaleBypassPath(pathname: string): boolean {
  if (pathname.startsWith('/api')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/ingest')) return true;
  if (
    pathname === '/manifest.json' ||
    pathname === '/manifest-counselor.json' ||
    pathname === '/sw.js' ||
    pathname === '/robots.txt'
  )
    return true;
  if (pathname.startsWith('/images/')) return true;
  return false;
}

export function splitLocalePrefix(pathname: string): { locale: AppLocale | null; pathnameWithoutLocale: string } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { locale: null, pathnameWithoutLocale: '/' };
  const first = parts[0]!;
  if (isAppLocale(first)) {
    const rest = parts.slice(1);
    return {
      locale: first,
      pathnameWithoutLocale: rest.length === 0 ? '/' : `/${rest.join('/')}`,
    };
  }
  return { locale: null, pathnameWithoutLocale: pathname };
}

export function pickLocaleFromAcceptLanguage(header: string | null): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const preferred = header
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';q=');
      const q = qPart ? parseFloat(qPart) : 1;
      return { tag: tag?.trim().toLowerCase() ?? '', q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);

  // Only auto-select locales that have passed translation review. Unreviewed
  // locales (fr/pt today) are still fully reachable via explicit /fr/... or
  // /pt/... navigation — see isReviewedLocale / REVIEWED_LOCALES — but a
  // browser Accept-Language match against one should not auto-route a
  // visitor into an unreviewed locale, so we fall through to the default.
  for (const { tag } of preferred) {
    const base = tag.split('-')[0] ?? '';
    if (isReviewedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function withLocalePrefix(pathname: string, locale: AppLocale): string {
  if (pathname === '/') return `/${locale}`;
  return `/${locale}${pathname}`;
}
