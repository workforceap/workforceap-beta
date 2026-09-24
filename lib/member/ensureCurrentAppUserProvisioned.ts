import { cache } from 'react';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';

/**
 * Root layout and portal pages can render in parallel. Share one provisioning
 * promise per authenticated user/request so role reads cannot cache an
 * Auth-only snapshot while the root layout is still creating app rows.
 */
export const ensureCurrentAppUserProvisioned = cache(async function ensureCurrentAppUserProvisioned(
  userId: string,
): Promise<void> {
  const user = await getUser();
  if (!user || user.id !== userId) {
    throw new Error('Authenticated user changed during application provisioning');
  }
  const requestHeaders = await headers();
  await ensureAppUserProvisioned(user, {
    headers: requestHeaders,
    readOnlyAudit: isReadOnlyPortalAuditHeader(requestHeaders),
  });
});
