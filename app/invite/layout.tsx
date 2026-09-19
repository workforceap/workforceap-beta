import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { pickAuthClientMessages } from '@/lib/i18n/pickRootClientMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.invite');
  const base = await buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDescription'),
    path: '/invite',
  });
  return { ...base, robots: { index: false, follow: false } };
}

export default async function InviteLayout({ children }: { children: React.ReactNode }) {
  const messages = pickAuthClientMessages(await getMessages());
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
