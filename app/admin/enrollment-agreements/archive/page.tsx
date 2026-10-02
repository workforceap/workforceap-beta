import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import EnrollmentAgreementArchiveClient from '@/components/enrollment/EnrollmentAgreementArchiveClient';
import styles from '@/components/enrollment/enrollment.module.css';

export default async function EnrollmentAgreementArchivePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/enrollment-agreements/archive');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  return <div>
    <PageHeader
      title="Enrollment agreement archive"
      subtitle="Find and download saved revisions, including agreements retained after account deletion."
      action={<Link className={`wa-kit-focus ${styles.link}`} href="/admin/enrollment-agreements">Enrollment coverage</Link>}
    />
    <EnrollmentAgreementArchiveClient />
  </div>;
}
