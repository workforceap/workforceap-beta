import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { buildPageMetadataAsync } from '@/app/seo';
import AdminTrainingDashboardTable from '@/components/admin/AdminTrainingDashboardTable';
import PageHeader from '@/components/portal/PageHeader';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { loadTrainingDashboardData } from '@/lib/admin/trainingDashboard';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Training progress',
    description: 'Central view of members who are enrolled, in progress, stalled, or complete in training.',
    path: '/admin/members/training',
  });
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="portal-kpi-card" style={{ padding: '1rem' }}>
      <p style={{ margin: '0 0 0.35rem', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  );
}

export default async function AdminTrainingProgressPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members/training');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { metrics, rows } = await loadTrainingDashboardData(scope);

  return (
    <div>
      <PageHeader
        title="Training progress"
        subtitle="Canonical training dashboard powered by CourseProgress + MemberProgramProgress, with legacy course JSON only as fallback."
        breadcrumbs={[
          { label: 'Members', href: '/admin/members' },
          { label: 'Training progress' },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <MetricCard label="Enrolled" value={metrics.enrolledMembers} accent="var(--color-accent)" />
        <MetricCard label="In progress" value={metrics.activeInTraining} accent="var(--wa-gold)" />
        <MetricCard label="Not started" value={metrics.notStarted} accent="#d97706" />
        <MetricCard label="Complete" value={metrics.completed} accent="#16a34a" />
        <MetricCard label="Stale" value={metrics.stale} accent="#dc2626" />
        <MetricCard label="Avg progress" value={`${metrics.averagePercent}%`} accent="#2563eb" />
      </div>

      <AdminTrainingDashboardTable rows={rows} />
    </div>
  );
}
