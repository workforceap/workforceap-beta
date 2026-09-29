import { splitLocalePrefix, withLocalePrefix, type AppLocale } from '@/lib/i18n/config';
import { sanitizeRedirectPath } from './safeRedirectPath';

function prefixForLocale(pathname: string, locale: AppLocale | null): string {
  return locale ? withLocalePrefix(pathname, locale) : pathname;
}

function parseRedirectPath(path: string): { locale: AppLocale | null; pathnameWithoutLocale: string } | null {
  try {
    const pathname = new URL(path, 'https://internal.invalid').pathname;
    return splitLocalePrefix(pathname);
  } catch {
    return null;
  }
}

function isAdminPath(pathnameWithoutLocale: string): boolean {
  return pathnameWithoutLocale === '/admin' || pathnameWithoutLocale.startsWith('/admin/');
}

/**
 * If the user asked for the member home (`/dashboard` only, not nested routes),
 * send staff to their portal. Mirrors existing admin behavior; adds counselors → /counselor.
 *
 * A super_admin lands on /admin from anywhere else, but an /admin deep link
 * (query and hash included) is kept, so the weekly applicant-aging digest's
 * `/admin/command-center?queue=applications` opens the queue after sign-in
 * instead of the home tiles (WAP-190).
 */
export function resolveRoleAwarePostLoginRedirect(
  redirectTo: string,
  profileRole: string | null | undefined
): string {
  const parsed = parseRedirectPath(redirectTo);
  const locale = parsed?.locale ?? null;

  if (profileRole === 'super_admin') {
    return parsed && isAdminPath(parsed.pathnameWithoutLocale) ? redirectTo : prefixForLocale('/admin', locale);
  }
  if (!parsed || parsed.pathnameWithoutLocale !== '/dashboard') return redirectTo;

  if (profileRole === 'admin') return prefixForLocale('/admin', locale);
  if (profileRole === 'counselor') return prefixForLocale('/counselor', locale);
  return redirectTo;
}

/**
 * Normalizes the final destination after authentication.
 * Prevents redirecting a successfully authenticated user back to /login.
 */
export function normalizePostLoginRedirect(
  raw: string | null | undefined,
  fallback = '/dashboard'
): string {
  const safe = sanitizeRedirectPath(raw, fallback);
  const parsed = parseRedirectPath(safe);

  if (!parsed) return fallback;
  if (parsed.pathnameWithoutLocale === '/login') {
    const fallbackPath = parseRedirectPath(fallback)?.pathnameWithoutLocale ?? fallback;
    return prefixForLocale(fallbackPath, parsed.locale);
  }
  return safe;
}
