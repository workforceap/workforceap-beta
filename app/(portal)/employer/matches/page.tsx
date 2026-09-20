import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import { getTranslations } from 'next-intl/server';
import { EMPLOYER_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('matchHistoryMetaTitle'),
    description: t('matchHistoryMetaDesc'),
    path: '/employer/matches',
  });
}

export default async function EmployerMatchesPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/matches');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

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
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('matchHistory')}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{t('matchHistorySubtitleMobile')}</span>
            <span className="wa-hidden md:wa-block">{t('matchHistorySubtitleDesktop')}</span>
          </>
        }
        breadcrumbs={[
          { label: t('employerPortal'), href: '/employer' },
          { label: t('matchHistory') },
        ]}
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
