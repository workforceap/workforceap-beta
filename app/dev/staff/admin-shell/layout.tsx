import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickAdminClientMessages } from '@/lib/i18n/pickRootClientMessages';

/**
 * `/dev/staff/admin-shell` — the real admin chrome (AdminPortalShell →
 * WorkspaceShell + `ADMIN_PORTAL_NAV_ITEMS`) around the Command Center kit,
 * with the same message slice `app/admin/layout.tsx` ships, so the sidebar can
 * be photographed without auth or a database. Stylesheets come from the
 * `/dev/staff` layout.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function DevStaffAdminShellLayout({ children }: { children: ReactNode }) {
  const messages = pickAdminClientMessages(await getMessages());
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
