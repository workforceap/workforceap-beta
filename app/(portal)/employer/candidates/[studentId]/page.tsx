import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { CourseProgressStatus } from '@prisma/client';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDateTime } from '@/lib/formatDate';
import { EMPLOYER_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { StatusTag } from '@/components/portal/kit';
import { badgeVariantToKitTone } from '@/lib/ui/statusToneAdapters';
import { employerAiMatchStatusBadgeVariant, employerMatchPipelineLabel } from '@/lib/employer/aiMatchPipelineLabels';
import {
  employerJobPostingApplicationStatusBadgeVariant,
  employerJobPostingApplicationStatusLabel,
} from '@/lib/employer/jobPostingApplicationStatus';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';

type Props = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ jobId?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ studentId: string }>;
}): Promise<Metadata> {
  const { studentId } = await params;
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('candidateProfileMetaTitle'),
    description: t('candidateProfileMetaDesc'),
    path: `/employer/candidates/${studentId}`,
  });
}

// Pinned to PORTAL_TIMEZONE so the server-rendered time matches what a
// Central-time employer expects instead of the UTC wall clock.
function formatDateTime(value: Date | null | undefined) {
  if (!value) return '—';
  return formatPortalDateTime(value) || '—';
}

export default async function EmployerCandidateProfilePage({
  params,
  searchParams,
}: Props) {
  const { studentId } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/employer/candidates/${studentId}`);

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  const sp = (await searchParams) ?? {};
  const highlightJobId = typeof sp.jobId === 'string' ? sp.jobId : null;

  const [matches, applications, matchTotal, applicationTotal] = await Promise.all([
    prisma.aIJobMatch.findMany({
      take: EMPLOYER_LIST_CAP,
      where: { studentId, job: { employerId: ctx.employerId, status: 'live' } },
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { id: true, title: true } },
      },
    }),
    prisma.jobPostingApplication.findMany({
      take: EMPLOYER_LIST_CAP,
      where: { studentId, job: { employerId: ctx.employerId } },
      orderBy: { appliedAt: 'desc' },
      include: {
        job: { select: { id: true, title: true } },
      },
    }),
    prisma.aIJobMatch.count({
      where: { studentId, job: { employerId: ctx.employerId, status: 'live' } },
    }),
    prisma.jobPostingApplication.count({
      where: { studentId, job: { employerId: ctx.employerId } },
    }),
  ]);
  const matchesTruncated = isListTruncated(matches.length, EMPLOYER_LIST_CAP, matchTotal);
  const applicationsTruncated = isListTruncated(applications.length, EMPLOYER_LIST_CAP, applicationTotal);
  const matchesLabel = showingFirstLabel(matches.length, matchTotal, 'AI matches');
  const applicationsLabel = showingFirstLabel(applications.length, applicationTotal, 'applications');

  if (matches.length === 0 && applications.length === 0) {
    notFound();
  }

  const [student, partnerReferral, counselorAssign] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: {
        fullName: true,
        email: true,
        enrolledProgram: true,
        assessmentCompleted: true,
        // Multi-program-aware: pull every enrollment + progress data
        courseEnrollments: {
          select: {
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
            enrolledAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'asc' }],
        },
        courseProgress: {
          select: {
            programSlug: true,
            courseSlug: true,
            courseId: true,
            status: true,
            percentComplete: true,
          },
        },
        profile: {
          select: {
            profileLinkedin: true,
            profileBio: true,
            employmentStatus: true,
          },
        },
      },
    }),
    prisma.partnerReferral.findFirst({
      where: { memberId: studentId },
      include: { partner: { select: { name: true } } },
    }),
    prisma.counselorAssignment.findFirst({
      where: { memberId: studentId, active: true },
      include: { counselor: { select: { id: true, user: { select: { fullName: true } } } } },
    }),
  ]);

  if (!student) notFound();

  // Multi-program-aware program label + training progress
  const enrollmentTitles = student.courseEnrollments.map(
    (row) => programDisplayTitle(row.programSlug),
  );
  const enrolledProgramTitle = student.enrolledProgram
    ? programDisplayTitle(student.enrolledProgram)
    : null;
  const programDisplay = enrollmentTitles.length > 0
    ? Array.from(new Set(enrollmentTitles)).join(' · ')
    : enrolledProgramTitle ?? '—';

  // Training progress from CourseProgress + MemberProgramProgress
  const activeEnrollment =
    student.courseEnrollments.find((row) => row.isPrimary) ??
    (student.enrolledProgram
      ? student.courseEnrollments.find((row) =>
          programSlugsEquivalent(row.programSlug, student.enrolledProgram as string),
        )
      : null) ??
    student.courseEnrollments[0] ??
    null;
  const trainingProgramSlug = activeEnrollment?.programSlug ?? student.enrolledProgram;
  const trainingProgram = trainingProgramSlug ? getProgramBySlug(trainingProgramSlug) : null;
  const trainingCourses = trainingProgram
    ? getProgramCoursesForCurriculumVersion(
        trainingProgram,
        activeEnrollment?.curriculumVersion ?? 'legacy-v1',
      )
    : [];
  const trainingCourseRows = trainingProgramSlug
    ? student.courseProgress.filter((r) =>
        programSlugsEquivalent(r.programSlug, trainingProgramSlug),
      )
    : [];
  const trainingCourseBySlug = new Map(trainingCourseRows.map((r) => [r.courseSlug, r]));
  const trainingReconciliation = trainingProgram
    ? reconcileProgramProgress({
        validatedCourses: trainingCourses,
        localRows: trainingCourseRows.map((row) => ({
          courseSlug: row.courseSlug,
          courseId: row.courseId,
          status: row.status,
          percentComplete: row.percentComplete,
        })),
      })
    : null;
  const trainingRollupPct = trainingReconciliation?.programPercent ?? 0;

  const selectedMatch = (highlightJobId ? matches.find((match) => match.jobId === highlightJobId) : null) ?? matches[0] ?? null;
  const topMatchPct = selectedMatch ? matchScoreAsPercent(selectedMatch.matchScore) : null;
  const latestApplication = applications[0] ?? null;
  const activeRoles = new Map([...matches, ...applications].map((item) => [item.jobId, item.job.title]));
  const summaryStats = [
    { label: 'Roles in pipeline', value: activeRoles.size },
    { label: 'AI matches', value: matches.length },
    { label: 'Applications', value: applications.length },
  ];

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={student.fullName ?? t('candidate')}
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">{t('candidateProfileSubtitle')}</span>
            <span className="wa-hidden md:wa-block">{t('candidateProfileSubtitleDesktop')}</span>
          </>
        }
        action={
          <Link href="/employer/matches" className="btn btn-outline btn-sm">
            {t('backToMatches')}
          </Link>
        }
      />

      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Candidate snapshot
                </p>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.35rem 0 0.2rem' }}>{student.fullName}</h2>
                <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{student.email}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
                {summaryStats.map((stat) => (
                  <div key={stat.label} style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-on-surface)' }}>{stat.value}</div>
                    <div style={{ fontSize: '0.8125rem', lineHeight: 1.25, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
              {selectedMatch ? (
                <div style={{ padding: '0.85rem', borderRadius: '0.75rem', background: 'color-mix(in srgb, var(--color-accent) 22%, var(--surface-container-lowest))', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                        Highlighted role
                      </p>
                      <p style={{ margin: '0.35rem 0 0', fontWeight: 700, color: 'var(--color-on-surface)' }}>{selectedMatch.job.title}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-marketing-rose-on-light)' }}>{topMatchPct}%</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>match</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.6rem' }}>
                    <StatusTag tone={badgeVariantToKitTone(employerAiMatchStatusBadgeVariant(selectedMatch.status))}>
                      {employerMatchPipelineLabel(selectedMatch.status)}
                    </StatusTag>
                  </div>
                </div>
              ) : null}
              {(partnerReferral || counselorAssign) ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                  {partnerReferral ? (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', background: 'var(--surface-container)', padding: '0.35rem 0.6rem', borderRadius: '0.5rem' }}>
                      Referred by {partnerReferral.partner.name}
                    </span>
                  ) : null}
                  {counselorAssign ? (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', background: 'var(--surface-container)', padding: '0.35rem 0.6rem', borderRadius: '0.5rem' }}>
                      Counselor: {counselorAssign.counselor.user.fullName}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
              Readiness
            </p>
            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Program</p>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{programDisplay}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Assessment</p>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{student.assessmentCompleted ? 'Completed' : 'Not completed'}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Employment status</p>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{student.profile?.employmentStatus ?? '—'}</p>
              </div>
              {student.profile?.profileLinkedin ? (
                <a href={student.profile.profileLinkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}>
                  Open LinkedIn profile →
                </a>
              ) : null}
            </div>
          </section>

          <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
              Coursera training
            </p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
              CourseProgress and MemberProgramProgress from Coursera for Business sync (same sources as the partner referral view).
            </p>
            {!trainingProgramSlug ? (
              <p style={{ margin: '0.75rem 0 0', fontWeight: 700 }}>No training program on file.</p>
            ) : (
              <>
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Program rollup</p>
                  <p style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>
                    {trainingRollupPct}% · {trainingProgramSlug ? programDisplayTitle(trainingProgramSlug) : null}
                  </p>
                </div>
                {trainingProgram ? (
                  <ul style={{ margin: '0.65rem 0 0', padding: 0, listStyle: 'none' }}>
                    {trainingCourses.map((course) => {
                      const row = trainingCourseBySlug.get(course.slug);
                      const done = row?.status === CourseProgressStatus.COMPLETED;
                      const pct = row?.percentComplete ?? 0;
                      return (
                        <li key={course.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                          {done ? (
                            <CheckCircle size={18} style={{ color: 'var(--color-green)', flexShrink: 0 }} aria-hidden />
                          ) : (
                            <span
                              aria-hidden
                              style={{
                                display: 'inline-block',
                                width: 18,
                                height: 18,
                                border: '2px solid var(--outline-variant)',
                                borderRadius: 4,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span style={{ flex: 1 }}>
                            {course.name}
                            {!done ? (
                              <span style={{ color: 'var(--color-on-surface-variant)' }}>
                                {row ? ` — ${pct}%` : ' — not started'}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ margin: '0.65rem 0 0', color: 'var(--color-on-surface-variant)' }}>
                    Program catalog not found for this slug.
                  </p>
                )}
              </>
            )}
          </section>

          {student.profile?.profileBio ? (
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                Candidate summary
              </p>
              <p style={{ margin: '0.75rem 0 0', lineHeight: 1.55, color: 'var(--color-on-surface-variant)' }}>{student.profile.profileBio}</p>
            </section>
          ) : null}

          {matches.length > 0 ? (
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                AI match history
              </p>
              {matchesTruncated ? (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{matchesLabel}</p>
              ) : null}
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                {matches.map((match) => (
                  <div key={match.id} style={{ padding: '0.85rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/employer/jobs/${match.jobId}`} className="hover:wa-underline" style={{ fontWeight: 700, color: 'var(--color-on-surface)', textDecoration: 'none' }}>
                          {match.job.title}
                        </Link>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                          Added {formatDateTime(match.createdAt)}
                        </p>
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-accent)', flexShrink: 0 }}>
                        {matchScoreAsPercent(match.matchScore)}%
                      </div>
                    </div>
                    <div style={{ marginTop: '0.55rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      <StatusTag tone={badgeVariantToKitTone(employerAiMatchStatusBadgeVariant(match.status))}>
                        {employerMatchPipelineLabel(match.status)}
                      </StatusTag>
                      {highlightJobId === match.jobId ? (
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>Current focus</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {applications.length > 0 ? (
            <section className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                Applications
              </p>
              {applicationsTruncated ? (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{applicationsLabel}</p>
              ) : null}
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                {applications.map((application) => (
                  <div key={application.id} style={{ padding: '0.85rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)' }}>
                    <Link href={`/employer/jobs/${application.jobId}`} className="hover:wa-underline" style={{ fontWeight: 700, color: 'var(--color-on-surface)', textDecoration: 'none' }}>
                      {application.job.title}
                    </Link>
                    <div style={{ marginTop: '0.35rem' }}>
                      <StatusTag tone={badgeVariantToKitTone(employerJobPostingApplicationStatusBadgeVariant(application.status))}>
                        {employerJobPostingApplicationStatusLabel(application.status)}
                      </StatusTag>
                    </div>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      Applied {formatDateTime(application.appliedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
            <Link
              href="/employer/pipeline"
              className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.8rem',
                background: 'var(--color-accent)',
                color: 'var(--wa-on-accent-control)',
                borderRadius: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                minHeight: '44px',
              }}
            >
              Open pipeline
            </Link>
            <Link
              href="/employer/messages"
              className="hover:wa-opacity-80 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.8rem',
                background: 'var(--surface-container)',
                color: 'var(--color-on-surface)',
                borderRadius: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                minHeight: '44px',
              }}
            >
              Contact member
            </Link>
          </div>
        </div>

      </div>

      <div className="wa-hidden md:wa-block">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: '1rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>Candidate snapshot</p>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.35rem 0 0.2rem' }}>{student.fullName}</h2>
                    <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', overflowWrap: 'anywhere' }}>{student.email}</p>
                    {(partnerReferral || counselorAssign) ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                        {partnerReferral ? (
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', background: 'var(--surface-container)', padding: '0.3rem 0.55rem', borderRadius: '0.5rem' }}>
                            Referred by {partnerReferral.partner.name}
                          </span>
                        ) : null}
                        {counselorAssign ? (
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', background: 'var(--surface-container)', padding: '0.3rem 0.55rem', borderRadius: '0.5rem' }}>
                            Counselor: {counselorAssign.counselor.user.fullName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {selectedMatch ? (
                    <div style={{ minWidth: '8.5rem', padding: '0.9rem 1rem', borderRadius: '0.9rem', background: 'color-mix(in srgb, var(--color-accent) 24%, var(--surface-container-lowest))', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-marketing-rose-on-light)' }}>{topMatchPct}%</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>top match</div>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                  {summaryStats.map((stat) => (
                    <div key={stat.label} style={{ padding: '0.9rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{stat.value}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.9rem' }}>Program and readiness</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.9rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Program</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{programDisplay}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Assessment</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{student.assessmentCompleted ? 'Completed' : 'Not completed'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Employment status</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{student.profile?.employmentStatus ?? '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>LinkedIn</p>
                    {student.profile?.profileLinkedin ? (
                      <a href={student.profile.profileLinkedin} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.3rem', fontWeight: 700 }}>
                        Open profile
                      </a>
                    ) : (
                      <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>—</p>
                    )}
                  </div>
                </div>
                {student.profile?.profileBio ? (
                  <p style={{ margin: '1rem 0 0', lineHeight: 1.6, color: 'var(--color-on-surface-variant)' }}>{student.profile.profileBio}</p>
                ) : null}
              </div>

              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Coursera training</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                  CourseProgress and MemberProgramProgress from Coursera for Business sync (same sources as the partner referral view).
                </p>
                {!trainingProgramSlug ? (
                  <p style={{ margin: '0.85rem 0 0', fontWeight: 700 }}>No training program on file.</p>
                ) : (
                  <>
                    <div style={{ marginTop: '0.85rem' }}>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Program rollup</p>
                      <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>
                        {trainingRollupPct}% · {trainingProgramSlug ? programDisplayTitle(trainingProgramSlug) : null}
                      </p>
                    </div>
                    {trainingProgram ? (
                      <ul style={{ margin: '0.75rem 0 0', padding: 0, listStyle: 'none' }}>
                        {trainingCourses.map((course) => {
                          const row = trainingCourseBySlug.get(course.slug);
                          const done = row?.status === CourseProgressStatus.COMPLETED;
                          const pct = row?.percentComplete ?? 0;
                          return (
                            <li key={course.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                              {done ? (
                                <CheckCircle size={18} style={{ color: 'var(--color-green)', flexShrink: 0 }} aria-hidden />
                              ) : (
                                <span
                                  aria-hidden
                                  style={{
                                    display: 'inline-block',
                                    width: 18,
                                    height: 18,
                                    border: '2px solid var(--outline-variant)',
                                    borderRadius: 4,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <span style={{ flex: 1 }}>
                                {course.name}
                                {!done ? (
                                  <span style={{ color: 'var(--color-on-surface-variant)' }}>
                                    {row ? ` — ${pct}%` : ' — not started'}
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p style={{ margin: '0.75rem 0 0', color: 'var(--color-on-surface-variant)' }}>
                        Program catalog not found for this slug.
                      </p>
                    )}
                  </>
                )}
              </div>

              {matches.length > 0 ? (
                <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                  <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.9rem' }}>AI match history</h2>
                  {matchesTruncated ? (
                    <p style={{ margin: '-0.45rem 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{matchesLabel}</p>
                  ) : null}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {matches.map((match) => (
                      <div key={match.id} style={{ padding: '0.95rem 1rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/employer/jobs/${match.jobId}`} style={{ fontWeight: 700 }}>{match.job.title}</Link>
                            <p style={{ margin: '0.3rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                              Added {formatDateTime(match.createdAt)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-accent)' }}>{matchScoreAsPercent(match.matchScore)}%</div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>match</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.65rem' }}>
                          <StatusTag tone={badgeVariantToKitTone(employerAiMatchStatusBadgeVariant(match.status))}>
                            {employerMatchPipelineLabel(match.status)}
                          </StatusTag>
                          {highlightJobId === match.jobId ? <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>Current focus</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {applications.length > 0 ? (
                <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                  <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.9rem' }}>Applications</h2>
                  {applicationsTruncated ? (
                    <p style={{ margin: '-0.45rem 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{applicationsLabel}</p>
                  ) : null}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {applications.map((application) => (
                      <div key={application.id} style={{ padding: '0.95rem 1rem', borderRadius: '0.9rem', background: 'var(--surface-container-low)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/employer/jobs/${application.jobId}`} style={{ fontWeight: 700 }}>{application.job.title}</Link>
                            <p style={{ margin: '0.3rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                              Applied {formatDateTime(application.appliedAt)}
                            </p>
                          </div>
                          <StatusTag tone={badgeVariantToKitTone(employerJobPostingApplicationStatusBadgeVariant(application.status))}>
                            {employerJobPostingApplicationStatusLabel(application.status)}
                          </StatusTag>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside style={{ display: 'grid', gap: '1rem' }}>
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.9rem' }}>Next best action</h2>
                {selectedMatch ? (
                  <>
                    <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                      Review the {selectedMatch.job.title} match first, then decide whether to move this candidate forward in your pipeline.
                    </p>
                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
                      <Link href={`/employer/jobs/${selectedMatch.jobId}`} className="btn btn-primary">Open role</Link>
                      <Link href="/employer/messages" className="btn btn-outline">Message candidate</Link>
                    </div>
                  </>
                ) : latestApplication ? (
                  <>
                    <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                      This member has already applied. Review the application status and keep outreach moving.
                    </p>
                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
                      <Link href={`/employer/jobs/${latestApplication.jobId}`} className="btn btn-primary">Open latest application</Link>
                      <Link href="/employer/pipeline" className="btn btn-outline">Open pipeline</Link>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.9rem' }}>Pipeline notes</h2>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Highlighted role</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{selectedMatch?.job.title ?? latestApplication?.job.title ?? '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Latest application</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>{latestApplication ? formatDateTime(latestApplication.appliedAt) : 'No application yet'}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Profile completeness</p>
                    <p style={{ margin: '0.3rem 0 0', fontWeight: 700 }}>
                      {student.profile?.profileBio || student.profile?.profileLinkedin ? 'Strong enough to review' : 'Light profile, verify details in outreach'}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
      </div>
    </PortalPageFrame>
  );
}
