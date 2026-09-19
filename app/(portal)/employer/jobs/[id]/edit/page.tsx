import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import { getActiveProgramsResult } from '@/lib/platform/programCatalog';
import JobForm from '@/components/employer/JobForm';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('employer');
  const fallback = await buildPageMetadataAsync({
    title: t('editJobMetaTitle'),
    description: t('editJobMetaDesc'),
    path: `/employer/jobs/${id}/edit`,
  });
  const user = await getUser();
  if (!user) return fallback;
  const ctx = await getEmployerForUser(user.id);
  if (!ctx) return fallback;
  const job = await prisma.job.findFirst({
    where: { id, employerId: ctx.employerId },
    select: { title: true },
  });
  return buildPageMetadataAsync({
    title: job ? `${t('editJobMetaTitle')}: ${job.title}` : t('editJobMetaTitle'),
    description: t('editJobMetaDesc'),
    path: `/employer/jobs/${id}/edit`,
  });
}

export default async function EmployerJobEditPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getEmployerForUser(user.id, { readOnlyAudit });
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, employerId: ctx.employerId },
  });

  if (!job) notFound();

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
        kicker={t('employerPortal')}
        title={t('editJobPosting')}
        subtitle={t('updateDetails')}
        breadcrumbs={[
          { label: t('jobPostings'), href: '/employer/jobs' },
          { label: job.title, href: `/employer/jobs/${id}` },
          { label: t('edit') },
        ]}
        action={
          <Link href={`/employer/jobs/${id}`} className="btn btn-outline btn-sm">
            {t('backToJob')}
          </Link>
        }
      />
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <div style={{ padding: '1rem', overflowY: 'auto' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: 12 }}>
            <JobForm
              job={{
                id: job.id,
                title: job.title,
                location: job.location,
                locationType: job.locationType,
                jobType: job.jobType,
                salaryMin: job.salaryMin,
                salaryMax: job.salaryMax,
                description: job.description,
                requirements: job.requirements,
                preferredCertifications: job.preferredCertifications,
                suggestedPrograms: job.suggestedPrograms,
                status: job.status,
                expiresAt: job.expiresAt?.toISOString() ?? null,
                sourceUrl: job.sourceUrl,
                importProvider: job.importProvider,
                importMethod: job.importMethod,
              }}
              companyName={employer?.companyName ?? ''}
              programSlugs={programSlugs}
            />
          </div>
        </div>
      </div>
      <div className="wa-hidden md:wa-block">
        <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
          <JobForm
            job={{
              id: job.id,
              title: job.title,
              location: job.location,
              locationType: job.locationType,
              jobType: job.jobType,
              salaryMin: job.salaryMin,
              salaryMax: job.salaryMax,
              description: job.description,
              requirements: job.requirements,
              preferredCertifications: job.preferredCertifications,
              suggestedPrograms: job.suggestedPrograms,
              status: job.status,
              expiresAt: job.expiresAt?.toISOString() ?? null,
              sourceUrl: job.sourceUrl,
              importProvider: job.importProvider,
              importMethod: job.importMethod,
            }}
            companyName={employer?.companyName ?? ''}
            programSlugs={programSlugs}
          />
        </div>
      </div>
    </PortalPageFrame>
  );
}
