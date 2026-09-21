import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { redirect } from 'next/navigation';
import { getBoardSnapshot } from '@/lib/admin/boardOutcomes';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import OutcomesSnapshot from '@/components/admin/OutcomesSnapshot';
import { parseReportingPeriod, reportingRedirectHref, wantsLegacyView } from '@/lib/admin/reportingHub';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('outcomes.title') || 'Outcomes Dashboard',
    description: t('outcomes.description') || 'Placement rates, salary data, and program effectiveness',
    path: '/admin/outcomes',
  });
}

/**
 * Placement outcomes is the Outcomes tab of the reporting hub now (admin
 * audit 2026-09-19, §6.1); the period travels with the redirect. The legacy
 * `OutcomesSnapshot` truth-set view stays reachable behind `?ui=legacy` only.
 */
export default async function OutcomesPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; ui?: string }>;
}) {
  const params = (await searchParams) ?? {};
  if (!wantsLegacyView(params)) redirect(reportingRedirectHref('/admin/outcomes', params));

  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/admin/outcomes');
  }

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  // Same loader and actor-org scope the page has always used; the period is
  // validated instead of cast so an unknown value reads as all time.
  const orgId = await getActorOrganizationId(user.id);
  const period = parseReportingPeriod(params.period);
  const snapshot = await getBoardSnapshot(period, orgId ?? undefined);

  return <OutcomesSnapshot initialSnapshot={snapshot} initialPeriod={period} />;
}
