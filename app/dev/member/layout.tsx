import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { assertDevMemberPreview } from '@/app/dev/member/harness/assertDevMemberPreview';
import DevMemberShell from './DevMemberShell';
// Match the real portal's stylesheet chain (app/(portal)/layout.tsx) so the
// showcase renders the kit exactly as production does. portal.css @imports
// portal-kit.css, where the wa-kit-* classes live — without this the member
// kits render essentially unstyled.
import '@/css/portal.css';
import '@/css/portal-a11y.css';
import '@/css/counselor.css';
import '@/css/language-toggle.css';
import '@/css/mobile-dashboard-fixes.css';

export const metadata = { robots: { index: false, follow: false } };

export default async function DevMemberLayout({ children }: { children: ReactNode }) {
  assertDevMemberPreview();
  const messages = pickPortalClientMessages(await getMessages());
  return (
    <NextIntlClientProvider messages={messages}>
      <DevMemberShell>{children}</DevMemberShell>
    </NextIntlClientProvider>
  );
}
