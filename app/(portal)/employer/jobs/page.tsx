import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import EmployerJobsBoard from '@/components/employer/EmployerJobsBoard';
import EmployerJobQuickActions from '@/components/employer/EmployerJobQuickActions';
import { assessJobPostingReadiness } from '@/lib/employer/jobReadiness';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import StatusBadge from '@/components/portal/StatusBadge';
import {
  EMPLOYER_JOBS_PAGE_SIZE,
  employerJobsListHref,
  parseEmployerJobsListQuery,
  prismaWhereClosableInListFilter,
  prismaWhereDeletableInListFilter,
  prismaWhereEmployerJobList,
} from '@/lib/employer/employerJobsListQuery';
import { EMPLOYER_LIST_CAP } from '@/lib/db/queryCaps';
import { employerJobPortalBadgeVariant, employerJobPortalStatusLabel, employerJobStatusLabel } from '@/lib/employer/jobStatusDisplay';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('myJobs'),
    description: t('manageYourJobPostings'),
    path: '/employer/jobs',
  });
}

type SearchProps = { searchParams: Promise<{ page?: string; filter?: string; locationType?: string }> };

export default async function EmployerJobsPage({ searchParams }: SearchProps) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/jobs');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const sp = await searchParams;
  const { filter, page, locationType } = parseEmployerJobsListQuery(sp);
  const employerId = ctx.employerId;

  const listWhere = prismaWhereEmployerJobList(employerId, filter, locationType);

  const [totalInDb, totalInFilter, jobs, deletableRows, closableRows, titlesInFilter] = await Promise.all([
    prisma.job.count({ where: { employerId } }),
    prisma.job.count({ where: listWhere }),
    prisma.job.findMany({
      where: listWhere,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * EMPLOYER_JOBS_PAGE_SIZE,
      take: EMPLOYER_JOBS_PAGE_SIZE,
      include: { _count: { select: { applications: true } } },
    }),
    prisma.job.findMany({
      take: EMPLOYER_LIST_CAP,
      where: prismaWhereDeletableInListFilter(employerId, filter, locationType),
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.job.findMany({
      take: EMPLOYER_LIST_CAP,
      where: prismaWhereClosableInListFilter(employerId, filter, locationType),
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.job.findMany({
      take: EMPLOYER_LIST_CAP,
      where: listWhere,
      select: { id: true, title: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalInFilter / EMPLOYER_JOBS_PAGE_SIZE));
  if (totalInFilter > 0 && page > totalPages) {
    redirect(employerJobsListHref(filter, totalPages, locationType));
  }

  const now = new Date();
  const boardItems = jobs.map((j) => {
    const desc = j.description?.trim() ?? '';
    const location = j.location?.trim() || '';
    const readiness = assessJobPostingReadiness({
      location: location || '—',
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      description: desc,
      requirementsCount: j.requirements?.length ?? 0,
      suggestedProgramsCount: j.suggestedPrograms?.length ?? 0,
    });
    const isExpired = j.status === 'live' && j.expiresAt != null && j.expiresAt < now;
    const effectiveStatus = isExpired ? 'expired' : j.status;
    return {
      id: j.id,
      title: j.title,
      location: location || '—',
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      locationType: j.locationType,
      jobType: j.jobType,
      descriptionPreview: desc.length > 180 ? `${desc.slice(0, 180).trim()}…` : desc || '—',
      descriptionLength: desc.length,
      requirementsCount: j.requirements?.length ?? 0,
      suggestedProgramsCount: j.suggestedPrograms?.length ?? 0,
      status: effectiveStatus,
      statusLabel: employerJobStatusLabel(effectiveStatus),
      applicationsCount: j._count.applications,
      updatedAt: j.updatedAt.toISOString(),
      readinessLevel: readiness.level,
      readinessIssues: readiness.issues,
    };
  });

  const titleByIdInFilter: Record<string, string> = {};
  for (const r of titlesInFilter) titleByIdInFilter[r.id] = r.title;

  const FILTER_CHIPS = [
    { value: '', label: t('all') },
    { value: 'live', label: t('live') },
    { value: 'draft', label: t('draft') },
    { value: 'filled', label: t('filled') },
    { value: 'expired', label: t('expired') },
  ];

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('jobPostings')}
        subtitle={t('managePostingsAndCandidates')}
        action={
          <>
            <div className="md:wa-hidden">
              <Link href="/employer/jobs/new" className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">add</span>
                {t('postJob')}
              </Link>
            </div>
            <div className="wa-hidden md:wa-block">
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link href="/employer/jobs/import" className="btn btn-muted">
                  {t('importJobsBtn')}
                </Link>
                <Link href="/employer/jobs/new" className="btn btn-primary">
                  {t('postAJobBtn')}
                </Link>
              </div>
            </div>
          </>
        }
      />

      {/* ── Mobile section ── */}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0 1rem 0.75rem' }}>
          {FILTER_CHIPS.map((chip) => (
            <Link
              key={chip.value}
              href={chip.value ? `/employer/jobs?filter=${chip.value}${locationType ? `&locationType=${locationType}` : ''}` : `/employer/jobs${locationType ? `?locationType=${locationType}` : ''}`}
              style={{
                flexShrink: 0,
                padding: '0.375rem 0.875rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'none',
                background: filter === chip.value ? 'var(--color-accent)' : 'var(--surface-container)',
                color: filter === chip.value ? '#fff' : 'var(--color-on-surface-variant)',
              }}
            >
              {chip.label}
            </Link>
          ))}
        </div>

        {/* Job cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', padding: '0 1rem' }}>
          {boardItems.length === 0 && totalInDb > 0 ? (
            <div className="portal-card portal-card--flat" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">filter_alt_off</span>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>{t('nothingInThisView')}</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem' }}>
                {t('tryAnotherFilter')}
              </p>
              <Link
                href={`/employer/jobs${locationType ? `?locationType=${locationType}` : ''}`}
                className="btn btn-primary btn-sm"
              >
                {t('showAllPostings')}
              </Link>
            </div>
          ) : boardItems.length === 0 ? (
            <div className="portal-card portal-card--flat" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">work_outline</span>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>{t('noJobsYet')}</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem' }}>{t('postFirstRole')}</p>
              <Link href="/employer/jobs/new" className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">add</span>{t('postAJobBtn')}
              </Link>
            </div>
          ) : (
            boardItems.map((job) => (
              <div
                key={job.id}
                className="portal-card portal-card--flat"
                style={{
                  padding: '1rem',
                  border: job.status === 'draft' ? '1px dashed var(--outline-variant)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <h3 className="wa-truncate" style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, flex: 1, paddingRight: '0.5rem' }}>
                    {job.title}
                  </h3>
                  <StatusBadge label={employerJobPortalStatusLabel(job.status)} variant={employerJobPortalBadgeVariant(job.status)} />
                </div>
                <p style={{ fontSize: '0.775rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>{job.location}</p>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.775rem', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">person</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{job.applicationsCount}</span> {t('applications', { count: job.applicationsCount })}
                  </span>
                </div>
                <EmployerJobQuickActions jobId={job.id} title={job.title} status={job.status} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Desktop section ── */}
      <div className="wa-hidden md:wa-block">
          {totalInDb === 0 ? (
            <div className="portal-card portal-card--flat" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '1rem' }} aria-hidden="true">work_outline</span>
              <h3 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem', color: 'var(--color-on-surface)' }}>{t('noJobsYet')}</h3>
              <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem', maxWidth: '28rem', marginInline: 'auto' }}>
                {t('postFirstRole')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                <Link href="/employer/jobs/new" className="btn btn-primary">
                  {t('postYourFirstJob')}
                </Link>
                <Link href="/employer/jobs/import" className="btn btn-outline">
                  {t('importJobsBtn')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {totalInFilter > EMPLOYER_LIST_CAP && (
                <p style={{ fontSize: 12, color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>
                  Bulk actions include the first {EMPLOYER_LIST_CAP} postings in this filter.
                </p>
              )}
              <EmployerJobsBoard
                jobs={boardItems}
                filter={filter}
                page={page}
                pageSize={EMPLOYER_JOBS_PAGE_SIZE}
                totalInFilter={totalInFilter}
                totalInDb={totalInDb}
                deletableInFilter={deletableRows}
                closableInFilter={closableRows}
                titleByIdInFilter={titleByIdInFilter}
                locationType={locationType}
              />
            </>
          )}
      </div>
    </PortalPageFrame>
  );
}
