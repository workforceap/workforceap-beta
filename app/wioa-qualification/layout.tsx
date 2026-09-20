import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickWioaClientMessages } from '@/lib/i18n/pickRootClientMessages';

/**
 * `WioaQualificationClient` reads `useTranslations('wioa')` on the client. The
 * root layout ships only chrome + marketing client keys, so without this
 * provider the public screening page rendered raw `wioa.*` keys in every
 * locale. Attach the catalog here (like `app/invite/layout.tsx` does for
 * `auth`) so the root marketing payload stays small.
 */
export default async function PublicWioaQualificationLayout({ children }: { children: React.ReactNode }) {
  const messages = pickWioaClientMessages(await getMessages());
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
