import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickAdminClientMessages, pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import DevPartnerFrame from './DevPartnerFrame';
import DevReviewBar from '../DevReviewBar';
// Full portal stylesheet chain so staff-side kits (incl. the counselor roster,
// which needs counselor.css) render exactly as production does.
import '@/css/portal.css';
import '@/css/portal-a11y.css';
import '@/css/counselor.css';
import '@/css/language-toggle.css';
import '@/css/mobile-dashboard-fixes.css';

export const metadata = { robots: { index: false, follow: false } };

export default async function DevStaffLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') return children;
  const messages = await getMessages();
  // The fixtures render the same client tables and actions as both portal
  // groups; the marketing root intentionally omits these namespaces.
  return <NextIntlClientProvider messages={{ ...pickAdminClientMessages(messages), ...pickPortalClientMessages(messages) }}><DevReviewBar /><DevPartnerFrame>{children}</DevPartnerFrame></NextIntlClientProvider>;
}
