import DataTable from '@/components/portal/ui/DataTable';
import { formatPortalDateTime } from '@/lib/formatDate';
import type { loadMemberServiceRequests } from '@/lib/admin/memberServiceRequests';

type Props = Awaited<ReturnType<typeof loadMemberServiceRequests>>;
const PROVIDERS: Record<string, string> = { coursera: 'Coursera', linkedin_premium: 'LinkedIn Premium' };

export default function MemberServiceRequests({ benefits, training, failed }: Props) {
  const rows = [
    ...benefits.map((item) => ({ id: `benefit:${item.id}`, kind: 'Benefit request', provider: item.benefit,
      status: item.status, requestedAt: item.createdAt, updatedAt: item.updatedAt, notes: null as string | null })),
    ...training.map((item) => ({ id: `training:${item.id}`, kind: 'Training access record', provider: item.providerKey,
      status: item.status, requestedAt: item.requestedAt, updatedAt: item.updatedAt, notes: item.notes })),
  ];
  return (
    <section className="wa-kit-card" aria-labelledby="admin-member-service-requests-title">
      <h2 id="admin-member-service-requests-title" className="wa-text-lg wa-font-bold wa-mb-2">Saved access requests</h2>
      <p className="wa-kit-meta">Recorded requests for staff review. A request status does not confirm a live provider seat or grant access. Coursera approval and enrollment remain separate actions above.</p>
      {failed ? <p role="status">Saved requests could not be loaded. Refresh to try again.</p> : <>
        <DataTable rows={rows} rowKey={(row) => row.id} density="compact" emptyState="No saved benefit or training access request records."
          columns={[
            { key: 'type', header: 'Record', rowHeader: true, cell: (row) => row.kind },
            { key: 'provider', header: 'Provider', cell: (row) => PROVIDERS[row.provider] ?? row.provider },
            { key: 'status', header: 'Recorded status', cell: (row) => row.status.replaceAll('_', ' ').toLowerCase() },
            { key: 'requested', header: 'Requested', cell: (row) => formatPortalDateTime(row.requestedAt) },
            { key: 'updated', header: 'Updated', cell: (row) => formatPortalDateTime(row.updatedAt) },
            { key: 'notes', header: 'Saved notes', cell: (row) => row.notes || '—' },
          ]}
        />
        {benefits.length === 50 || training.length === 50 ? <p className="wa-kit-meta">Showing the latest 50 records per request type.</p> : null}
      </>}
    </section>
  );
}
