import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { redirect } from 'next/navigation';
import { getAnalyticsOverview } from '@/lib/admin/analytics';
import { reportingRedirectHref, wantsLegacyView } from '@/lib/admin/reportingHub';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('analyticsPageTitle'),
    description: t('analyticsPageDescription'),
    path: '/admin/analytics',
  });
}

/**
 * Analytics is the Overview tab of the reporting hub now (admin audit
 * 2026-09-19, §6.1): the engagement loader moved to
 * `lib/admin/engagementAnalytics.ts` and the "Enrollment and outcomes" tab
 * sits on the same Overview, so both `?tab=` values land there. The original
 * enrollment/outcomes dashboard stays reachable behind `?ui=legacy` only.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  if (!wantsLegacyView(sp)) redirect(reportingRedirectHref('/admin/analytics', sp));

  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/admin/analytics');
  }

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const orgId = scope.superAdmin ? undefined : scope.orgId;
  const data = await getAnalyticsOverview(orgId ?? undefined);
  return <AnalyticsDashboard data={data} />;
}
