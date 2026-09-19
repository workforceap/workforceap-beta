import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { DEFAULT_LOCALE, WAP_LOCALE_HEADER, isAppLocale, isRtlLocale } from '@/lib/i18n/config';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickRootClientMessages } from '@/lib/i18n/pickRootClientMessages';
import JsonLd from '@/components/JsonLd';
import ConditionalMarketingNav from '@/components/ConditionalMarketingNav';
import OrgBrandingStyle from '@/components/platform/OrgBrandingStyle';
import ThemeInitScript from '@/components/theme/ThemeInitScript';
import UtmCapture from '@/components/marketing/UtmCapture';
import { Suspense } from 'react';
import { getRequestOrgBranding } from '@/lib/platform/defaultOrgTheme';
import { WAP_RESERVE_MOBILE_BOTTOM_NAV_HEADER } from '@/lib/nav/mobileBottomNavLayout';
import { WAP_PAID_APPLY_HEADER } from '@/lib/apply/paidApplyUtm';
import {
  gucContextStorage,
  buildGucContext,
  runWithGucContext,
} from '@/lib/db/gucContext';
import { getProfileRole } from '@/lib/auth/roles';
import { resolveLayoutUserId, WAP_USER_ID_HEADER } from '@/lib/auth/layoutUserId';
import { getUser } from '@/lib/auth/server';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';
import '@/css/main.css';
import '@/css/marketing.css';
import '@/css/marketing-depth.css';
import '@/css/language-toggle.css';
import '@/css/marketing-a11y.css';
import { DEFAULT_MARKETING_HERO_PHOTO } from '@/lib/marketing/heroPhotos';
// Astryx design system (site-wide, coexistence-safe): both files ship inside
// CSS cascade layers (`reset` / `astryx-base`), and LAYERED styles always lose
// to the app's unlayered CSS above — so the 11 shared token names (e.g.
// --color-accent, --color-error) keep the app's values everywhere, which also
// brand-aligns Astryx components to WorkforceAP crimson automatically. Astryx
// dark mode follows the existing theme system via `color-scheme`.
// Policy: AGENTS.md "Astryx design system" + docs/KIT_GUIDE.md §9.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@/css/astryx-brand-bridge.css';
import DeferredRootChrome from '@/components/DeferredRootChrome';
import SentrySetUser from '@/components/observability/SentrySetUser';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-53JCT6WN';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.workforceap.org'),
  /** Default member-portal manifest; counselor routes override via `manifest` in `(portal)/counselor/layout.tsx`. */
  manifest: '/manifest.json',
  title: {
    default: 'Career Training at No Cost to Members | Workforce Advancement Project',
    template: '%s - Workforce Advancement Project',
  },
  description:
    'Occupational and career training, industry certifications, and support in Technology, Data, AI, Healthcare, Manufacturing, and Skilled Trades.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Workforce Advancement Project',
    description:
      'Career training and industry certifications in Technology, Data, AI, Healthcare, Manufacturing, and Skilled Trades.',
    url: '/',
    siteName: 'Workforce Advancement Project',
    locale: 'en_US',
    type: 'website',
    images: [{ url: DEFAULT_MARKETING_HERO_PHOTO, width: 1200, height: 630, alt: 'Workforce Advancement Project members in career training' }],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const readOnlyAudit = isReadOnlyPortalAuditHeader(h);

  // Build GUC context from the user ID forwarded by middleware.
  // Middleware strips any client-supplied x-wap-user-id and only re-adds it
  // after getUser() (protected/tenant-api) or getSession() (public HTML
  // that already has a Supabase cookie). Do not fall back to getUser()
  // here — anonymous marketing/apply first paint must not talk to GoTrue.
  const forwardedUserId = h.get(WAP_USER_ID_HEADER);
  const candidateUserId = resolveLayoutUserId(forwardedUserId);
  // Middleware verifies the provider session, but cannot check application
  // deletion in Edge. Never bootstrap roles from its header after getUser()
  // rejects that identity (including a failed application-status lookup).
  const supabaseUser = candidateUserId ? await getUser() : null;
  const resolvedUserId = supabaseUser?.id === candidateUserId ? candidateUserId : null;
  let bootstrapLoadFailed = false;

  // Resolve the real org for EVERY request path — authenticated or anonymous.
  // For authenticated users: org comes from the user row. For anonymous users:
  // org resolves from the request (custom domain / subdomain headers) or falls
  // back to the default org. Never pass orgId: null to the GUC context — that
  // breaks every org-scoped RLS policy once FORCE ROW LEVEL SECURITY is enabled
  // (AUDIT §C-T6, Sprint 2 compliance P0).
  let gucCtx: import('@/lib/db/gucContext').GucContext;
  if (resolvedUserId) {
    // Self-heal orphaned auth users at the central post-auth choke point.
    //
    // The root layout is the single seam EVERY authenticated render passes
    // through (portal pages bootstrap their GUC here, not via
    // resolveAuthGucContext), so provisioning here heals a missing
    // `users`/`profiles` row before any downstream path can crash:
    // member_events FK on trackEvent at login, "Member not found" on
    // /dashboard and /dashboard/resume, and the P2025 on
    // /api/member/wioa-qualification's user.update. ensureAppUserProvisioned
    // is idempotent and cheap (one fast-path read) when the rows already
    // exist. We need the full Supabase user (email/metadata) to populate the
    // new rows; getUser() is request-cached so this is free. Best-effort —
    // a failure must not block the render; the GUC bootstrap below still runs.
    if (supabaseUser) {
      await ensureAppUserProvisioned(supabaseUser, { headers: h, readOnlyAudit }).catch((err) => {
        bootstrapLoadFailed = true;
        console.error('[layout:guc] ensureAppUserProvisioned failed; continuing', err);
      });
    }
    // Bootstrap lookups run inside a partial GUC context carrying the verified
    // userId so the `users_select_own` RLS policy (`id = get_current_user_id()`)
    // permits the self-read once FORCE ROW LEVEL SECURITY is enabled. Without
    // it the lookup would be denied and silently degrade back to orgId null.
    const bootstrapCtx = buildGucContext({ userId: resolvedUserId, orgId: null });
    const [profileRole, userRow] = await runWithGucContext(bootstrapCtx, () =>
      Promise.all([
        // Wrapped in withDbRetry so a transient pooler blip on this read
        // degrades gracefully via retry instead of throwing and crashing the
        // root layout render (2026-06-30 incident; mirrors the organizationId
        // lookup below and resolveAuthGucContext() in lib/auth/server.ts).
        withDbRetry(() => getProfileRole(resolvedUserId)).catch((err) => {
          bootstrapLoadFailed = true;
          console.error('[layout:guc] getProfileRole bootstrap lookup failed; defaulting to member role', err);
          return 'member';
        }),
        // Resolve the user's organization so the GUC carries `app.current_org_id`.
        // Previously orgId was hardcoded to null here, which makes every RLS
        // policy that calls `can_access_org_row(check_org_id)` evaluate with
        // NULL once FORCE ROW LEVEL SECURITY is enabled (AUDIT §C-T6). Mirrors
        // resolveAuthGucContext() in lib/auth/server.ts.
        //
        // Must run inside an explicit $transaction: since #1631 the Prisma
        // middleware fail-closes (throws) on queries that run with an active
        // GUC context outside a $transaction. The previous bare findUnique
        // always threw here and orgId silently degraded to null.
        withDbRetry(() =>
          prisma
            .$transaction((tx) =>
              tx.user.findUnique({ where: { id: resolvedUserId }, select: { organizationId: true } }),
            ),
        )
          .catch((err) => {
            bootstrapLoadFailed = true;
            console.error('[layout:guc] organizationId bootstrap lookup failed; GUC degrades to orgId null', err);
            return null;
          }),
      ]),
    );
    gucCtx = buildGucContext({
      userId: resolvedUserId,
      orgId: userRow?.organizationId ?? null,
      profileRole,
    });
  } else {
    // Anonymous request: resolve org from request headers (custom domain / subdomain)
    // or fall back to the default org. This ensures server components and RLS
    // policies always see a real orgId, never null.
    const anonymousOrgId = await resolveOrgFromRequest(h);
    gucCtx = buildGucContext({ userId: null, orgId: anonymousOrgId });
  }

  const orgBranding = await getRequestOrgBranding(h, Date.now(), { readOnlyAudit });
  const rawLang = h.get(WAP_LOCALE_HEADER);
  const htmlLang = rawLang && isAppLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const htmlDir = isRtlLocale(htmlLang) ? 'rtl' : 'ltr';
  const messages = pickRootClientMessages(await getMessages());
  const reserveMobileBottomNav = h.get(WAP_RESERVE_MOBILE_BOTTOM_NAV_HEADER) === '1';
  const hidePaidApplyMarketingNav = Boolean(h.get(WAP_PAID_APPLY_HEADER));
  const htmlClassName = reserveMobileBottomNav ? 'wap-reserve-mobile-bottom-nav' : undefined;

  return await gucContextStorage.run(gucCtx, async () => (
    <html
      lang={htmlLang}
      dir={htmlDir}
      suppressHydrationWarning
      className={`${inter.variable}${htmlClassName ? ' ' + htmlClassName : ''}`}
      data-portal-read-only-audit={readOnlyAudit ? '1' : undefined}
    >
      <head>
        <ThemeInitScript />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var KEY='wap:chunk-reload-once';try{sessionStorage.removeItem(KEY);}catch(_s){}var shouldRecover=function(input){var text='';if(typeof input==='string')text=input;else if(input&&typeof input==='object'){text=[input.name,input.message,input.reason,input.request].filter(Boolean).join(' ');}text=String(text||'').toLowerCase();return text.includes('chunkloaderror')||text.includes('loading chunk')||text.includes('failed to fetch dynamically imported module');};var reloadOnce=function(){try{if(sessionStorage.getItem(KEY)==='1')return;sessionStorage.setItem(KEY,'1');}catch(_e){}window.location.reload();};window.addEventListener('error',function(event){var err=event&&event.error?event.error:null;var message=(event&&event.message)|| (err&&err.message) || err; if(shouldRecover(message)) reloadOnce();},{capture:true});window.addEventListener('unhandledrejection',function(event){var reason=event&&'reason' in event?event.reason:null; if(shouldRecover(reason)){if(event&&event.preventDefault)event.preventDefault();reloadOnce();}},{capture:true});}catch(_e){}})();`,
          }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="WorkforceAP" />
        <meta name="theme-color" content="#ad2c4d" />
        <link rel="apple-touch-icon" href="/images/icon-192x192.png" />
        {!readOnlyAudit ? (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
            <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
          </>
        ) : null}

        <link
          rel="preload"
          href="/fonts/material-symbols-outlined.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Material Symbols Outlined is self-hosted via @font-face in main.css */}
        {/* Register service worker — updateViaCache:'none' ensures browser always fetches fresh sw.js */}
        {!readOnlyAudit ? (
          <Script id="sw-register" strategy="lazyOnload">
            {`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(r){r.update()}).catch(function(){})}`}
          </Script>
        ) : null}
      </head>
      <body className="marketing-touch-target">
        {bootstrapLoadFailed ? <span hidden data-portal-error-state="root-auth-org-bootstrap" /> : null}
        {readOnlyAudit && (
          <>
            <span hidden data-portal-audit-suppressed="root-organization-branding-data-cache" />
            <span hidden data-portal-audit-suppressed="root-gtm-sentry-utm-and-provider-metrics" />
            <span hidden data-portal-audit-suppressed="root-service-worker-registration" />
          </>
        )}
        <OrgBrandingStyle branding={orgBranding} />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Second skip link for keyboard users on portal pages with a fixed
            mobile bottom nav (audit #146). The nav is far from the
            top tab order; this lets a tab-only user reach it directly.
            Only render when middleware has signalled that this page
            actually has the mobile bottom nav — otherwise the link
            anchored to `#mobile-bottom-nav` lands nowhere on admin / auth
            / many member portal pages and confuses keyboard users. */}
        {reserveMobileBottomNav && (
          <a href="#mobile-bottom-nav" className="skip-link">
            Skip to navigation
          </a>
        )}
        {GTM_ID && !readOnlyAudit && (
          <>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                height="0"
                width="0"
                style={{ display: 'none', visibility: 'hidden' }}
              />
            </noscript>
            {/* Google Consent Mode v2: deny by default, then sync with the
                cookie banner. Tags loaded by GTM honor these defaults until
                an `update` is pushed by CookieConsentBanner. */}
            <Script
              id="gtm-consent-default"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;var stored=null;try{stored=JSON.parse(localStorage.getItem('wap-cookie-consent')||'null');}catch(_e){}var decision=stored&&(stored.decision||(stored.accepted===true?'accepted':stored.accepted===false?'declined':null));var v=decision==='accepted'?'granted':'denied';gtag('consent','default',{ad_storage:v,ad_user_data:v,ad_personalization:v,analytics_storage:v,wait_for_update:500});})();`,
              }}
            />
            <Script
              id="gtm"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
              }}
            />
          </>
        )}
        <JsonLd />
        {/* Capture UTM + referrer on every entry point, not just /apply,
            /login, /signup. Paid clicks that land on /en, /programs, etc.
            and then click through to /apply otherwise arrive without
            attribution. Suspense boundary required because UtmCapture
            uses useSearchParams. */}
        {!readOnlyAudit ? (
          <Suspense fallback={null}>
            <UtmCapture />
          </Suspense>
        ) : null}
        <NextIntlClientProvider messages={messages}>
        <ConditionalMarketingNav forceHidden={hidePaidApplyMarketingNav} />
        <main id="main-content">{children}</main>
        <DeferredRootChrome suppressAnalytics={readOnlyAudit} />
        </NextIntlClientProvider>
        {!readOnlyAudit ? <SentrySetUser userId={resolvedUserId} /> : null}
      </body>
    </html>
  ));
}
