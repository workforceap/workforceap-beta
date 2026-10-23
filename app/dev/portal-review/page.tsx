import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import inventory from '@/docs/qa/portal-consolidation/route-inventory.json';
import PortalReviewClient from './PortalReviewClient';
import '@/css/portal.css';
import '@/css/portal-a11y.css';

export const metadata = { title: 'Portal preview review · WorkforceAP', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Preview-only review aid; every linked portal keeps its normal auth gates. */
export default async function PortalReviewPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <NextIntlClientProvider messages={pickPortalClientMessages(await getMessages())}><PortalReviewClient inventory={inventory} revision={process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'} /></NextIntlClientProvider>;
}
