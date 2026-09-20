import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import CourseraEnrollmentPipelineTable from '@/components/admin/CourseraEnrollmentPipelineTable';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { loadCourseraEnrollmentPipeline } from '@/lib/admin/courseraEnrollmentPipeline';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Coursera enrollment command center',
    description:
      'Approval + enrollment pipeline for every member with an assigned Coursera-backed program: who is approved, who has started, and who has stalled.',
    path: '/admin/coursera/enrollment',
  });
}

export const dynamic = 'force-dynamic';

const SUMMARY_TILES: Array<{ key: 'totalApproved' | 'approvedNotStarted' | 'activeLast30Days' | 'stalled'; label: string }> = [
  { key: 'totalApproved', label: 'Total approved' },
  { key: 'approvedNotStarted', label: 'Approved — no activity observed' },
  { key: 'activeLast30Days', label: 'Active (last 30d)' },
  { key: 'stalled', label: 'No recent activity' },
];

export default async function AdminCourseraEnrollmentPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/coursera/enrollment');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const organizationId = await getActorOrganizationId(user.id);
  const { rows, summary, programs, truncated } = await loadCourseraEnrollmentPipeline(organizationId);

  return (
    <PortalPageFrame>
      <PageHeader
        title="Coursera enrollment command center"
        subtitle="Operational cohort with an assignment, approval, or recorded course evidence. Approval and observed learning are separate facts."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Coursera', href: '/admin/coursera' },
          { label: 'Enrollment' },
        ]}
        action={
          <Link href="/admin/coursera" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
            ← Back to Coursera sync overview
          </Link>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {SUMMARY_TILES.map((tile) => (
          <div
            key={tile.key}
            className="content-card"
            style={{ padding: '1rem', borderRadius: '8px' }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{summary[tile.key]}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{tile.label}</div>
          </div>
        ))}
        <div className="content-card" style={{ padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{summary.completed}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Completed</div>
        </div>
      </div>

      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
        {summary.totalMembers} member{summary.totalMembers === 1 ? '' : 's'} in this operational cohort ·{' '}
        {summary.notApproved} not yet approved. Activity dates cover recorded courses across assignments; enrollment receipts alone do not prove learning or working provider access.
        {truncated ? ' Showing the first 2,000 accounts; these totals cover only those rows.' : ''}
      </p>

      <CourseraEnrollmentPipelineTable initialRows={rows} programs={programs} />
    </PortalPageFrame>
  );
}
