import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

/** Match the portal's translation context when rendering a server page in jsdom. */
export function withPortalIntl(children: ReactNode) {
  return <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>;
}
