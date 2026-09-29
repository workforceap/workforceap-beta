import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

/** Paths where we skip partner→/partner redirect (dedicated shells or legacy redirects). */
const SKIP_PREFIXES = [
  '/partner',
  '/employer',
  '/counselor',
  '/admin',
  '/certifications',
  '/profile',
  '/resources',
  '/help',
  '/account',
  '/dashboard/help',
  '/dashboard/account',
  '/dashboard/career-library',
];

/**
 * Partner-only accounts should not use member portal surfaces. Redirect server-side
 * so we avoid a flash of member UI (client redirect in PortalShell is then redundant).
 */
export default async function PartnerExclusiveServerGate() {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-pathname') ?? '';
  const readOnlyAudit = isReadOnlyPortalAuditHeader(requestHeaders);
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const user = await getUser();
  if (!user) return null;

  let redirectToPartner = false;
  try {
    const superAdmin = await withDbRetry(() => isSuperAdmin(user.id));
    const partnerCtx = await withDbRetry(() =>
      getPartnerForUser(user.id, { isSuperAdminHint: superAdmin }),
    );
    redirectToPartner = Boolean(partnerCtx && !superAdmin);
  } catch (e) {
    console.error('[PartnerExclusiveServerGate] role lookup failed', e);
    if (readOnlyAudit) {
      return <span hidden data-portal-error-state="partner-exclusive-role-lookup" />;
    }
    /* Fail open: allow member UI when DB is unavailable; partner redirect is best-effort */
  }

  // Next's redirect throws. Keep it outside the role-lookup catch so an
  // authorized redirect cannot be mistaken for a failed database lookup.
  if (redirectToPartner) redirect('/partner');
  return null;
}
