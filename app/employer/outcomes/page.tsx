import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isEmployer } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import EmployerOutcomesDashboard from '@/components/employer/EmployerOutcomesDashboard';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('outcomes.title'),
    description: t('outcomes.description'),
    path: '/employer/outcomes',
  });
}

export default async function EmployerOutcomesPage() {
  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/employer/outcomes');
  }

  const employer = await isEmployer(user.id);
  if (!employer) {
    redirect('/dashboard');
  }

  if (isReadOnlyPortalAuditHeader(await headers())) {
    return (
      <div
        data-portal-audit-suppressed="employer-outcomes-view-audit-log"
        className="wa-min-h-screen wa-bg-slate-50"
      >
        <div className="wa-max-w-7xl wa-mx-auto wa-px-4 sm:wa-px-6 lg:wa-px-8 wa-py-8">
          <h1>Hiring Outcomes</h1>
          <p>Access is verified without creating production audit-log rows during the release audit.</p>
          <Link href="/employer" className="btn btn-secondary">Employer home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-min-h-screen wa-bg-slate-50">
      <div className="wa-max-w-7xl wa-mx-auto wa-px-4 sm:wa-px-6 lg:wa-px-8 wa-py-8">
        <EmployerOutcomesDashboard />
      </div>
    </div>
  );
}
