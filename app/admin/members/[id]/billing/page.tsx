import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { resolveAssignedCounselorContact, serializeBillingPacket } from '@/lib/billing/packetAccess';
import PageHeader from '@/components/portal/PageHeader';
import BillingPacketList from '@/components/billing/BillingPacketList';
import TwoStageBillingWorkbench from './TwoStageBillingWorkbench';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'J5 and J6 billing',
    description: 'Prepare separate J5 quote and J6 voucher payment documents for a member.',
    path: '/admin/members',
  });
}

export default async function AdminMemberBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { id } = await params;
  const member = await withAdminPageScope(scope, (db) =>
    db.user.findFirst({
      where: { id },
      select: { id: true, fullName: true, email: true, organizationId: true, deletedAt: true },
    }),
  );
  if (!member || member.deletedAt) notFound();

  const [packets, counselor] = await Promise.all([
    withAdminPageScope(scope, (db) =>
      db.trainingBillingPacket.findMany({
        where: { memberId: member.id, organizationId: member.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ),
    resolveAssignedCounselorContact(member.id),
  ]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Members', href: '/admin/members' },
          { label: member.fullName, href: `/admin/members/${member.id}` },
          { label: 'J5 / J6 billing' },
        ]}
        title={`J5 and J6 billing — ${member.fullName}`}
        subtitle={counselor ? `Counselor: ${counselor.fullName}` : 'No counselor assigned yet'}
        action={
          <Link href={`/admin/members/${member.id}`} className="btn btn-outline" style={{ minHeight: 44, justifyContent: 'center' }}>
            Back to member
          </Link>
        }
      />
      <TwoStageBillingWorkbench
        memberName={member.fullName}
        memberEmail={member.email}
        counselor={counselor ? { name: counselor.fullName, email: counselor.email } : null}
      />
      {packets.length > 0 ? (
        <section className="portal-profile-section-card">
          <div className="portal-profile-section-card__header">
            <h2 className="portal-profile-section-card__title">Earlier billing documents</h2>
          </div>
          <div className="portal-profile-section-card__body">
            <BillingPacketList
              packets={packets.map((row) => serializeBillingPacket(row))}
              canSend={false}
              counselorLabel={counselor ? `${counselor.fullName} (${counselor.email})` : null}
              memberEmail={member.email}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
