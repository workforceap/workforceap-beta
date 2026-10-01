import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getAdminMetrics } from '@/lib/admin/metrics';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import PageHeader from '@/components/portal/PageHeader';
import AdminAnalyticsCharts from '@/components/admin/AdminAnalyticsChartsLazy';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { reportingRedirectHref, wantsLegacyView } from '@/lib/admin/reportingHub';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('adminAnalytics'),
    description: t('engagementAndActivity'),
    path: '/admin/metrics',
  });
}

/**
 * Metrics is the Overview tab of the reporting hub now (admin audit
 * 2026-09-19, §6.1): the enrollment / outcomes numbers this page printed are
 * on `/admin/reporting`, and the kit view's placeholder SLA tiles ("API p50",
 * "Uptime 30d" — no APM ever fed them) are gone. The legacy charts view
 * (daily activity, enrollment by program, placement charts) stays reachable
 * behind `?ui=legacy` only.
 */
export default async function AdminMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const sp = await searchParams;
  if (!wantsLegacyView(sp)) redirect(reportingRedirectHref('/admin/metrics', sp));

  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/metrics');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const orgId = await getActorOrganizationId(user.id);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const data = await getAdminMetrics(orgId, { readOnlyAudit });
  const t = await getTranslations('admin');

  return (
    <div>
      {readOnlyAudit && (
        <span hidden data-portal-audit-suppressed="admin-metrics-shared-cache" />
      )}
      <PageHeader
        title={t('analytics')}
        subtitle={t('platformEngagement')}
        action={
          <a
            href="/api/admin/funder-program-summary"
            className="btn btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
              download
            </span>
            {t('exportFunderCsv')}
          </a>
        }
      />

      {/* Summary metric strip */}
      <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: t('totalMembers'), value: data.totalMembers, icon: 'groups', accent: 'accent' as const },
          { label: t('weeklyActive'), value: data.weeklyActiveMembers, icon: 'trending_up', accent: 'green' as const },
          { label: t('placements'), value: data.placementStats.placed, icon: 'person_check', accent: 'blue' as const },
          { label: t('placementRate'), value: `${data.placementStats.placementRate}%`, icon: 'analytics', accent: 'gold' as const },
          { label: t('certificates'), value: data.placementStats.certifications, icon: 'workspace_premium', accent: 'green' as const },
          { label: t('aiToolRuns'), value: data.aiToolRuns, icon: 'auto_awesome', accent: 'blue' as const },
        ].map(m => (
          <div key={m.label} className="portal-metric-card">
            <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${m.accent}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
            </div>
            <p className="portal-metric-card__value">{m.value}</p>
            <p className="portal-metric-card__label">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Career OS funnel */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem' }}>
          {t('careerOsTrueCompletionLoop')}
        </p>
        <div className="portal-metric-strip">
          {[
            { label: t('completionEvents'), value: data.careerOsMetrics.completionEventsReceived, icon: 'school', accent: 'accent' as const },
            { label: t('actionsCreated'), value: data.careerOsMetrics.actionsCreated, icon: 'auto_awesome', accent: 'blue' as const },
            { label: t('actionsPending'), value: data.careerOsMetrics.actionsPending, icon: 'pending', accent: 'gold' as const },
            { label: t('actionsCompleted'), value: data.careerOsMetrics.actionsCompleted, icon: 'task_alt', accent: 'green' as const },
            { label: t('completionRate'), value: `${data.careerOsMetrics.followThroughRate}%`, icon: 'trending_up', accent: 'green' as const },
          ].map(m => (
            <div key={m.label} className="portal-metric-card">
              <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${m.accent}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
              </div>
              <p className="portal-metric-card__value">{m.value}</p>
              <p className="portal-metric-card__label">{m.label}</p>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {t('careerOsDescription')}
        </p>
      </div>

      {/* Charts */}
      <AdminAnalyticsCharts
        dailyActivity={data.dailyActivity}
        enrollmentByProgram={data.enrollmentByProgram}
        placementStats={data.placementStats}
        inactive14Days={data.inactive14Days}
        applicationsSubmitted={data.applicationsSubmitted}
        resourcesCompleted={data.resourcesCompleted}
        aiToolStats={data.aiToolStats}
      />

      <p style={{ marginTop: '1.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        <Link href="/admin/members" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>{t('members')}</Link>
        {' · '}
        <Link href="/admin/exports" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>{t('exportFunderCsv')}</Link>
      </p>
    </div>
  );
}
