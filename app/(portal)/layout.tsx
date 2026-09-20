import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import PartnerExclusiveServerGate from '@/components/portal/PartnerExclusiveServerGate';
import PortalLayoutClient from '@/components/portal/PortalLayoutClient';
import { Suspense } from 'react';
import { preload } from 'react-dom';
import LegacyViewNotice from '@/components/portal/LegacyViewNotice';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import '@/css/portal.css';
import '@/css/portal-a11y.css';
import '@/css/counselor.css';
import '@/css/language-toggle.css';
import '@/css/mobile-dashboard-fixes.css';

export const metadata: Metadata = {
  title: 'Portal',
  robots: {
    index: false,
    follow: false,
  },
};

// Authenticated portal pages do heavy per-request server work (auth + member
// state + several DB reads + best-effort Coursera). Under the default function
// limit a cold-start render could exceed the budget and 504 ("Vercel Runtime
// Timeout" → the portal error boundary). Give the segment ample headroom so a
// slow render completes instead of erroring. Applies to all (portal) pages.
export const maxDuration = 60;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Legacy portal pages still render `.material-symbols-outlined` ligatures, so
  // the self-hosted font is preloaded here rather than from the root layout
  // (WAP-110 keeps it off the public site, the apply funnel and the shell).
  preload('/fonts/material-symbols-outlined.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  const messages = pickPortalClientMessages(await getMessages());
  return (
    <NextIntlClientProvider messages={messages}>
      <PartnerExclusiveServerGate />
      <Suspense fallback={null}>
        <LegacyViewNotice />
      </Suspense>
      <PortalLayoutClient>{children}</PortalLayoutClient>
    </NextIntlClientProvider>
  );
}
