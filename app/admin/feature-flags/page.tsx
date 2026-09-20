import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { fetchFeatureFlags } from '@/lib/feature-flags/adminApi';
import { captureApiError } from '@/lib/observability/captureApiError';
import { DesignSurface } from '@/components/portal/kit';
import {
  FeatureFlagsKit,
  type FeatureFlagRow,
} from '@/components/portal/kit/pages/admin-subviews/FeatureFlagsKit';
import AdminFeatureFlagsClient from '@/components/admin/AdminFeatureFlagsClient';
import OrgWideChangeNotice from '@/components/admin/OrgWideChangeNotice';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin - Feature Flags',
    description: 'Manage gradual rollout and role-gating of platform features.',
    path: '/admin/feature-flags',
  });
}

/** Recent-change window for the "Changed (7d)" KPI. */
const RECENT_WINDOW_DAYS = 7;

/** Short "updated" caption, e.g. "Jun 18". */
function formatUpdated(d: Date): string {
  try {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export default async function AdminFeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/feature-flags');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;
  // Non-super admins can edit flags today; make the org-wide blast radius visible.
  const notice = scope.superAdmin ? null : <OrgWideChangeNotice surface="feature-flags" />;

  // --- LEGACY (?ui=legacy): the proven interactive create/toggle/edit workspace ---
  if (ui === 'legacy') {
    return <AdminFeatureFlagsClient notice={notice} />;
  }

  // --- DEFAULT: design-kit registry wired into real flag data ---
  let flags: Awaited<ReturnType<typeof fetchFeatureFlags>>;
  try {
    flags = await fetchFeatureFlags();
  } catch (error) {
    // Core query failed: fall back to the proven interactive workspace rather
    // than rendering a fabricated/empty kit.
    captureApiError(error, { route: 'admin/feature-flags', extra: { view: 'kit' } });
    redirect('/admin/feature-flags?ui=legacy');
  }

  const recentCutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const rows: FeatureFlagRow[] = flags.map((f) => ({
    id: f.id,
    name: f.name,
    key: f.key,
    description: f.description?.trim() || '—',
    enabled: f.enabled,
    rolloutPercentage: f.rolloutPercentage,
    updated: formatUpdated(f.updatedAt),
  }));

  const total = flags.length;
  const on = flags.filter((f) => f.enabled).length;
  const off = total - on;
  const recentlyChanged = flags.filter((f) => f.updatedAt.getTime() >= recentCutoff).length;

  return (
    <DesignSurface surface="dense">
      <FeatureFlagsKit
        flags={rows}
        total={total}
        on={on}
        off={off}
        recentlyChanged={recentlyChanged}
        notice={notice}
      />
    </DesignSurface>
  );
}
