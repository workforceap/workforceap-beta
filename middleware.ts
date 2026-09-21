import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseCookieOptions, SESSION_ONLY_COOKIE } from '@/lib/supabaseCookieOptions';
import { getAdminMfaTrustCookieName, verifyAdminMfaTrustToken } from '@/lib/auth/mfaTrust';
import { isStaffMfaEnforcementEnabled } from '@/lib/auth/mfaConfig';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import type { AppLocale } from '@/lib/i18n/config';
import {
  WAP_LOCALE_COOKIE,
  WAP_LOCALE_HEADER,
  isAppLocale,
  isLocaleBypassPath,
  isLocaleableMarketingPath,
  pickLocaleFromAcceptLanguage,
  splitLocalePrefix,
  withLocalePrefix,
} from '@/lib/i18n/config';
import { customDomainCache, NO_ORG_SENTINEL } from '@/lib/tenant/customDomainCache';
import { isCanonicalHost, normalizeHost } from '@/lib/tenant/hostMatch';
import {
  WAP_RESERVE_MOBILE_BOTTOM_NAV_HEADER,
  shouldReserveMobileBottomNavClearance,
} from '@/lib/nav/mobileBottomNavLayout';
import {
  isPaidUtmSource,
  UTM_SOURCE_COOKIE,
  UTM_SOURCE_COOKIE_MAX_AGE,
  WAP_PAID_APPLY_HEADER,
} from '@/lib/apply/paidApplyUtm';
import {
  partnerRefFromEnrollPath,
  partnerRefCookieClearOptions,
  shouldCaptureEnrollRef,
  PARTNER_REF_COOKIE,
  PARTNER_REF_COOKIE_MAX_AGE,
} from '@/lib/apply/applyReferralCapture';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/observability/requestId';
import { WAP_USER_ID_HEADER } from '@/lib/auth/layoutUserId';
import { readAuthWithRetry, reportAuthReadFailure } from '@/lib/auth/authRead';
import { hasSupabaseAuthCookies, shouldTalkToGoTrue, isSupabaseAuthTokenCookieName, isSupabasePkceCookieName } from '@/lib/auth/supabaseAuthCookie';
import { isUnauthenticatedBrowserNavigationApiPath } from '@/lib/auth/tenantApiNavigation';
import {
  READ_ONLY_PORTAL_AUDIT_HEADER,
  READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER,
  isValidReadOnlyPortalAuditToken,
} from '@/lib/audit/readOnlyPortalAudit';
import {
  CSP_NONCE_HEADER,
  CSP_REPORT_ONLY_HEADER,
  CSP_REPORTING_ENDPOINTS_HEADER,
  buildCspReportOnlyPolicy,
  buildReportingEndpointsHeader,
  generateCspNonce,
  isCspNonceDocumentRequest,
} from '@/lib/security/csp';

/** Header forwarded to server components / API routes when middleware found a cached org. */
const WAP_ORG_ID_HEADER = 'x-wap-org-id';
/** Always-set header carrying the normalized Host so Node-runtime resolvers can populate cache. */
const WAP_HOST_HEADER = 'x-wap-host';

const PORTAL_PATHS = [
  '/dashboard',
  '/resources',
  '/help',
  '/applications',
  '/account',
  '/profile',
  '/certifications',
  '/partner',
  '/employer',
  '/counselor',
  // '/jobs' is not a portal prefix: next.config redirects it to /dashboard/jobs
];
const ADMIN_PATHS = ['/admin'];
const ADMIN_API_PATHS = ['/api/admin'];

/**
 * Defense-in-depth backstop for the tenant-portal APIs. These routes already
 * enforce auth per-route (via `getUser()` / role checks), but had no
 * middleware-level protection, unlike `/api/admin/*`. This adds a second,
 * centrally-maintained layer so a future route that forgets its own auth
 * check still gets rejected here.
 *
 * IMPORTANT: keep `TENANT_API_PUBLIC_ALLOWLIST` exact and minimal — every
 * entry is a route that intentionally has NO session yet (account creation)
 * or authenticates via a non-session mechanism (webhook signature). Audited
 * 2026-07-01: every other route.ts under these four prefixes calls
 * `getUser()`/Supabase session auth (directly or via a shared handler
 * factory) before touching request data.
 */
const TENANT_API_PATHS = ['/api/member', '/api/employer', '/api/partner', '/api/counselor'];

/** Routes under TENANT_API_PATHS that must stay reachable without a session. */
const TENANT_API_PUBLIC_ALLOWLIST = new Set([
  '/api/member/signup',
  '/api/employer/signup',
  '/api/partner/signup',
  // Stripe webhook — authenticated via `stripe-signature` header verification
  // inside the route handler, not a user session.
  '/api/employer/webhook',
]);

/** Public post-conversion pages under portal URL prefixes (no auth gate). */
const PUBLIC_THANK_YOU_PATHS = new Set(['/employer/thank-you']);

function isPublicThankYouPath(pathname: string) {
  return PUBLIC_THANK_YOU_PATHS.has(pathname);
}

function isPortalPath(pathname: string) {
  if (isPublicThankYouPath(pathname)) return false;
  return PORTAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminApiPath(pathname: string) {
  return ADMIN_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isStaffMfaPath(pathname: string) {
  return isAdminPath(pathname) || isAdminApiPath(pathname) ||
    pathname === '/counselor' || pathname.startsWith('/counselor/') ||
    pathname === '/api/counselor' || pathname.startsWith('/api/counselor/');
}

function isTenantApiPath(pathname: string) {
  if (TENANT_API_PUBLIC_ALLOWLIST.has(pathname)) return false;
  return TENANT_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isProtectedPath(pathname: string) {
  return isPortalPath(pathname) || isAdminPath(pathname);
}

function requestedPathWithSearch(request: NextRequest) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function localizedLoginPath(locale: AppLocale) {
  return withLocalePrefix('/login', locale);
}

function resolvePreferredLocale(request: NextRequest): { locale: AppLocale; fromQuery: boolean } {
  const queryLang = request.nextUrl.searchParams.get('lang');
  if (queryLang && isAppLocale(queryLang)) {
    return { locale: queryLang, fromQuery: true };
  }
  const cookieVal = request.cookies.get(WAP_LOCALE_COOKIE)?.value;
  if (cookieVal && isAppLocale(cookieVal)) return { locale: cookieVal, fromQuery: false };
  return { locale: pickLocaleFromAcceptLanguage(request.headers.get('accept-language')), fromQuery: false };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);

  // Codex P1 catch on PR #1046: `new Headers(request.headers)` preserves any
  // client-supplied values for the headers we treat as trusted downstream.
  // A request with `x-wap-org-id: <other-org>` would otherwise survive cache
  // misses, canonical hosts, and unknown custom domains. Strip both
  // middleware-controlled headers BEFORE any other processing — only this
  // function may set them, and only on verified host matches.
  requestHeaders.delete(WAP_ORG_ID_HEADER);
  requestHeaders.delete(WAP_HOST_HEADER);
  requestHeaders.delete(WAP_USER_ID_HEADER);
  const validReadOnlyAuditToken = isValidReadOnlyPortalAuditToken(
    request.headers.get(READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER),
    process.env.PORTAL_AUDIT_READ_ONLY_TOKEN,
  );
  requestHeaders.delete(READ_ONLY_PORTAL_AUDIT_HEADER);
  requestHeaders.delete(READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER);
  // Same rule for the CSP nonce: Next.js reads the nonce back out of the
  // forwarded CSP header to stamp its own bootstrap scripts, so a client must
  // never be able to smuggle either header through to the app.
  requestHeaders.delete(CSP_NONCE_HEADER);
  requestHeaders.delete(CSP_REPORT_ONLY_HEADER);

  // Mint or forward an `x-request-id` for end-to-end correlation. We set
  // this on BOTH the forwarded request headers (so server components, API
  // routes, and the structured logger can read it) and the eventual
  // response below (so the client and intermediate proxies can echo it
  // back when filing bug reports).
  const { requestId } = resolveRequestId(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  // WAP-36 phase 1 (observe, never enforce): mint a per-document nonce and a
  // Content-Security-Policy-Report-Only policy that mirrors the enforced
  // header in next.config.ts plus `'nonce-…' 'strict-dynamic'`. The nonce
  // travels on `x-nonce` so the root layout can stamp inline scripts, and the
  // Report-Only header is ALSO forwarded on the request because Next.js
  // (app-render) extracts the nonce from `content-security-policy[-report-only]`
  // in the request headers to nonce its own framework `<script>` tags. API
  // routes, RSC payloads and static files get no nonce (nothing to stamp).
  const cspNonce = isCspNonceDocumentRequest(request) ? generateCspNonce() : null;
  const cspReportOnlyPolicy = cspNonce ? buildCspReportOnlyPolicy(cspNonce) : null;
  if (cspNonce && cspReportOnlyPolicy) {
    requestHeaders.set(CSP_NONCE_HEADER, cspNonce);
    requestHeaders.set(CSP_REPORT_ONLY_HEADER, cspReportOnlyPolicy);
  }

  const { locale: prefixLocale, pathnameWithoutLocale } = splitLocalePrefix(pathname);
  const effectivePath = prefixLocale ? pathnameWithoutLocale : pathname;
  requestHeaders.set('x-pathname', effectivePath);

  const { locale: inferredLocale, fromQuery: localeFromQuery } = resolvePreferredLocale(request);
  requestHeaders.set(WAP_LOCALE_HEADER, prefixLocale ?? inferredLocale);

  if (shouldReserveMobileBottomNavClearance(effectivePath)) {
    requestHeaders.set(WAP_RESERVE_MOBILE_BOTTOM_NAV_HEADER, '1');
  }

  if (effectivePath === '/apply') {
    const fromQuery = request.nextUrl.searchParams.get('utm_source');
    const fromCookie = request.cookies.get(UTM_SOURCE_COOKIE)?.value;
    const candidate = fromQuery ?? fromCookie;
    if (isPaidUtmSource(candidate)) {
      requestHeaders.set(WAP_PAID_APPLY_HEADER, candidate!.toLowerCase());
    }
  }

  // Custom-domain → organization resolution (Track E.1).
  // We CANNOT call Prisma from Edge runtime, so middleware only consults
  // an in-process cache populated by Node-runtime resolvers (see
  // `lib/tenant/resolveOrgFromRequest.ts`). On a cache miss we just
  // forward `x-wap-host` and let the resolver do the DB lookup.
  const normalizedHost = normalizeHost(request.headers.get('host'));
  if (normalizedHost) {
    requestHeaders.set(WAP_HOST_HEADER, normalizedHost);
    if (!isCanonicalHost(normalizedHost)) {
      const cachedOrgId = customDomainCache.get(normalizedHost);
      if (cachedOrgId && cachedOrgId !== NO_ORG_SENTINEL) {
        requestHeaders.set(WAP_ORG_ID_HEADER, cachedOrgId);
      }
    }
  }

  // Marketing URLs: require /{locale}/… in the browser
  if (!prefixLocale && !isLocaleBypassPath(pathname) && isLocaleableMarketingPath(pathname)) {
    const loc = inferredLocale;
    const target = new URL(withLocalePrefix(pathname, loc), request.url);
    // Persist explicit ?lang= choice and strip it from the URL for cleanliness
    if (localeFromQuery) {
      target.searchParams.delete('lang');
      const redirectResponse = NextResponse.redirect(target, 308);
      redirectResponse.cookies.set(WAP_LOCALE_COOKIE, loc, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
      return redirectResponse;
    }
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  // Strip locale prefix internally (URL bar still shows /es/…)
  let rewriteUrl: URL | null = null;
  if (prefixLocale && pathnameWithoutLocale !== pathname) {
    rewriteUrl = new URL(pathnameWithoutLocale, request.url);
    rewriteUrl.search = request.nextUrl.search;
  }

  let response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  if (effectivePath === '/apply') {
    const fromQuery = request.nextUrl.searchParams.get('utm_source');
    if (fromQuery && isPaidUtmSource(fromQuery)) {
      response.cookies.set(UTM_SOURCE_COOKIE, fromQuery.toLowerCase(), {
        path: '/',
        maxAge: UTM_SOURCE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
    }
    // Organic /apply (no ?ref=): expire sticky enroll attribution so the next
    // applicant on a shared device is not stamped as Concordia (etc.). Explicit
    // ?ref= keeps / refreshes attribution via ApplyRefCapture + signup body.
    const applyRef = request.nextUrl.searchParams.get('ref');
    if (!applyRef && request.cookies.get(PARTNER_REF_COOKIE)) {
      response.cookies.set(PARTNER_REF_COOKIE, '', partnerRefCookieClearOptions());
    }
  }

  // Partner attribution: a student who lands on `/enroll/<partner-slug>`
  // gets a 30-day httpOnly cookie. Signup reads it only when the body has
  // no `referralRef`. Gated on `shouldCaptureEnrollRef` so embeds cannot plant it.
  const partnerRef = partnerRefFromEnrollPath(effectivePath);
  if (partnerRef && shouldCaptureEnrollRef(request.method, request.headers)) {
    response.cookies.set(PARTNER_REF_COOKIE, partnerRef, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: PARTNER_REF_COOKIE_MAX_AGE,
    });
  }

  // Echo the request ID on the response so the client and intermediate
  // logs can correlate to server-side logs/Sentry events.
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // Report-Only CSP on the document response. The enforced header keeps
  // coming from next.config.ts; this one only files reports at /api/csp-report.
  // The rebuilt-response path below copies every non-x-middleware header, so
  // it survives the user-id rebuild and the auth redirects.
  if (cspReportOnlyPolicy) {
    response.headers.set(CSP_REPORT_ONLY_HEADER, cspReportOnlyPolicy);
    response.headers.set(CSP_REPORTING_ENDPOINTS_HEADER, buildReportingEndpointsHeader());
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtectedPath(effectivePath)) {
      const loginUrl = new URL(localizedLoginPath(prefixLocale ?? inferredLocale), request.url);
      loginUrl.searchParams.set('redirectTo', requestedPathWithSearch(request));
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const needsValidatedUser =
    isProtectedPath(effectivePath) ||
    isTenantApiPath(effectivePath) ||
    (isStaffMfaEnforcementEnabled() &&
      (isAdminPath(effectivePath) || isAdminApiPath(effectivePath)));
  const hasAuthCookie = hasSupabaseAuthCookies(request.cookies);

  // Anonymous public HTML must not construct a GoTrue client. Protected /
  // tenant-api paths still validate; cookie-bearing public pages still
  // refresh the session so /apply and /en expiry UX stays intact.
  if (!shouldTalkToGoTrue({ needsValidatedUser, hasAuthCookie })) {
    return response;
  }

  const sessionOnly = request.cookies.get(SESSION_ONLY_COOKIE)?.value === '1';
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseCookieOptions(sessionOnly),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Session validation must not consume a separate in-progress PKCE flow.
          if (isSupabasePkceCookieName(name)) return;
          if (sessionOnly) {
            const { maxAge: _drop1, expires: _drop2, ...rest } = (options ?? {}) as Record<string, unknown>;
            response.cookies.set(name, value, rest);
          } else {
            response.cookies.set(name, value, options ?? {});
          }
        });
      },
    },
  });

  let user: User | null = null;
  let clearedInvalidSession = false;
  const handleAuthFailure = (error: unknown) => {
    if (reportAuthReadFailure(error, 'middleware') !== 'stale_session') return;
    clearedInvalidSession = true;
    // Include SDK-created chunks, but never clear PKCE or application preferences.
    const names = new Set([...request.cookies.getAll(), ...response.cookies.getAll()].map(c => c.name));
    for (const name of names) {
      if (!isSupabaseAuthTokenCookieName(name)) continue;
      request.cookies.delete(name);
      response.cookies.set(name, '', { ...getSupabaseCookieOptions(), maxAge: 0 });
    }
    requestHeaders.set('cookie', request.cookies.toString());
  };
  try {
    if (needsValidatedUser) {
      const result = await readAuthWithRetry(() => supabase.auth.getUser());
      if (result.error) handleAuthFailure(result.error);
      else user = result.data.user;
    } else {
      const result = await readAuthWithRetry(() => supabase.auth.getSession());
      if (result.error) handleAuthFailure(result.error);
      else user = result.data.session?.user ?? null;
    }
  } catch (error) {
    handleAuthFailure(error);
  }

  // Redirects/401s must retain session clears, refresh cookies and correlation.
  const withAuthResponseState = (target: NextResponse) => {
    response.headers.forEach((value, key) => {
      const name = key.toLowerCase();
      if (!name.startsWith('x-middleware-') && !['set-cookie', 'content-type', 'content-length', 'location'].includes(name) && !target.headers.has(key)) {
        target.headers.set(key, value);
      }
    });
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  };

  // Forward user ID to Node runtime so SSR layouts / API routes can set
  // PostgreSQL GUCs without repeating the Supabase round-trip. Protected
  // paths use getUser() (GoTrue-verified). Cookie-bearing public HTML uses
  // getSession() so logged-in /en and /apply still provision and set Sentry.
  // NextResponse.next()/rewrite() snapshot the forwarded request headers at
  // construction time, so mutating `requestHeaders` after the fact never
  // reaches the app — rebuild the response with the updated headers and
  // carry over everything already set on the original (request-id echo,
  // Supabase session cookies).
  if (user?.id || clearedInvalidSession) {
    if (user?.id) requestHeaders.set(WAP_USER_ID_HEADER, user.id);
    if (user?.id && validReadOnlyAuditToken) {
      requestHeaders.set(READ_ONLY_PORTAL_AUDIT_HEADER, '1');
    }
    const rebuilt = rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!k.startsWith('x-middleware-') && k !== 'set-cookie') rebuilt.headers.set(key, value);
    });
    for (const cookie of response.cookies.getAll()) rebuilt.cookies.set(cookie);
    response = rebuilt;
  }

  if (isProtectedPath(effectivePath) && !user) {
    const loginUrl = new URL(localizedLoginPath(prefixLocale ?? inferredLocale), request.url);
    loginUrl.searchParams.set('redirectTo', requestedPathWithSearch(request));
    return withAuthResponseState(NextResponse.redirect(loginUrl));
  }

  // API backstop: ordinary API calls return JSON 401. A very small set of
  // GET endpoints are browser navigation targets; let those route handlers
  // issue their destination-preserving login redirect instead.
  if (
    isTenantApiPath(effectivePath)
    && !user
    && !isUnauthenticatedBrowserNavigationApiPath(request.method, effectivePath)
  ) {
    return withAuthResponseState(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  if (isStaffMfaEnforcementEnabled() && isStaffMfaPath(effectivePath) && user) {
    let aalData;
    try {
      const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!result.error) aalData = result.data;
    } catch {
      // A provider outage must not turn the staff MFA gate into an allow.
    }
    const preserveSessionCookies = (blocked: NextResponse) => {
      for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
      blocked.headers.set('Cache-Control', 'no-store');
      return blocked;
    };
    if (!aalData || (aalData.currentLevel !== 'aal1' && aalData.currentLevel !== 'aal2')) {
      return preserveSessionCookies(NextResponse.json(
        { error: 'Unable to verify MFA. Please try again.' }, { status: 503 },
      ));
    }
    if (aalData.currentLevel === 'aal2') return response;

    const enrolled = aalData.nextLevel === 'aal2';
    if (enrolled) {
      const trustedDevice = await verifyAdminMfaTrustToken({
        token: request.cookies.get(getAdminMfaTrustCookieName())?.value,
        userId: user.id,
        userAgent: request.headers.get('user-agent'),
        ip: getClientIpFromRequest(request),
      }).catch(() => false);

      if (trustedDevice) {
        return response;
      }
    }

    // Auth setup/challenge/logout endpoints are outside these staff prefixes,
    // so an AAL1 session can still enroll, verify, recover, or sign out.
    if (effectivePath.startsWith('/api/')) {
      return preserveSessionCookies(NextResponse.json(
        { error: enrolled ? 'MFA required' : 'MFA setup required', code: enrolled ? 'MFA_REQUIRED' : 'MFA_SETUP_REQUIRED' },
        { status: 403 },
      ));
    }
    const mfaUrl = new URL(enrolled ? '/verify-mfa' : '/setup-mfa', request.url);
    mfaUrl.searchParams.set('next', requestedPathWithSearch(request));
    return preserveSessionCookies(NextResponse.redirect(mfaUrl));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
