import 'server-only';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';
import { employerCandidatesCopy, firstCandidateParam, type EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';
import { prisma } from '@/lib/db/prisma';
import EmployerApplicationsClient from '@/components/employer/EmployerApplicationsClient';
import EmployerApplicationsPager from '@/components/employer/EmployerApplicationsPager';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import {
  parseEmployerApplicationStatusFilter,
  parseEmployerApplicationsSort,
} from '@/lib/employer/employerApplicationsListQuery';
import { getTranslations } from 'next-intl/server';

const PAGE_SIZE = 25;


export default async function EmployerApplicationsView({
  searchParams,
  loginHref = '/employer/applications',
}: {
  searchParams?: Promise<EmployerCandidateParams>;
  loginHref?: string;
} = {}) {
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${loginHref.includes('?') ? encodeURIComponent(loginHref) : loginHref}`);

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const workspaceParams = (await searchParams) ?? {};
  const sp = {
    page: firstCandidateParam(workspaceParams.page),
    status: firstCandidateParam(workspaceParams.status),
    sort: firstCandidateParam(workspaceParams.sort),
  };
  const page = Math.max(1, parseInt(String(sp.page ?? '1'), 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const statusFilter = parseEmployerApplicationStatusFilter(sp.status ?? undefined);
  const sortOrder = parseEmployerApplicationsSort(sp.sort ?? undefined);

  const whereEmployer = {
    job: { employerId: ctx.employerId },
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [applications, totalCount] = await Promise.all([
    prisma.jobPostingApplication.findMany({
      where: whereEmployer,
      orderBy: { appliedAt: sortOrder === 'applied_asc' ? 'asc' : 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        job: { select: { id: true, title: true } },
        student: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.jobPostingApplication.count({ where: whereEmployer }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const initialRows = applications.map((app) => ({
    id: app.id,
    jobId: app.jobId,
    status: app.status,
    appliedAt: app.appliedAt.toISOString(),
    employerNotes: app.employerNotes ?? null,
    job: app.job,
    student: app.student,
  }));

  const t = await getTranslations('employer');

  const headerTitle = statusFilter
    ? `${t('applicantsMetaTitle')} — ${t('filtered')} (${totalCount})`
    : `${t('applicantsMetaTitle')} (${totalCount})`;

  return (
    <PortalPageFrame>
      <EmployerCandidatesHeader
        activeView="applicants"
        copy={employerCandidatesCopy(t)}
        params={workspaceParams}
        kicker={t('employerPortal')}
        title={headerTitle}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{t('reviewCandidatesMobile')}</span>
            <span className="wa-hidden md:wa-block">{t('reviewCandidatesDesktop')}</span>
          </>
        }
        action={
          <>
            <div className="md:wa-hidden">
              <Link href="/employer/jobs/new" className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                  add
                </span>
                {t('postJob')}
              </Link>
            </div>
            <div className="wa-hidden md:wa-block">
              <Link href="/employer/jobs/new" className="btn btn-primary">
                {t('postAJobBtn')}
              </Link>
            </div>
          </>
        }
      />
      {totalCount === 0 && !statusFilter ? (
        // True empty: no applications and no filter. Filtered-zero keeps the client so chips/reset remain.
        <PortalEmptyState
          title={t('noApplicationsYet')}
          description={t('postRoleToStartReceiving')}
          icon={
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '3rem', color: 'var(--wa-muted)' }}
              aria-hidden="true"
            >
              inbox
            </span>
          }
          primaryAction={{ label: t('postAJob'), href: '/employer/jobs/new' }}
        />
      ) : (
        <>
          <div className="wa-block md:wa-hidden wa-pb-24">
            <MobileApplicationsClient initialRows={initialRows} activeStatusFilter={statusFilter} activeSort={sortOrder} />
            <div className="wa-px-4">
              <EmployerApplicationsPager page={page} totalPages={totalPages} status={statusFilter} sort={sortOrder} />
            </div>
          </div>
          <div className="wa-hidden md:wa-block">
            <EmployerApplicationsClient
              initialRows={initialRows}
              activeStatusFilter={statusFilter}
              activeSort={sortOrder}
            />
            <EmployerApplicationsPager page={page} totalPages={totalPages} status={statusFilter} sort={sortOrder} />
          </div>
        </>
      )}
    </PortalPageFrame>
  );
}
