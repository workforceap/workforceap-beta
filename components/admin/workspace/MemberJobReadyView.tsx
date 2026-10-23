import { redirect } from 'next/navigation';
import Link from 'next/link';
import { studentsWorkspaceHref } from '@/lib/admin/studentsWorkspace';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';
import PageHeader from '@/components/portal/PageHeader';
import AdminJobReadyTable, { type JobReadyRow } from '@/components/admin/AdminJobReadyTable';
import MembersListNav from '@/components/admin/MembersListNav';
import {
  computeTrainingProgress,
  JOB_READY_TRAINING_PCT,
  resolveTrainingProgressAssignment,
} from '@/lib/member/trainingProgress';
import { loadJobReadyProgressPage } from '@/lib/admin/jobReadyCandidates';
import { SUPPORTED_PROGRAM_STORAGE_VALUES } from '@/lib/content/programs';

export default async function MemberJobReadyView({
  searchParams,
  embedded = false,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
  embedded?: boolean;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members/job-ready');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (page - 1) * ADMIN_SSR_LIST_CAP;

  const progressPage = await loadJobReadyProgressPage({
    organizationId: scope.orgId,
    superAdmin: scope.superAdmin,
    minimumPercent: JOB_READY_TRAINING_PCT,
    programStorageValues: SUPPORTED_PROGRAM_STORAGE_VALUES,
    limit: ADMIN_SSR_LIST_CAP,
    offset,
  });
  const candidates = progressPage.rows.length
    ? await withAdminPageScope(scope, (db) => db.user.findMany({
        where: { id: { in: progressPage.rows.map((row) => row.userId) } },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          enrolledProgram: true,
          courseEnrollments: {
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          interviewEligible: true,
        },
      }))
    : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const rows: JobReadyRow[] = progressPage.rows
    .flatMap((progressRow) => {
      const c = candidateById.get(progressRow.userId);
      if (!c) return [];
      const assignment = resolveTrainingProgressAssignment(
        c.enrolledProgram,
        c.courseEnrollments,
      );
      const progress = computeTrainingProgress({
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        coursesCompleted: null,
        liveProgress: progressRow,
      });
      return {
        id: c.id,
        fullName: c.fullName ?? c.email,
        email: c.email,
        phone: c.phone,
        enrolledProgram: assignment.programSlug ?? c.enrolledProgram,
        trainingPct: progress.pct,
        completedCount: progress.completedCount,
        totalCourses: progress.totalCourses,
        interviewEligible: c.interviewEligible ?? false,
      };
    })
    .filter((r) => r.trainingPct >= JOB_READY_TRAINING_PCT);

  const pageHref = (next: number) => embedded ? studentsWorkspaceHref('readiness', { readiness: 'job', page: String(next) }) : `/admin/members/job-ready?page=${next}`;
  const pageCount = Math.max(1, Math.ceil(progressPage.total / ADMIN_SSR_LIST_CAP));
  if (page > pageCount) redirect(pageHref(pageCount));
  const firstShown = progressPage.total === 0 ? 0 : offset + 1;
  const lastShown = offset + rows.length;

  return (
    <div>
      {!embedded ? <PageHeader
        title="Job ready"
        subtitle={`Showing ${firstShown}–${lastShown} of ${progressPage.total} members at ${JOB_READY_TRAINING_PCT}%+ training completion. Distinct from Interview ready, which gates on pre-screening for an employer interview.`}
        breadcrumbs={[
          { label: 'Members', href: '/admin/members' },
          { label: 'Job ready' },
        ]}
      /> : null}
      {!embedded ? <MembersListNav /> : null}
      {embedded ? <p className="wa-kit-meta wa-mb-4">Showing {firstShown}–{lastShown} of {progressPage.total} students at {JOB_READY_TRAINING_PCT}%+ assigned training completion. This threshold is separate from interview eligibility and is not a placement decision.</p> : null}
      <AdminJobReadyTable rows={rows} />
      {pageCount > 1 ? (
        <nav aria-label="Job-ready pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
          {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link href={pageHref(page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
        </nav>
      ) : null}
    </div>
  );
}
