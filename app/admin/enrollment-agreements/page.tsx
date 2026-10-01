import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import EnrollmentAgreementCoverageClient from '@/components/enrollment/EnrollmentAgreementCoverageClient';

export default async function EnrollmentAgreementsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/enrollment-agreements');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  return <div>
    <PageHeader title="Enrollment agreements" subtitle="Find missing agreements and open student records for review." />
    {process.env.ENROLLMENT_AGREEMENTS_ENABLED === 'true'
      ? <EnrollmentAgreementCoverageClient />
      : <p>Enrollment agreement tracking is not enabled yet. Existing student records and billing documents are unchanged.</p>}
  </div>;
}
