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
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  ClipboardList,
  Compass,
  FileText,
  GraduationCap,
  ListChecks,
  Radar,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { DesignSurface, PageOpener, StatSparkTile, colorVar, type KitTone } from '@/components/portal/kit';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import GoalsModule from '@/components/portal/GoalsModule';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

const GOALS_HEADING_ID = 'career-brief-goals-heading';
const NEXT_ACTION_HEADING_ID = 'career-brief-next-action-heading';
const PROGRAM_HEADING_ID = 'career-brief-program-heading';
const TOOLS_HEADING_ID = 'career-brief-tools-heading';

const ACCENT = colorVar('accent');
const TILE_LINK = 'wa-block wa-no-underline wa-kit-focus hover:wa-opacity-90';
const CTA = 'wa-kit-cta wa-kit-focus hover:wa-opacity-90';
const GHOST_CTA = `${CTA} wa-kit-cta--ghost`;

/** Section title: Lucide icon + h2, the same treatment as the goals module heading. */
function SectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: string }) {
  return (
    <div className="wa-flex wa-items-center" style={{ gap: '0.5rem', marginBottom: '0.875rem' }}>
      <Icon size={20} aria-hidden="true" style={{ color: ACCENT, flexShrink: 0 }} />
      <h2 id={id} style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 800, color: 'var(--wa-text)' }}>
        {children}
      </h2>
    </div>
  );
}

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
  const [t, tNav] = await Promise.all([getTranslations('dashboard'), getTranslations('nav')]);
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

  // ── Resume and placement are states, so they carry a KitTone; the other
  // tiles are plain counts (KIT_GUIDE §4: numbers stay neutral).
  const resumeTone: KitTone = resumeStatus === 'enhanced' ? 'ok' : resumeStatus === 'uploaded' ? 'warn' : 'alert';

  const metricTiles: Array<{ href?: string; icon: LucideIcon; label: string; value: string | number; caption: string; tone?: KitTone }> = [
    {
      href: '/dashboard/learning',
      icon: GraduationCap,
      label: t('trainingProgress') ?? 'Training Progress',
      value: `${trainingProgress.pct}%`,
      caption: t('coursesComplete', {
        completed: trainingProgress.completedCount,
        total: trainingProgress.totalCourses,
        plural: trainingProgress.totalCourses === 1 ? '' : 's',
      }),
    },
    {
      href: '/dashboard/ai-tools/skill-mapper',
      icon: Radar,
      label: t('skillsScore') ?? 'Skills Score',
      value: assessmentScorePct !== null ? `${assessmentScorePct}%` : '—',
      caption: t('skillMapperLink') ?? 'Skill Mapper',
    },
    {
      href: '/dashboard/ai-tools/resume-studio?view=rewrite',
      icon: FileText,
      label: t('resumeStatus') ?? 'Resume Status',
      value:
        resumeStatus === 'enhanced'
          ? (t('enhanced') ?? 'Enhanced')
          : resumeStatus === 'uploaded'
            ? (t('uploaded') ?? 'Uploaded')
            : (t('missing') ?? 'Missing'),
      caption:
        resumeStatus === 'missing'
          ? (t('uploadResumeHint') ?? 'Upload to get started')
          : resumeStatus === 'uploaded'
            ? (t('enhanceResumeHint') ?? 'Enhance with AI')
            : (t('resumeReadyHint') ?? 'Ready for applications'),
      tone: resumeTone,
    },
    {
      href: '/dashboard/jobs',
      icon: Sparkles,
      label: t('jobMatches') ?? 'Job Matches',
      value: jobMatchCount,
      caption: t('aiMatchedRoles') ?? 'AI-matched roles',
    },
    {
      href: '/dashboard/job-applications',
      icon: Briefcase,
      label: t('applications') ?? 'Applications',
      value: applicationCount,
      caption: t('trackedApplications') ?? 'Tracked applications',
    },
    isPlaced
      ? {
          icon: BadgeCheck,
          label: t('placementStatus') ?? 'Placement Status',
          value: t('placed') ?? 'Placed',
          caption: [
            placementRecord?.employerName ?? '',
            placementRecord?.salaryOffered ? `$${placementRecord.salaryOffered.toLocaleString()}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          tone: 'ok',
        }
      : {
          icon: Briefcase,
          label: t('placementStatus') ?? 'Placement Status',
          value: t('open') ?? 'Open',
          caption: t('notPlacedYet') ?? 'Not placed yet',
        },
  ];

  const quickLinks: Array<{ label: string; href: string; icon: LucideIcon }> = [
    { label: t('careerToolkit') ?? 'AI Career Tools', href: '/dashboard/ai-tools', icon: Sparkles },
    { label: t('skillMapper') ?? 'Skill Mapper', href: '/dashboard/ai-tools/skill-mapper', icon: Radar },
    { label: t('uploadResume') ?? 'Upload Resume', href: '/dashboard/ai-tools/resume-studio?view=rewrite', icon: FileText },
    { label: t('jobBoard') ?? 'Job board', href: '/dashboard/jobs', icon: Briefcase },
    { label: t('readinessChecklist') ?? 'Readiness Checklist', href: '/dashboard/readiness', icon: ListChecks },
  ];

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        {readOnlyAudit && (
          <span hidden data-portal-audit-suppressed="member-state-cache-and-resume-storage" />
        )}
        <PageOpener
          kicker={tNav('careerPlan') ?? 'My career plan'}
          title={t('careerBrief') ?? 'Career Brief'}
          lede={t('careerBriefSubtitle') ?? 'Your career readiness at a glance.'}
          icon={<ClipboardList size={13} aria-hidden="true" />}
        />

        {/* ── Metric tiles ── */}
        <div className="wa-grid wa-grid-cols-2 md:wa-grid-cols-3 wa-gap-3" data-career-brief-metrics>
          {metricTiles.map((tile) => {
            const Icon = tile.icon;
            const card = (
              <StatSparkTile
                icon={<Icon size={16} aria-hidden="true" />}
                label={tile.label}
                value={tile.value}
                caption={tile.caption || undefined}
                tone={tile.tone}
              />
            );
            return tile.href ? (
              <Link key={tile.label} href={tile.href} className={TILE_LINK}>
                {card}
              </Link>
            ) : (
              <div key={tile.label}>{card}</div>
            );
          })}
        </div>

        {/* ── Next best action ── */}
        {dominantNextAction && (
          <section aria-labelledby={NEXT_ACTION_HEADING_ID}>
            <SectionTitle id={NEXT_ACTION_HEADING_ID} icon={Compass}>
              {t('nextBestAction') ?? 'Next Best Action'}
            </SectionTitle>
            <ul className="wa-kit-toolkit-list">
              <li>
                <Link href={dominantNextAction.ctaHref ?? '/dashboard'} className="wa-kit-toolkit-row wa-kit-focus">
                  <span className="wa-kit-toolkit-row__icon" aria-hidden="true">
                    {/* Persisted actions store a historical Material Symbols name. */}
                    <LegacyGlyph name={dominantNextAction.icon ?? 'arrow_forward'} size={18} />
                  </span>
                  <span className="wa-kit-toolkit-row__body">
                    <span className="wa-kit-toolkit-row__title">{dominantNextAction.title}</span>
                    {dominantNextAction.description && (
                      <span className="wa-kit-toolkit-row__meta" style={{ whiteSpace: 'normal' }}>
                        {dominantNextAction.description}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" className="wa-kit-toolkit-row__chevron" />
                </Link>
              </li>
            </ul>
          </section>
        )}

        {/* ── Goals ── the one place a member creates and works through goals
            (WAP-188: moved here from the legacy home's Learning tab). Readiness
            "Set goals", the weekly recap and the help assistant link to #goals. */}
        <section id="goals" aria-labelledby={GOALS_HEADING_ID}>
          <ErrorBoundary>
            <GoalsModule headingLevel={2} headingId={GOALS_HEADING_ID} />
          </ErrorBoundary>
        </section>

        {/* ── Program context ── */}
        {program && (
          <section aria-labelledby={PROGRAM_HEADING_ID} className="wa-kit-card">
            <SectionTitle id={PROGRAM_HEADING_ID} icon={GraduationCap}>
              {t('activeProgram') ?? 'Active Program'}
            </SectionTitle>
            <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>
              {program.title}
            </p>
            <div className="wa-flex wa-flex-wrap" style={{ marginTop: '0.875rem', gap: '0.5rem' }}>
              <Link href="/dashboard/learning" className={CTA}>
                {t('continueTraining') ?? 'Continue Training'}
              </Link>
              <Link href="/dashboard/program" className={GHOST_CTA}>
                {t('programDetails') ?? 'Program Details'}
              </Link>
            </div>
          </section>
        )}

        {/* ── Quick links ── */}
        <section aria-labelledby={TOOLS_HEADING_ID}>
          <SectionTitle id={TOOLS_HEADING_ID} icon={Wrench}>
            {t('careerToolkit') ?? 'AI Career Tools'}
          </SectionTitle>
          <div className="wa-flex wa-flex-wrap" style={{ gap: '0.5rem' }}>
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} className={GHOST_CTA}>
                  <Icon size={18} aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </DesignSurface>
  );
}
