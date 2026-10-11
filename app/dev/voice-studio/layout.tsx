import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import '@/css/portal.css';

export const metadata = {
  title: 'Voice Studio — Dev Proof',
  robots: { index: false, follow: false },
};

export default async function DevVoiceStudioLayout({ children }: { children: ReactNode }) {
  const [locale, catalog] = await Promise.all([getLocale(), getMessages()]);
  const messages = pickPortalClientMessages(catalog);
  return <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>;
}
