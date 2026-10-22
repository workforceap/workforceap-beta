import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { ADMIN_SSR_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import PageHeader from '@/components/portal/PageHeader';
import AdminInterviewReadyTable from '@/components/admin/AdminInterviewReadyTable';
import MembersListNav from '@/components/admin/MembersListNav';

export default async function MemberInterviewReadyView({ embedded = false }: { embedded?: boolean } = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members/interview-ready');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const interviewWhere = {
    deletedAt: null,
    interviewEligible: true,
    interviewCompletedAt: null,
  };
  const [rows, rowTotal] = await withAdminPageScope(scope, (db) => Promise.all([
    db.user.findMany({
      take: ADMIN_SSR_LIST_CAP,
      where: interviewWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        assessmentScorePct: true,
        interviewRequestedAt: true,
        preScreeningResponse: {
          select: {
            primaryGoal: true,
            weeklyHours: true,
            barrier: true,
            employmentStatus: true,
          },
        },
      },
    }),
    db.user.count({ where: interviewWhere }),
  ]));

  const tableRows = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    assessmentScorePct: r.assessmentScorePct,
    interviewRequestedAt: r.interviewRequestedAt,
    preScreening: r.preScreeningResponse
      ? {
          primaryGoal: r.preScreeningResponse.primaryGoal,
          weeklyHours: r.preScreeningResponse.weeklyHours,
          barrier: r.preScreeningResponse.barrier,
          employmentStatus: r.preScreeningResponse.employmentStatus,
        }
      : null,
  }));

  return (
    <div>
      {!embedded ? <PageHeader
        title="Interview ready"
        subtitle={
          isListTruncated(rows.length, ADMIN_SSR_LIST_CAP, rowTotal)
            ? showingFirstLabel(rows.length, rowTotal, 'interview-ready members')
            : 'Members who completed pre-screening. Work the queue before scheduling calls.'
        }
        breadcrumbs={[
          { label: 'Members', href: '/admin/members' },
          { label: 'Interview ready' },
        ]}
      /> : null}
      {!embedded ? <MembersListNav /> : null}
      {embedded ? <p className="wa-kit-meta wa-mb-4">{isListTruncated(rows.length, ADMIN_SSR_LIST_CAP, rowTotal) ? showingFirstLabel(rows.length, rowTotal, 'interview-ready members') : 'Members who completed pre-screening and have not completed their interview. Review their responses before scheduling.'}</p> : null}
      <AdminInterviewReadyTable rows={tableRows} />
    </div>
  );
}
