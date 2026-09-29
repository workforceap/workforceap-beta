import type { Metadata } from 'next';
import { Suspense } from 'react';
import { preload } from 'react-dom';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { getUser } from '@/lib/auth/server';
import { getProfileRole } from '@/lib/auth/roles';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { deniedPortalHomeHref } from '@/lib/auth/portalGuards';
import AdminPortalShell from '@/components/portal/AdminPortalShell';
import LegacyViewNotice from '@/components/portal/LegacyViewNotice';
import OrgBrandingBar from '@/components/platform/OrgBrandingBar';
import { getDefaultOrgBranding } from '@/lib/platform/defaultOrgTheme';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { pickAdminClientMessages } from '@/lib/i18n/pickRootClientMessages';
import '@/css/portal.css';
import '@/css/counselor.css';
import '@/css/language-toggle.css';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { getHomeTourForRole } from '@/lib/tours/registry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login');
  // Admin surfaces still use Material Symbols ligatures; preload here (WAP-110
  // removed the root-layout preload so public routes never fetch the font).
  preload('/fonts/material-symbols-outlined.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const messages = pickAdminClientMessages(await getMessages());

  try {
    const scope = await resolveAdminPageTenant(user.id);
    if (!scope.ok) redirect(await deniedPortalHomeHref(user.id, 'admin'));
    const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

    const adminTour = getHomeTourForRole('admin');
    const [branding, portalRoles, tour, effectiveRole] = await Promise.all([
      getDefaultOrgBranding({ readOnlyAudit }),
      getPortalSwitcherRoles(user.id, {
        superAdmin: scope.superAdmin,
        hasAdmin: true,
      }),
      // Guided tour gate (flag `guided_tours_v2` + this user's tour state). Never throws.
      adminTour ? getTourOffer(user.id, adminTour.key) : Promise.resolve(null),
      getProfileRole(user.id),
    ]);

    return (
      // Opt the entire admin route group out of browser translation.
      //
      // Why: Sentry JAVASCRIPT-NEXTJS-B was firing on /admin/coursera with
      // "NotFoundError: Failed to execute 'removeChild' on 'Node'" — the
      // classic React-vs-DOM-translation race. When Chrome's built-in
      // "Translate this page" or the Google Translate extension wraps text
      // nodes in <font> elements, React's reconciler tries to remove a node
      // it expects to be a direct child but the translation layer has
      // already replaced it. The error is "handled: yes" (caught by the
      // dashboard error boundary) but it's noise in Sentry and a small
      // ux hiccup for translation-extension users.
      //
      // Admin UI is internal staff-only, English-only — no real translation
      // need — so opting the whole admin tree out is the cheapest fix.
      // `translate="no"` is the modern HTML standard; `class="notranslate"`
      // is Google Translate's legacy hint. Both, for compatibility.
      <NextIntlClientProvider messages={messages}>
      <div translate="no" className="notranslate">
        {readOnlyAudit && (
          <span hidden data-portal-audit-suppressed="admin-organization-branding-data-cache" />
        )}
        <OrgBrandingBar branding={branding} />
        {/* useSearchParams requires a Suspense boundary or the admin shell can
            hydrate as a CSR bailout / mismatch (Sentry JAVASCRIPT-NEXTJS-1). */}
        <Suspense fallback={null}>
          <LegacyViewNotice />
        </Suspense>
        <AdminPortalShell
          superAdmin={scope.superAdmin}
          knownIsAdmin={effectiveRole === 'admin'}
          portalRoles={portalRoles}
          readOnlyAudit={readOnlyAudit}
          tour={tour}
        >
          {children}
        </AdminPortalShell>
      </div>
      </NextIntlClientProvider>
    );
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error('[admin/layout] Failed to load admin shell:', err);
    const t = await getTranslations('admin');
    return (
      <NextIntlClientProvider messages={messages}>
      <div data-portal-error-state="admin-shell" className="portal-route-fallback" style={{ padding: '2rem', maxWidth: '36rem' }}>
        <h1 className="portal-route-fallback__title">{t('adminTemporarilyUnavailable')}</h1>
        <p className="portal-route-fallback__desc">
          {t('adminUnavailableDesc')}
        </p>
        <nav className="portal-route-fallback__nav" aria-label="Helpful links">
          <Link href="/admin" className="btn btn-primary btn-sm">
            {t('retryAdminHome')}
          </Link>
          <Link href="/dashboard" className="btn btn-outline btn-sm">
            {t('memberDashboard')}
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">
            {t('workforceAPHome')}
          </Link>
        </nav>
      </div>
      </NextIntlClientProvider>
    );
  }
}
