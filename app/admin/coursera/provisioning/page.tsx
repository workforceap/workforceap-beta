import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import CourseraProvisioningQueueTable from '@/components/admin/CourseraProvisioningQueueTable';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { loadCourseraProvisioningQueue } from '@/lib/admin/courseraProvisioningQueue';
import {
  PROVISIONING_STATE_LABELS,
  type CourseraProvisioningState,
} from '@/lib/coursera/provisioningState';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Coursera provisioning queue',
    description:
      'One place to see where every member with a program stands on Coursera: not provisioned, invited, unmatched, enrolled, active, stalled or complete.',
    path: '/admin/coursera/provisioning',
  });
}

export const dynamic = 'force-dynamic';

const QUEUE_TILES: CourseraProvisioningState[] = [
  'not_provisioned',
  'invited',
  'unmatched',
  'enrolled_not_started',
  'stalled',
  'active',
];

export default async function AdminCourseraProvisioningPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/coursera/provisioning');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const organizationId = await getActorOrganizationId(user.id);
  const { rows, summary, programs, generatedAt } = await loadCourseraProvisioningQueue(organizationId);

  return (
    <PortalPageFrame>
      <PageHeader
        title="Coursera provisioning queue"
        subtitle="Every member with an assigned program and where they stand on Coursera, derived from portal approvals, the Coursera enrollment audit trail, Coursera For Business rows and xAPI activity. Read-only; act from the member page or the enrollment command center."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Coursera', href: '/admin/coursera' },
          { label: 'Provisioning' },
        ]}
        action={
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/admin/coursera/enrollment" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              Enrollment command center →
            </Link>
            <Link href="/admin/coursera" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              ← Coursera overview
            </Link>
          </div>
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
        <div className="content-card" style={{ padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {summary.needsAttention}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Needs attention</div>
        </div>
        {QUEUE_TILES.map((state) => (
          <div key={state} className="content-card" style={{ padding: '1rem', borderRadius: '8px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {summary.byState[state]}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {PROVISIONING_STATE_LABELS[state]}
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
        {summary.total} member{summary.total === 1 ? '' : 's'} with an assigned program · {summary.byState.completed}{' '}
        completed · {summary.byState.not_approved} not approved and untouched on Coursera.
      </p>

      <CourseraProvisioningQueueTable rows={rows} programs={programs} generatedAt={generatedAt} />
    </PortalPageFrame>
  );
}
