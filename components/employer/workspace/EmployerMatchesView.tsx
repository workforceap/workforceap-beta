import 'server-only';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';
import { employerCandidatesCopy, type EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import { getTranslations } from 'next-intl/server';
import { EMPLOYER_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';


export default async function EmployerMatchesView({
  searchParams,
  loginHref = '/employer/matches',
}: {
  searchParams?: Promise<EmployerCandidateParams>;
  loginHref?: string;
} = {}) {
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${loginHref.includes('?') ? encodeURIComponent(loginHref) : loginHref}`);

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');
  const workspaceParams = (await searchParams) ?? {};

  const matchWhere = { job: { employerId: ctx.employerId, status: 'live' as const } };
  const [matchTotal, matches] = await Promise.all([
    prisma.aIJobMatch.count({ where: matchWhere }),
    prisma.aIJobMatch.findMany({
      take: EMPLOYER_LIST_CAP,
      where: matchWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { id: true, title: true } },
        student: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  const keys = matches.map((m) => ({ jobId: m.jobId, studentId: m.studentId }));
  const applications =
    keys.length === 0
      ? []
      : await prisma.jobPostingApplication.findMany({
          take: EMPLOYER_LIST_CAP,
          where: { OR: keys.map((k) => ({ jobId: k.jobId, studentId: k.studentId })) },
          select: { id: true, jobId: true, studentId: true },
        });
  const appByPair = new Map(applications.map((a) => [`${a.jobId}:${a.studentId}`, a.id]));

  const initialRows = matches.map((m) => ({
    id: m.id,
    jobId: m.jobId,
    studentId: m.studentId,
    status: m.status,
    matchScore: m.matchScore,
    createdAt: m.createdAt.toISOString(),
    statusUpdatedAt: m.statusUpdatedAt?.toISOString() ?? null,
    job: m.job,
    student: m.student,
    applicationId: appByPair.get(`${m.jobId}:${m.studentId}`) ?? null,
  }));

  return (
    <PortalPageFrame>
      <EmployerCandidatesHeader
        activeView="matches"
        copy={employerCandidatesCopy(t)}
        params={workspaceParams}
        kicker={t('employerPortal')}
        title={t('matchHistory')}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{t('matchHistorySubtitleMobile')}</span>
            <span className="wa-hidden md:wa-block">{t('matchHistorySubtitleDesktop')}</span>
          </>
        }
      />
      {isListTruncated(matches.length, EMPLOYER_LIST_CAP, matchTotal) && (
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>
          {showingFirstLabel(matches.length, matchTotal, 'matches')}
        </p>
      )}
      <EmployerMatchHistoryClient initialRows={initialRows} />
    </PortalPageFrame>
  );
}
