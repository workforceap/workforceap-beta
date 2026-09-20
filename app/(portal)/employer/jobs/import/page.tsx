import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActiveProgramsResult } from '@/lib/platform/programCatalog';
import ImportJobClient from './ImportJobClient';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('importJobsMetaTitle'),
    description: t('importJobsMetaDesc'),
    path: '/employer/jobs/import',
  });
}

export default async function ImportJobPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs/import');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getEmployerForUser(user.id, { readOnlyAudit });
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));
  const t = await getTranslations('employer');

  const employer = await prisma.employer.findUnique({
    where: { id: ctx.employerId },
    select: { companyName: true, organizationId: true },
  });

  const catalogResult = await getActiveProgramsResult(employer?.organizationId, { readOnlyAudit });
  const programSlugs = catalogResult.programs.map((p) => p.slug);

  return (
    <PortalPageFrame>
      {catalogResult.loadFailed ? <span hidden data-portal-error-state="employer-program-catalog-load" /> : null}
      <EmployerPageOpener
        kicker={t('importJobsMetaTitle')}
        title="Add roles from your site"
        subtitle="We turn what is already on your public careers page into private drafts. You edit, then choose when to send a posting for WorkforceAP review. Candidates never see anything until after that review — and your approval."
      />
      <ImportJobClient
        companyName={employer?.companyName ?? ''}
        programSlugs={programSlugs}
      />
    </PortalPageFrame>
  );
}
