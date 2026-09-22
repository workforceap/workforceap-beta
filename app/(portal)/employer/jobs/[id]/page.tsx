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
import JobApplicantsClient from '@/components/employer/JobApplicantsClient';
import JobReadinessIssueList from '@/components/employer/JobReadinessIssueList';
import { assessJobPostingReadiness, readinessLabel } from '@/lib/employer/jobReadiness';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { StatusTag } from '@/components/portal/kit';
import { badgeVariantToKitTone } from '@/lib/ui/statusToneAdapters';
import { employerJobPortalBadgeVariant, employerJobPortalStatusLabel } from '@/lib/employer/jobStatusDisplay';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('employer');
  const fallback = await buildPageMetadataAsync({ title: t('jobDetailsMetaTitle'), description: t('jobDetailsMetaDesc'), path: `/employer/jobs/${id}` });
  const user = await getUser();
  if (!user) return fallback;
  const ctx = await getEmployerForUser(user.id);
  if (!ctx) return fallback;
  const job = await prisma.job.findFirst({
    where: { id, employerId: ctx.employerId },
    select: { title: true },
  });
  return buildPageMetadataAsync({
    title: job ? `${job.title}` : t('jobDetailsMetaTitle'),
    description: t('jobDetailsMetaDesc'),
    path: `/employer/jobs/${id}`,
  });
}

function formatSalary(salaryMin: number | null, salaryMax: number | null) {
  if (salaryMin == null && salaryMax == null) return 'Add a pay range';
  if (salaryMin != null && salaryMax != null) {
    return `$${salaryMin.toLocaleString()} to $${salaryMax.toLocaleString()}`;
  }
  if (salaryMin != null) return `From $${salaryMin.toLocaleString()}`;
  return `Up to $${salaryMax!.toLocaleString()}`;
}

export default async function EmployerJobDetailPage({ params }: Props) {
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

  const editReadiness = assessJobPostingReadiness({
    location: job.location?.trim() || '—',
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    description: job.description?.trim() ?? '',
    requirementsCount: job.requirements?.length ?? 0,
    suggestedProgramsCount: job.suggestedPrograms?.length ?? 0,
  });

  const summaryStats = [
    { label: 'Applications', value: job.applicationsCount },
    { label: 'Requirements', value: job.requirements?.length ?? 0 },
    { label: 'Program matches', value: job.suggestedPrograms?.length ?? 0 },
  ];

  const readinessTone =
    editReadiness.level === 'solid'
      ? { bg: 'color-mix(in srgb, var(--color-green) 12%, transparent)', color: 'var(--color-green)' }
      : editReadiness.level === 'usable'
        ? { bg: 'color-mix(in srgb, var(--color-gold) 14%, transparent)', color: 'var(--color-gold)' }
        : { bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)' };

  return (
    <>
      {catalogResult.loadFailed ? <span hidden data-portal-error-state="employer-program-catalog-load" /> : null}
      <article className="employer-job-edit wa-pb-24 md:wa-pb-0">
        <PortalPageFrame>
          <EmployerPageOpener
            kicker={t('employerPortal')}
            title={t('jobDetails')}
            subtitle={t('jobDetailsSubtitle')}
            action={
              <Link href="/employer/jobs" className="btn btn-outline btn-sm">
                {t('backToJobs')}
              </Link>
            }
          />

          <div className="employer-job-edit__back">
            <Link href="/employer/jobs">← {t('myJobs')}</Link>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <header className="employer-job-edit__header" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.375rem' }}>{job.title}</h2>
                    <span className="employer-job-edit__meta" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <StatusTag tone={badgeVariantToKitTone(employerJobPortalBadgeVariant(job.status))}>{employerJobPortalStatusLabel(job.status)}</StatusTag>
                      {job.applicationsCount > 0 && (
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {job.applicationsCount} application{job.applicationsCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '999px',
                      background: readinessTone.bg,
                      color: readinessTone.color,
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {readinessLabel(editReadiness.level)}
                  </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                  {summaryStats.map((stat) => (
                    <div key={stat.label} style={{ padding: '0.9rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{stat.value}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
                  <div style={{ padding: '0.95rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Company</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{employer?.companyName ?? '—'}</p>
                  </div>
                  <div style={{ padding: '0.95rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Location</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{job.location?.trim() || 'Add job location'}</p>
                  </div>
                  <div style={{ padding: '0.95rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Compensation</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{formatSalary(job.salaryMin, job.salaryMax)}</p>
                  </div>
                  <div style={{ padding: '0.95rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Source</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{job.importProvider ?? job.importMethod ?? 'Created in portal'}</p>
                  </div>
                </div>
              </section>

              <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Edit posting</h2>
                  <Link href={`/employer/jobs/${id}/edit`} className="btn btn-outline btn-sm">
                    Full edit
                  </Link>
                </div>
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
                    sourceUrl: job.sourceUrl,
                    importProvider: job.importProvider,
                    importMethod: job.importMethod,
                  }}
                  companyName={employer?.companyName ?? ''}
                  programSlugs={programSlugs}
                />
              </section>

              <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    Applicants ({applicants.length})
                  </h2>
                  <Link href="/employer/applications" className="btn btn-ghost btn-sm">
                    All applicants →
                  </Link>
                </div>
                <JobApplicantsClient jobId={id} initialApplicants={applicantData} />
              </section>
            </div>

            <aside style={{ display: 'grid', gap: '1rem' }}>
              <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>Readiness check</h2>
                <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                  {editReadiness.issues.length === 0
                    ? 'This posting has the core details candidates need. You can still fine-tune the copy below.'
                    : 'A few gaps are making the role feel thinner than it should. Fix these first.'}
                </p>
                {editReadiness.issues.length > 0 ? (
                  <div style={{ marginTop: '0.9rem' }}>
                    <JobReadinessIssueList issues={editReadiness.issues} />
                  </div>
                ) : null}
              </section>

              <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>Hiring context</h2>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Role type</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{job.jobType ?? '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Work style</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{job.locationType ?? '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Description health</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>
                      {job.description?.trim() && job.description.trim().length >= 140 ? 'Detailed enough to review' : 'Needs more day-to-day detail'}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Training alignment</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>
                      {job.suggestedPrograms?.length ? `${job.suggestedPrograms.length} program match${job.suggestedPrograms.length === 1 ? '' : 'es'} selected` : 'No program matches yet'}
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </PortalPageFrame>
      </article>
    </>
  );
}
