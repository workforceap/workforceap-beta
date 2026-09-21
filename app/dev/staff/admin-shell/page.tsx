import { notFound } from 'next/navigation';
import AdminPortalShell from '@/components/portal/AdminPortalShell';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';

/**
 * Showcase-only render of the admin workspace shell — the grouped command rail
 * (every `ADMIN_PORTAL_NAV_ITEMS` row, super-admin rows included), the header,
 * and the mobile drawer — around the Command Center kit's built-in showcase
 * data. No auth/DB: `readOnlyAudit` keeps the shell from polling nav badges,
 * and `tour={null}` renders the pre-flag chrome. Used by screenshot tooling
 * (see scripts/portal-screenshots.mjs) to photograph sidebar changes.
 */
export const dynamic = 'force-dynamic';

export default function DevStaffAdminShellPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <AdminPortalShell superAdmin readOnlyAudit tour={null}>
      <CommandCenterKit />
    </AdminPortalShell>
  );
}
