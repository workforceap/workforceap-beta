import { getAdminMetrics } from '@/lib/admin/metrics';
import { getEngagementData } from '@/lib/admin/engagementAnalytics';
import { buildEnrollmentOutcomesPanel } from '@/lib/admin/analyticsTabs';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { AnalyticsKit } from '@/components/portal/kit/pages/admin-subviews/AnalyticsKit';
import { EnrollmentOutcomesPanel } from '@/components/portal/kit/pages/admin-subviews/EnrollmentOutcomesPanel';
import { ReportingSubsection } from '@/components/portal/kit/pages/admin-subviews/ReportingHubKit';
import type { KpiItem } from '@/components/portal/kit';

/**
 * Overview tab: the numbers `/admin/analytics` (engagement) and
 * `/admin/metrics` (enrollment / outcomes) printed on two routes, stacked on
 * one tab with the same two loaders. Enrollment and outcomes lead because
 * that is the story funders ask for; engagement follows.
 *
 * Same tenant scope as the analytics page: super-admins see every org for
 * the engagement sample, and `getAdminMetrics()` is always the actor's org.
 */
export async function ReportingOverviewSection({
  scope,
  readOnlyAudit,
}: {
  scope: AdminPageTenantOk;
  readOnlyAudit: boolean;
}) {
  const orgId = scope.superAdmin ? undefined : scope.orgId;
  const [engagement, metrics] = await Promise.all([
    getEngagementData(orgId),
    getAdminMetrics(scope.orgId, { readOnlyAudit }),
  ]);

  const kpis: KpiItem[] = [
    { label: 'WAU', value: engagement.wau.toLocaleString('en-US'), delta: 'members with any portal event, 7 days', deltaTone: 'muted' },
    { label: 'Avg Session', value: engagement.avgSessionLabel },
    { label: 'AI Tool Uses', value: engagement.aiToolUses.toLocaleString('en-US'), delta: 'saved AI tool results, all time', deltaTone: 'muted' },
    { label: 'Voice Sessions', value: engagement.voiceSessions.toLocaleString('en-US') },
  ];

  return (
    <>
      {readOnlyAudit && <span hidden data-portal-audit-suppressed="admin-metrics-shared-cache" />}
      <ReportingSubsection
        id="enrollment"
        title="Enrollment and outcomes"
        caption="Members, weekly active, placements and certificates for this organization"
      >
        <EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel(metrics)} />
      </ReportingSubsection>
      <ReportingSubsection
        id="engagement"
        title="Engagement"
        caption="Portal activity in the last 7 days and the AI tools members save results from"
      >
        <AnalyticsKit
          embedded
          kpis={kpis}
          topTools={engagement.topTools.length > 0 ? engagement.topTools : undefined}
          activeByProgram={engagement.activeByProgram.length > 0 ? engagement.activeByProgram : undefined}
        />
      </ReportingSubsection>
    </>
  );
}
