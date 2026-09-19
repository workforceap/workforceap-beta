import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import { prisma } from '@/lib/db/prisma';
import EmployerPipelineClient from '@/components/employer/EmployerPipelineClient';
import EmployerKanban from '@/components/employer/EmployerKanban';
import EmployerMatchStatusSelect from '@/components/employer/EmployerMatchStatusSelect';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import { programDisplayTitle } from '@/lib/content/programTitle';
import StatusBadge from '@/components/portal/StatusBadge';
import { employerAiMatchStatusBadgeVariant, employerMatchPipelineLabel } from '@/lib/employer/aiMatchPipelineLabels';
import { getTranslations } from 'next-intl/server';
import { EMPLOYER_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('candidatePipelineMetaTitle'),
    description: t('candidatePipelineMetaDesc'),
    path: '/employer/pipeline',
  });
}

export default async function EmployerPipelinePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/pipeline');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const liveJobWhere = { employerId: ctx.employerId, status: 'live' as const };
  const [jobTotal, jobs] = await Promise.all([
    prisma.job.count({ where: liveJobWhere }),
    prisma.job.findMany({
      take: EMPLOYER_LIST_CAP,
      where: liveJobWhere,
      select: { id: true, title: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const jobIds = jobs.map((j) => j.id);
  const matchTotal =
    jobIds.length === 0
      ? 0
      : await prisma.aIJobMatch.count({ where: { jobId: { in: jobIds } } });
  const allMatches =
    jobIds.length === 0
      ? []
      : await prisma.aIJobMatch.findMany({
        take: EMPLOYER_LIST_CAP,
          where: { jobId: { in: jobIds } },
          orderBy: [{ jobId: 'asc' }, { matchScore: 'desc' }],
          include: {
            // Multi-program-aware: pull every enrollment so the pipeline row
            // can list ALL programs comma-separated (primary first), instead
            // of showing only the denormalized `User.enrolledProgram` slug.
            student: {
              select: {
                id: true,
                fullName: true,
                email: true,
                enrolledProgram: true,
                courseEnrollments: {
                  select: { programSlug: true, isPrimary: true, enrolledAt: true },
                  orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'asc' }],
                },
              },
            },
          },
        });

  // Comma-joined list of all programs each candidate is in (primary first).
  // For single-program candidates this collapses to today's display.
  function programDisplayFor(student: { enrolledProgram: string | null; courseEnrollments: { programSlug: string }[] }): string {
    const titles = student.courseEnrollments.map(
      (row) => programDisplayTitle(row.programSlug),
    );
    if (titles.length > 0) return Array.from(new Set(titles)).join(' · ');
    if (student.enrolledProgram) {
      return programDisplayTitle(student.enrolledProgram);
    }
    return t('noProgram');
  }

  const byJob = new Map<string, typeof allMatches>();
  for (const m of allMatches) {
    const list = byJob.get(m.jobId) ?? [];
    list.push(m);
    byJob.set(m.jobId, list);
  }

  const PIPELINE_STRIP = [
    {
      label: t('pipelineNew'),
      count: allMatches.filter((m) =>
        ['suggested', 'employer_notified', 'student_notified'].includes(m.status)
      ).length,
    },
    { label: t('pipelineContact'), count: allMatches.filter((m) => m.status === 'contacted').length },
    { label: t('interview'), count: allMatches.filter((m) => m.status === 'interviewing').length },
    { label: t('hired'), count: allMatches.filter((m) => m.status === 'hired').length },
  ];

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('candidatePipeline')}
        breadcrumbs={[{ label: t('employerPortal'), href: '/employer' }, { label: t('candidatePipeline') }]}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{t('candidatePipelineSubtitleMobile')}</span>
            <span className="wa-hidden md:wa-block">{t('candidatePipelineSubtitleDesktop')}</span>
          </>
        }
        action={<Link href="/employer/jobs" className="btn btn-outline btn-sm">{t('backToJobs')}</Link>}
      />
      {(isListTruncated(jobs.length, EMPLOYER_LIST_CAP, jobTotal) ||
        isListTruncated(allMatches.length, EMPLOYER_LIST_CAP, matchTotal)) && (
        <p style={{ fontSize: 12, color: 'var(--wa-muted)', margin: '0 1rem 0.75rem' }}>
          {showingFirstLabel(
            Math.min(allMatches.length, EMPLOYER_LIST_CAP),
            Math.max(matchTotal, allMatches.length),
            'matches'
          )}
          {jobTotal > EMPLOYER_LIST_CAP ? ` · ${showingFirstLabel(jobs.length, jobTotal, 'live jobs')}` : ''}
        </p>
      )}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0 1rem 0.875rem' }}>
          {PIPELINE_STRIP.map((stage) => (
            <div key={stage.label} className="portal-card portal-card--flat" style={{ flexShrink: 0, textAlign: 'center', padding: '0.625rem 1rem', minWidth: '80px' }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>{stage.count}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginTop: '0.125rem' }}>{stage.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1rem' }}>
          {jobs.length === 0 ? (
            <div className="portal-card portal-card--flat" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">account_tree</span>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>No pipeline yet</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem' }}>Post a job to receive matched candidates.</p>
              <Link href="/employer/jobs/new" className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">add</span>Post a Job
              </Link>
            </div>
          ) : allMatches.length === 0 ? (
            <div className="portal-card portal-card--flat" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">psychology</span>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>No matches yet</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem' }}>Matches will appear once your jobs are live.</p>
              <Link href="/employer/jobs" className="btn btn-muted btn-sm">
                View Your Jobs
              </Link>
            </div>
          ) : (
            jobs.map((job) => {
              const matches = byJob.get(job.id) ?? [];
              if (matches.length === 0) return null;
              return (
                <div key={job.id}>
                  <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem' }}>{job.title}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {matches.map((m) => (
                      <div key={m.id} className="portal-card portal-card--flat">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', background: 'var(--surface-container-low)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                            {getInitials(m.student.fullName ?? '?')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="wa-truncate" style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{m.student.fullName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{programDisplayFor(m.student)}</div>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 0, maxWidth: '42%' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>{matchScoreAsPercent(m.matchScore)}%</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                              <StatusBadge className="wa-truncate max-w-full" label={employerMatchPipelineLabel(m.status)} variant={employerAiMatchStatusBadgeVariant(m.status)} />
                            </div>
                          </div>
                        </div>
                        <EmployerMatchStatusSelect jobId={job.id} studentId={m.student.id} initialStatus={m.status} compact />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="wa-hidden md:wa-block">
        {jobs.length === 0 ? (
          <div className="portal-card portal-card--flat" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '1rem' }} aria-hidden="true">account_tree</span>
            <h3 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem', color: 'var(--color-on-surface)' }}>No pipeline yet</h3>
            <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>Post a job to receive matched candidates here.</p>
            <Link href="/employer/jobs/new" className="btn btn-primary">Post your first job</Link>
          </div>
        ) : allMatches.length === 0 ? (
          <div className="portal-card portal-card--flat" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '1rem' }} aria-hidden="true">psychology</span>
            <h3 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem', color: 'var(--color-on-surface)' }}>No matches yet</h3>
            <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem' }}>Matches appear here after admin runs job–candidate matching.</p>
            <Link href="/employer/jobs" className="btn btn-muted">View Your Jobs</Link>
          </div>
        ) : (
          <EmployerKanban initialMatches={allMatches.map(m => ({ id: m.id, jobId: m.jobId, jobTitle: jobs.find(j => j.id === m.jobId)?.title ?? 'Job', matchScore: m.matchScore, matchReasons: m.matchReasons, status: m.status, student: m.student }))} />
        )}
      </div>
    </PortalPageFrame>
  );
}
