import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { listPacketsForMember } from '@/lib/billing/packetAccess';
import PageHeader from '@/components/portal/PageHeader';
import BillingPacketList from '@/components/billing/BillingPacketList';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'My Documents',
    description: 'Signed enrollment documents for your training program.',
    path: '/dashboard/documents',
  });
}

/**
 * Member view of the signed J5 invoice + J6 cover letter packets about them,
 * shown once a send could have reached the member (lib/billing/packetAccess.ts).
 * Read-only: view or download the PDFs.
 */
export default async function DashboardDocumentsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/documents');
  const packets = await listPacketsForMember(user.id);

  return (
    <div>
      <PageHeader
        title="My documents"
        subtitle="Signed training invoices and cover letters for your program. There is no cost to you; these are billed to your funding partner."
      />
      <div style={{ maxWidth: 800, display: 'grid', gap: '1rem' }}>
        <BillingPacketList
          packets={packets}
          emptyText="No documents yet. Billing documents appear here once they have been sent to you."
        />
      </div>
    </div>
  );
}
