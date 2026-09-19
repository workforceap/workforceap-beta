import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import JobApplicantsClient from '@/components/employer/JobApplicantsClient';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('employer');
  const fallback = await buildPageMetadataAsync({
    title: t('applicantsMetaTitle'),
    description: t('applicantsMetaDesc'),
    path: `/employer/jobs/${id}/applicants`,
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
    title: job ? `${t('applicantsFor')}: ${job.title}` : t('applicantsMetaTitle'),
    description: t('applicantsMetaDesc'),
    path: `/employer/jobs/${id}/applicants`,
  });
}

export default async function EmployerJobApplicantsPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, employerId: ctx.employerId },
    select: { id: true, title: true, status: true },
  });

  if (!job) notFound();

  const applicants = await prisma.jobPostingApplication.findMany({
    where: { jobId: id },
    orderBy: { appliedAt: 'desc' },
    include: {
      student: { select: { id: true, fullName: true, email: true } },
    },
    take: 200,
  });

  const applicantData = applicants.map((app) => ({
    id: app.id,
    status: app.status,
    appliedAt: app.appliedAt.toISOString(),
    employerNotes: app.employerNotes ?? null,
    student: app.student,
  }));

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={`${t('applicantsFor')}: ${job.title}`}
        subtitle={`${applicants.length} ${applicants.length === 1 ? t('applicant') : t('applicants')}`}
        breadcrumbs={[
          { label: t('jobPostings'), href: '/employer/jobs' },
          { label: job.title, href: `/employer/jobs/${id}` },
          { label: t('applicantsMetaTitle') },
        ]}
        action={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href={`/api/employer/jobs/${id}/applications/export`} className="btn btn-outline btn-sm">
              {t('exportCsv')}
            </a>
            <Link href={`/employer/jobs/${id}`} className="btn btn-outline btn-sm">
              {t('backToJob')}
            </Link>
          </div>
        }
      />

      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <div style={{ padding: '1rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: 12 }}>
            <JobApplicantsClient jobId={id} initialApplicants={applicantData} />
          </div>
        </div>
      </div>

      <div className="wa-hidden md:wa-block">
        <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
          <JobApplicantsClient jobId={id} initialApplicants={applicantData} />
        </div>
      </div>
    </PortalPageFrame>
  );
}
