import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getPathwayForProgram } from '@/lib/content/learningPathways';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { buildPathwayMilestones } from '@/lib/content/pathwayStepDisplay';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import { CardHead, ProgressRing, ProgressBar, StatusTag } from '@/components/portal/kit';
import LearningPathCard from '@/components/portal/LearningPathCard';
import LearningHubDestinationCards from '@/components/portal/LearningHubDestinationCards';
import LearningHubEnrolledCourses from '@/components/portal/LearningHubEnrolledCourses';
import FindYourCareerSection from '@/components/portal/FindYourCareerSection';
import SkillMissionPanel from '@/components/portal/SkillMissionPanel';
import SkillsetProgressList from '@/components/portal/SkillsetProgressList';
import VoiceCoachLauncherCard from '@/components/portal/VoiceCoachLauncherCard';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';
import { loadMemberSkillsetProgress } from '@/lib/coursera/memberSkillsetProgress';
import { readinessVoiceSurface } from '@/lib/portal/voice';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { digitalLiteracyFirstModuleHref } from '@/lib/content/courseDelivery';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'The Learning Hub',
  description:
    'Learning pathways, the career resource library, and program-specific tools — organized in one place.',
  path: '/dashboard/learning',
});
}

/* Icon map for upcoming modules */
const MODULE_ICONS: Record<string, string> = {
  Technology: 'terminal',
  'Data & AI': 'query_stats',
  Business: 'business_center',
};

export default async function LearningPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/learning');

  const [allProgress, dbUser] = await Promise.all([
    prisma.pathwayStepProgress.findMany({
      take: 500,
      where: { userId: user.id },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        enrolledProgram: true,
        assessmentCompleted: true,
        courseraEnrollmentApproved: true,
        courseEnrollments: {
          select: {
            id: true,
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
            enrolledAt: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        },
        courseProgress: {
          where: { status: 'COMPLETED' },
          select: { programSlug: true, courseSlug: true },
        },
      },
    }),
  ]);
  const courseEnrollments = dbUser?.courseEnrollments ?? [];
  const { activeProgramSlug: enrolledProgram } = resolveActiveDashboardProgram({
    enrollments: courseEnrollments,
    legacyEnrolledProgram: dbUser?.enrolledProgram ?? null,
  });
  const activeEnrollment = courseEnrollments.find((enrollment) =>
    enrolledProgram
      ? programSlugsEquivalent(enrollment.programSlug, enrolledProgram)
      : false,
  ) ?? null;
  const curriculumVersion = activeEnrollment?.curriculumVersion ?? 'legacy-v1';
  // Resolve the member's pathway from their enrolled program. Returns null
  // when the member has no enrolled program — we render an enroll-prompt
  // empty state instead of a default IT Support / Digital Literacy pathway.
  const ACTIVE_PATHWAY = getPathwayForProgram(enrolledProgram, curriculumVersion);
  const programMeta = enrolledProgram ? getProgramBySlug(enrolledProgram) : null;
  // CourseEnrollment.curriculumVersion is immutable for the member. Only
  // members without a CourseEnrollment retain the legacy public-catalog view.
  const coursesForMember = programMeta
    ? getProgramCoursesForCurriculumVersion(programMeta, curriculumVersion)
    : [];
  const coursesCompletedSlugs = enrolledProgram
    ? dbUser?.courseProgress
        .filter((row) => programSlugsEquivalent(row.programSlug, enrolledProgram))
        .map((row) => row.courseSlug) ?? []
    : [];
  const [skillMissionSummary, memberSkillsetProgress] = await Promise.all([
    loadSkillMissionSummary({
      userId: user.id,
      programSlug: enrolledProgram,
      curriculumVersion,
      completedCourseSlugs: coursesCompletedSlugs,
    }),
    loadMemberSkillsetProgress(user.id),
  ]);
  const pathwayMilestones = ACTIVE_PATHWAY
    ? buildPathwayMilestones(ACTIVE_PATHWAY, allProgress)
    : [];

  const completedPathwaySteps = pathwayMilestones.filter((m) => m.status === 'complete').length;
  const overallPct =
    ACTIVE_PATHWAY && ACTIVE_PATHWAY.steps.length > 0
      ? Math.round((completedPathwaySteps / ACTIVE_PATHWAY.steps.length) * 100)
      : 0;
  const learningStatusLabel = overallPct > 0 ? 'In Progress' : 'Ready to start';

  return (
    <>
    <h1 className="wa-sr-only">The Learning Hub</h1>
    <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', paddingBottom: '6rem' }}>
    {/* ── Mobile learning view (≤640px) ── */}
    <div className="md:wa-hidden">
      {/* Header */}
      <div style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1.5rem' }}>
        <p className="wa-text-[13px] wa-font-medium wa-tracking-[0.1em] wa-uppercase wa-text-[var(--color-accent)]" style={{ display: 'block', marginBottom: '0.5rem' }}>Your Learning</p>
        <h2 className="wa-text-3xl wa-font-bold wa-tracking-tight wa-text-[var(--color-on-surface)] wa-leading-tight">The Learning Hub</h2>
      </div>

      {/* Empty state when no enrolled program */}
      {!ACTIVE_PATHWAY && (
        <div style={{ margin: '0 1.5rem 1.5rem' }}>
          <PortalEmptyState
            icon={
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                school
              </span>
            }
            title="No active learning pathway"
            description="Start digital basics now — no application needed — or choose a funded program."
            primaryAction={{ href: digitalLiteracyFirstModuleHref(), label: 'Start digital basics, no application needed' }}
            secondaryAction={{ href: '/dashboard/program', label: 'Choose a program' }}
          />
        </div>
      )}

      {/* Progress overview card */}
      {ACTIVE_PATHWAY && (
      <section className="wa-kit-card" style={{ margin: '0 1.5rem 1.5rem' }}>
        <CardHead title="Progress overview" />
        <div className="wa-flex wa-items-start wa-justify-between" style={{ marginTop: -6 }}>
          <div style={{ zIndex: 10, width: '60%' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, color: 'var(--wa-text)', margin: '0 0 4px' }}>{ACTIVE_PATHWAY.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600, margin: 0 }}>
              {learningStatusLabel} · {ACTIVE_PATHWAY.steps.length} modules
            </p>
          </div>
          <ProgressRing pct={overallPct} size={80} tone="warn" label="Pathway progress" />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <ProgressBar pct={overallPct} aria-label="Pathway progress" />
        </div>
      </section>
      )}
    </div>

    {/* ── Desktop header ── */}
    <div className="wa-hidden md:wa-block">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <div>
          <PageHeader
            title="The Learning Hub"
            subtitle="Your pathways, searchable career resources, and program-specific tools — organized so you always know where to look next."
            breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'Learning Hub' }]}
            titleHeadingLevel={2}
          />
        </div>

        {ACTIVE_PATHWAY && (
        <div
          style={{
            background: 'var(--surface-container)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-4) var(--space-6)',
            minWidth: '200px',
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-2)' }}>
            Pathway Progress
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-2)', fontVariantNumeric: 'tabular-nums' }}>
            {overallPct}%
          </div>
          <div style={{ height: '6px', background: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, overallPct)}%`, background: 'var(--color-accent)', borderRadius: 'var(--radius-full)', transition: 'var(--transition-base)' }} />
          </div>
        </div>
        )}
      </div>

      {!ACTIVE_PATHWAY && (
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <PortalEmptyState
            icon={
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                school
              </span>
            }
            title="No active learning pathway"
            description="Start digital basics now — no application needed — or choose a funded program."
            primaryAction={{ href: digitalLiteracyFirstModuleHref(), label: 'Start digital basics, no application needed' }}
            secondaryAction={{ href: '/dashboard/program', label: 'Choose a program' }}
          />
        </div>
      )}
    </div>

    <LearningHubEnrolledCourses
      programSlug={enrolledProgram}
      programTitle={programMeta?.title ?? null}
      courses={coursesForMember}
      completedSlugs={coursesCompletedSlugs}
      assessmentCompleted={dbUser?.assessmentCompleted ?? false}
      eligibilityApproved={dbUser?.courseraEnrollmentApproved ?? false}
      languagesSupported={programMeta?.languagesSupported}
    />

    <div className="md:wa-hidden">
      {memberSkillsetProgress.length > 0 && (
        <div className="portal-card portal-card--flat" style={{ margin: '0 1.5rem 1.5rem', padding: '1rem' }}>
          <SkillsetProgressList rows={memberSkillsetProgress} variant="member" />
        </div>
      )}

      <div style={{ margin: '0 1.5rem 1.5rem' }}>
        <SkillMissionPanel summary={skillMissionSummary} />
      </div>

      <FindYourCareerSection compact />

      {/* Current module card */}
      {ACTIVE_PATHWAY && (
      <section style={{ margin: '0 1.5rem 1.5rem' }}>
        <div className="wa-bg-gradient-to-br from-[var(--wa-hero-crimson-dark)] to-[var(--wa-hero-crimson)] wa-text-white" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="bg-white/20 wa-text-[13px] wa-font-bold wa-tracking-wider wa-uppercase" style={{ padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>{overallPct > 0 ? 'Active' : 'Next up'}</span>
            <span className="material-symbols-outlined wa-text-sm" style={{ '--ms-fill': 1 }}>timer</span>
            <span className="wa-text-xs wa-font-medium">~{ACTIVE_PATHWAY.estimatedWeeks} weeks</span>
          </div>
          <h4 className="wa-text-xl wa-font-bold wa-leading-snug" style={{ marginBottom: '1.25rem' }}>{ACTIVE_PATHWAY.title}</h4>
          <p className="text-white/80 wa-text-sm" style={{ marginBottom: '1rem' }}>{ACTIVE_PATHWAY.description}</p>
          <Link
            href="/dashboard/program"
            className="wa-bg-white wa-text-[var(--color-accent)] wa-font-bold hover:wa-opacity-90 active:wa-scale-95 wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
            style={{
              width: '100%',
              padding: '0.75rem 0',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            {overallPct > 0 ? 'Continue Learning' : 'Start Learning'}
          </Link>
        </div>
      </section>
      )}

      {/* Pathway steps — synced from your pathway progress */}
      {ACTIVE_PATHWAY && (
      <section style={{ margin: '0 1.5rem 1.5rem' }}>
        <h5 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-widest wa-text-[var(--color-on-surface-variant)]" style={{ marginBottom: '1rem' }}>Pathway steps</h5>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {pathwayMilestones.slice(0, 4).map((m) => {
            const isCompleted = m.status === 'complete';
            const isActive = m.status === 'current';
            const isLocked = m.status === 'locked';
            return (
              <div
                key={m.stepIndex}
                className={`${isCompleted ? 'wa-bg-[var(--surface-container)] wa-border-l-4 wa-border-[var(--color-gold)]' : isActive ? 'wa-bg-[var(--surface-container)] wa-border-l-4 wa-border-[var(--color-accent)]' : 'wa-bg-[var(--surface-container-highest)] wa-opacity-60'}`}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '0.75rem', padding: '0.75rem 1rem', boxShadow: isCompleted || isActive ? '0 1px 2px rgba(0,0,0,0.05)' : undefined }}
              >
                <div
                  style={{
                    width: '2.25rem',
                    height: '2.25rem',
                    borderRadius: '9999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: isCompleted
                      ? 'color-mix(in srgb, var(--color-gold) 12%, transparent)'
                      : isActive
                      ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                      : 'color-mix(in srgb, var(--color-on-surface-variant) 10%, transparent)',
                  }}
                >
                  <span
                    className="material-symbols-outlined wa-text-base"
                    style={{
                      color: isCompleted ? 'var(--color-gold)' : isActive ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                      '--ms-fill': isCompleted ? 1 : 0,
                    }}
                   aria-hidden="true">
                    {isCompleted ? 'check_circle' : isLocked ? 'lock' : (MODULE_ICONS[ACTIVE_PATHWAY.category] ?? 'school')}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <StatusTag tone={isCompleted ? 'ok' : isActive ? 'warn' : 'muted'}>{m.detail}</StatusTag>
                  </div>
                  <p className="wa-text-sm wa-font-semibold wa-text-[var(--color-on-surface)] wa-truncate">{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {ACTIVE_PATHWAY && pathwayMilestones.some((m) => m.status === 'complete') && (
        <section style={{ margin: '0 1.5rem 1.5rem' }}>
          <h5 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-widest wa-text-[var(--color-on-surface-variant)]" style={{ marginBottom: '0.75rem' }}>Completed</h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pathwayMilestones
              .filter((m) => m.status === 'complete')
              .map((m) => (
              <div key={m.stepIndex} className="wa-bg-[var(--surface-container)] wa-border-l-4 wa-border-[var(--color-gold)]" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '0.75rem', padding: '0.75rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)' }}>
                  <span className="material-symbols-outlined wa-text-base" style={{ color: 'var(--color-gold)', '--ms-fill': 1 }}>
                    check_circle
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-tight wa-text-[var(--color-gold)]" style={{ marginBottom: '0.125rem' }}>Completed</p>
                  <p className="wa-text-sm wa-font-semibold wa-text-[var(--color-on-surface)] wa-truncate">{m.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>

    {/* ── Desktop view ── */}
    <div className="wa-hidden md:wa-block">
      {memberSkillsetProgress.length > 0 && (
        <section
          className="portal-card portal-card--flat"
          style={{ marginBottom: 'var(--space-8)', padding: 'var(--space-6)' }}
        >
          <SkillsetProgressList rows={memberSkillsetProgress} variant="member" />
        </section>
      )}

      <SkillMissionPanel summary={skillMissionSummary} />

      <FindYourCareerSection />

      {/* Hero card + Course Milestones sidebar */}
      {ACTIVE_PATHWAY && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        {/* Active course hero */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--surface-container-low) 0%, var(--surface-container) 100%)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8)',
            border: '1px solid var(--outline-variant)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '280px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                color: 'var(--color-accent)',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', '--ms-fill': 1 }}>play_circle</span>
              {overallPct > 0 ? 'Currently Active' : 'Ready to Start'}
            </div>
            <h2 style={{ fontSize: 'var(--font-size-h2)', fontWeight: 'var(--font-weight-bold)', lineHeight: 'var(--line-height-tight)', marginBottom: 'var(--space-2)' }}>
              {ACTIVE_PATHWAY.title}
            </h2>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)' }}>
              {ACTIVE_PATHWAY.description}
            </p>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <span>~{ACTIVE_PATHWAY.estimatedWeeks} weeks</span>
              <span>{ACTIVE_PATHWAY.steps.length} milestones</span>
              <span>{ACTIVE_PATHWAY.category}</span>
            </div>
            {/* Progress bar */}
            <div style={{ height: '8px', background: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden', maxWidth: '360px', marginBottom: 'var(--space-4)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, overallPct)}%`,
                  background: 'var(--color-accent)',
                  borderRadius: 'var(--radius-full)',
                }}
              />
            </div>
          </div>
          <div>
            <Link
              href="/dashboard/program"
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '0.75rem 1.5rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
                play_arrow
              </span>
              {overallPct > 0 ? 'Resume Learning' : 'Start Learning'}
            </Link>
          </div>
        </div>

        {/* Course Milestones sidebar (vertical timeline) */}
        <div
          style={{
            background: 'var(--surface-container)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
          }}
        >
          <h3 style={{ fontSize: 'var(--font-size-h4)', fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-6)' }}>
            Course Milestones
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pathwayMilestones.map((m, i) => {
              const status = m.status === 'complete' ? 'completed' : m.status === 'current' ? 'current' : 'locked';
              return (
                <div key={m.stepIndex} style={{ display: 'flex', gap: 'var(--space-3)', position: 'relative' }}>
                  {/* Timeline line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', flexShrink: 0 }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: status === 'completed'
                          ? 'var(--color-green)'
                          : status === 'current'
                            ? 'var(--color-accent)'
                            : 'var(--surface-container-highest)',
                        flexShrink: 0,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize: '0.875rem',
                        color: status === 'locked' ? 'var(--color-on-surface-variant)' : 'var(--color-white)',
                        '--ms-fill': 1,
                      }}>
                        {status === 'completed' ? 'check' : status === 'current' ? 'arrow_forward' : 'lock'}
                      </span>
                    </div>
                    {i < pathwayMilestones.length - 1 && (
                      <div style={{
                        width: '2px',
                        flexGrow: 1,
                        minHeight: '24px',
                        background: status === 'completed' ? 'var(--color-green)' : 'var(--surface-container-highest)',
                      }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ paddingBottom: 'var(--space-4)' }}>
                    <div style={{
                      fontWeight: status === 'current' ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                      color: status === 'locked' ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
                      opacity: status === 'locked' ? 0.5 : 1,
                      fontSize: 'var(--font-size-sm)',
                    }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {m.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Destination cards (existing component — career library, program resources) */}
      <LearningHubDestinationCards />

      {/* AI Study Assistant — inline voice coach entry point */}
      <section style={{ marginBottom: 'var(--space-8)', maxWidth: '380px' }}>
        <VoiceCoachLauncherCard
          {...readinessVoiceSurface}
          title="AI Study Assistant"
          description="Talk through your current module, prep for the next step, or ask questions about your training path."
          href="/dashboard/readiness"
          ctaLabel="Start study session"
        />
      </section>

      {/* Your learning pathway — enrolled pathway only, with real DB-backed progress */}
      {ACTIVE_PATHWAY && (
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-accent)', '--ms-fill': 1 }}>
            school
          </span>
          <h2 className="portal-section-heading" style={{ margin: 0 }}>Your Learning Pathway</h2>
        </div>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-6)' }}>
          Track and mark each step as you complete it. Progress saves to your profile.
        </p>
        <div style={{ maxWidth: '560px' }}>
          <LearningPathCard pathway={ACTIVE_PATHWAY} />
        </div>
      </section>
      )}

    </div> {/* end hidden md:block */}
    </div>    </>
  );
}
