import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getMemberState, getMemberStateFull } from '@/lib/member/getMemberState';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  computeTrainingProgress,
  resolveTrainingProgressAssignment,
} from '@/lib/member/trainingProgress';
import PageHeader from '@/components/portal/PageHeader';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('careerBrief') ?? 'Career Brief',
    description:
      t('careerBriefDescription') ??
      'Your personalized career readiness snapshot — training, skills, and next steps.',
    path: '/dashboard/career-brief',
  });
}

export default async function CareerBriefPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/career-brief');
  const t = await getTranslations('dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  // ── Single source of truth: member state (training, profile, next actions, etc.)
  const [memberState, memberStateFull] = await Promise.all([
    getMemberState(user.id, { readOnlyAudit }),
    getMemberStateFull(user.id, { readOnlyAudit }),
  ]);

  // ── Additional targeted queries ──
  const [aiJobMatchCount, nextBestActionRows, dbUser, placementRecord] = await Promise.all([
    prisma.aIJobMatch.count({ where: { studentId: user.id } }),
    prisma.memberNextBestAction.findMany({
      where: { memberId: user.id, status: 'PENDING' },
      orderBy: { priority: 'desc' },
      take: 1,
      select: {
        id: true,
        title: true,
        description: true,
        ctaHref: true,
        ctaLabel: true,
        priority: true,
        icon: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        assessmentScorePct: true,
        assessmentScore: true,
        courseEnrollments: {
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          select: {
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
          },
        },
        profile: {
          select: {
            resumeOriginalPath: true,
            resumeEnhancedPath: true,
          },
        },
      },
    }),
    prisma.placementRecord.findUnique({
      where: { userId: user.id },
      select: {
        employerName: true,
        jobTitle: true,
        salaryOffered: true,
        placedAt: true,
      },
    }),
  ]);

  // ── Training progress ──
  const trainingView = memberState.trainingView;
  const assignment = resolveTrainingProgressAssignment(
    memberState.enrolledProgram,
    dbUser?.courseEnrollments ?? [],
  );
  const enrolledProgram = assignment.programSlug;
  const program = enrolledProgram ? getProgramBySlug(enrolledProgram) : null;
  const trainingProgress = computeTrainingProgress({
    enrolledProgram,
    curriculumVersion: assignment.curriculumVersion,
    coursesCompleted: trainingView?.completedSlugsAuthoritative ?? [],
  });

  // ── Skills / assessment ──
  const assessmentScorePct = dbUser?.assessmentScorePct ?? dbUser?.assessmentScore ?? null;

  // ── Resume status ──
  const hasOriginalResume = !!dbUser?.profile?.resumeOriginalPath;
  const hasEnhancedResume = !!dbUser?.profile?.resumeEnhancedPath;
  const resumeStatus = hasEnhancedResume
    ? 'enhanced'
    : hasOriginalResume
      ? 'uploaded'
      : 'missing';

  // ── Next best action ──
  const dominantNextAction =
    nextBestActionRows[0] ?? memberState.nextBestActions[0] ?? null;

  // ── Job matches ──
  // AIJobMatch count from our targeted query + any active/saved job applications as "tracked"
  const jobMatchCount = aiJobMatchCount;
  const applicationCount = memberState.jobApplicationCount;

  // ── Placement ──
  const isPlaced = !!placementRecord?.placedAt;

  // ── Breadcrumb ──
  const breadcrumbs = [
    { label: t('memberDashboard') ?? 'Dashboard', href: '/dashboard' },
    { label: t('careerBrief') ?? 'Career Brief', href: '/dashboard/career-brief' },
  ];

  return (
    <div className="portal-page-container">
      {readOnlyAudit && (
        <span hidden data-portal-audit-suppressed="member-state-cache-and-resume-storage" />
      )}
      <PageHeader
        title={t('careerBrief') ?? 'Career Brief'}
        subtitle={t('careerBriefSubtitle') ?? 'Your career readiness at a glance.'}
        breadcrumbs={breadcrumbs}
      />

      {/* ── Metric Cards ── */}
      <div className="portal-metric-strip" style={{ marginTop: '1.5rem' }}>
        {/* Training Progress */}
        <Link href="/dashboard/learning" className="wa-no-underline">
          <div className="portal-metric-card portal-card--action">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                school
              </span>
            </div>
            <p className="portal-metric-card__value">
              {trainingProgress.pct}
              <span style={{ fontSize: '1rem' }}>%</span>
            </p>
            <p className="portal-metric-card__label">
              {t('trainingProgress') ?? 'Training Progress'}
            </p>
            <p className="portal-metric-card__hint">
              {t('coursesComplete', {
                completed: trainingProgress.completedCount,
                total: trainingProgress.totalCourses,
                plural: trainingProgress.totalCourses === 1 ? '' : 's',
              })}
            </p>
          </div>
        </Link>

        {/* Skills / Assessment */}
        <Link href="/dashboard/ai-tools/skill-mapper" className="wa-no-underline">
          <div className="portal-metric-card portal-card--action">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                radar
              </span>
            </div>
            <p className="portal-metric-card__value">
              {assessmentScorePct !== null ? assessmentScorePct : '—'}
              {assessmentScorePct !== null && (
                <span style={{ fontSize: '1rem' }}>%</span>
              )}
            </p>
            <p className="portal-metric-card__label">
              {t('skillsScore') ?? 'Skills Score'}
            </p>
            <p className="portal-metric-card__hint">
              {t('skillMapperLink') ?? 'Skill Mapper'}
            </p>
          </div>
        </Link>

        {/* Resume Status */}
        <Link href="/dashboard/ai-tools/resume-studio?view=rewrite" className="wa-no-underline">
          <div className="portal-metric-card portal-card--action">
            <div
              className={`portal-metric-card__icon-wrap ${
                resumeStatus === 'enhanced'
                  ? 'portal-metric-card__icon-wrap--green'
                  : resumeStatus === 'uploaded'
                    ? 'portal-metric-card__icon-wrap--gold'
                    : 'portal-metric-card__icon-wrap--accent'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                description
              </span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.375rem' }}>
              {resumeStatus === 'enhanced'
                ? (t('enhanced') ?? 'Enhanced')
                : resumeStatus === 'uploaded'
                  ? (t('uploaded') ?? 'Uploaded')
                  : (t('missing') ?? 'Missing')}
            </p>
            <p className="portal-metric-card__label">
              {t('resumeStatus') ?? 'Resume Status'}
            </p>
            <p className="portal-metric-card__hint">
              {resumeStatus === 'missing'
                ? (t('uploadResumeHint') ?? 'Upload to get started')
                : resumeStatus === 'uploaded'
                  ? (t('enhanceResumeHint') ?? 'Enhance with AI')
                  : (t('resumeReadyHint') ?? 'Ready for applications')}
            </p>
          </div>
        </Link>

        {/* Job Matches */}
        <Link href="/dashboard/jobs" className="wa-no-underline">
          <div className="portal-metric-card portal-card--action">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                auto_awesome
              </span>
            </div>
            <p className="portal-metric-card__value">{jobMatchCount}</p>
            <p className="portal-metric-card__label">
              {t('jobMatches') ?? 'Job Matches'}
            </p>
            <p className="portal-metric-card__hint">
              {t('aiMatchedRoles') ?? 'AI-matched roles'}
            </p>
          </div>
        </Link>

        {/* Applications */}
        <Link href="/dashboard/job-applications" className="wa-no-underline">
          <div className="portal-metric-card portal-card--action">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--gold">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                work
              </span>
            </div>
            <p className="portal-metric-card__value">{applicationCount}</p>
            <p className="portal-metric-card__label">
              {t('applications') ?? 'Applications'}
            </p>
            <p className="portal-metric-card__hint">
              {t('trackedApplications') ?? 'Tracked applications'}
            </p>
          </div>
        </Link>

        {/* Placement */}
        {isPlaced ? (
          <div className="portal-metric-card portal-card--gradient-accent">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                verified
              </span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.375rem', color: 'var(--color-green, #4a9b4f)' }}>
              {t('placed') ?? 'Placed'}
            </p>
            <p className="portal-metric-card__label">
              {t('placementStatus') ?? 'Placement Status'}
            </p>
            <p className="portal-metric-card__hint">
              {placementRecord?.employerName ?? ''}
              {placementRecord?.salaryOffered
                ? ` · $${placementRecord.salaryOffered.toLocaleString()}`
                : ''}
            </p>
          </div>
        ) : (
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1", color: 'var(--color-on-surface-variant)' }} aria-hidden="true">
                work_outline
              </span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.375rem' }}>
              {t('open') ?? 'Open'}
            </p>
            <p className="portal-metric-card__label">
              {t('placementStatus') ?? 'Placement Status'}
            </p>
            <p className="portal-metric-card__hint">
              {t('notPlacedYet') ?? 'Not placed yet'}
            </p>
          </div>
        )}
      </div>

      {/* ── Next Best Action ── */}
      {dominantNextAction && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              priority_high
            </span>
            <h2
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--color-on-surface-variant)',
                margin: 0,
              }}
            >
              {t('nextBestAction') ?? 'Next Best Action'}
            </h2>
          </div>
          <Link
            href={dominantNextAction.ctaHref ?? '/dashboard'}
            className="portal-quick-action-item"
            style={{
              textDecoration: 'none',
              border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 4%, transparent)',
            }}
          >
            <div
              className="portal-quick-action-item__icon"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                {dominantNextAction.icon ?? 'arrow_forward'}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="portal-quick-action-item__label" style={{ color: 'var(--color-on-surface)' }}>
                {dominantNextAction.title}
              </p>
              {dominantNextAction.description && (
                <p className="portal-quick-action-item__desc">{dominantNextAction.description}</p>
              )}
            </div>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '1rem', color: 'var(--color-accent)', opacity: 0.6, flexShrink: 0 }}
              aria-hidden="true"
            >
              chevron_right
            </span>
          </Link>
        </div>
      )}

      {/* ── Program Context ── */}
      {program && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.125rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                flag
              </span>
              <h2
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-on-surface-variant)',
                  margin: 0,
                }}
              >
                {t('activeProgram') ?? 'Active Program'}
              </h2>
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>
              {program.title}
            </p>
            <div style={{ marginTop: '0.875rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <Link href="/dashboard/learning" className="btn btn-primary btn-sm">
                {t('continueTraining') ?? 'Continue Training'}
              </Link>
              <Link href="/dashboard/program" className="btn btn-ghost btn-sm">
                {t('programDetails') ?? 'Program Details'}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            build
          </span>
          <h2
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-on-surface-variant)',
              margin: 0,
            }}
          >
            {t('careerToolkit') ?? 'AI Career Tools'}
          </h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            {
              label: t('careerToolkit') ?? 'AI Career Tools',
              href: '/dashboard/ai-tools',
              icon: 'auto_awesome',
            },
            {
              label: t('skillMapper') ?? 'Skill Mapper',
              href: '/dashboard/ai-tools/skill-mapper',
              icon: 'radar',
            },
            {
              label: t('uploadResume') ?? 'Upload Resume',
              href: '/dashboard/ai-tools/resume-studio?view=rewrite',
              icon: 'description',
            },
            {
              label: t('jobBoard') ?? 'Job board',
              href: '/dashboard/jobs',
              icon: 'work',
            },
            {
              label: t('readinessChecklist') ?? 'Readiness Checklist',
              href: '/dashboard/readiness',
              icon: 'checklist',
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="portal-quick-action-item"
              style={{ textDecoration: 'none', flex: '0 0 auto', padding: '0.5rem 0.875rem' }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                {link.icon}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
