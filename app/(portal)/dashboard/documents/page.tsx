import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { listPacketsForMember } from '@/lib/billing/packetAccess';
import PageHeader from '@/components/portal/PageHeader';
import BillingPacketList from '@/components/billing/BillingPacketList';
import EnrollmentAgreementCard from '@/components/enrollment/EnrollmentAgreementCard';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'My Documents',
    description: 'Signed enrollment documents for your training program.',
    path: '/dashboard/documents',
  });
}

/**
 * Member view of the signed J5 invoice + J6 cover letter packets about them.
 * Read-only: view or download the PDFs. The office emails the same files when
 * a packet is sent.
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
        {process.env.ENROLLMENT_AGREEMENTS_ENABLED === 'true' && <EnrollmentAgreementCard />}
        <BillingPacketList
          packets={packets}
          emptyText="No documents yet. When your training invoice is signed, it appears here and is also emailed to you."
        />
      </div>
    </div>
  );
}
