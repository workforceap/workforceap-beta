'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Play, ArrowRight, Flame, Target } from 'lucide-react';
import Link from 'next/link';
import {
  DataTable,
  DesignSurface,
  PageOpener,
  ProgressRing,
  StatusTag,
  cx,
  toneClass,
  type Column,
  type KitTone,
} from '@/components/portal/kit';
import MemberAdvisorCard from '@/components/portal/kit/pages/member/MemberAdvisorCard';
import MemberAiToolsCard from '@/components/portal/kit/pages/member/MemberAiToolsCard';
import type { AssignedCounselor } from '@/lib/member/counselorContext';
import First90DaysCard, { type First90DaysCardProps } from '@/components/portal/First90DaysCard';
import YouthDashboardNotice from '@/components/portal/YouthDashboardNotice';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import PlacementConfirmationStrip from '@/app/(portal)/dashboard/PlacementConfirmationStrip';
import StaffViewBanner from '@/components/portal/StaffViewBanner';
import DashboardProgramSelector, { type DashboardProgramOption } from '@/components/portal/DashboardProgramSelector';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';
import { MEMBER_PROGRAM_HREF, resolveMemberProgramHref } from '@/lib/member/memberProgramHref';
import { isExcludedPublicEmployerName } from '@/lib/jobs/publicJobFilters';

/**
 * Member Portal — HOME view (program-first refresh).
 *
 * Layout, top to bottom:
 *   1. PageOpener + staff/youth/no-program notices.
 *   2. One focus card: claim title, next module, Resume module pill, progress
 *      ring (N of M). Advisor sits immediately under it.
 *   3. AI Career Tools (claim + tiles + crimson CTA).
 *   4. Offer strip and First 90 Days only when they apply.
 *   5. Claim-titled interview readiness, weekly habit, and applications.
 *
 * Removed from this page: Start here, the four stat tiles, weekly chart,
 * points ledger, next-badge card, and the duplicate Today / tools chrome.
 * Live props stay on the type so app/(portal)/dashboard/page.tsx wiring
 * does not change.
 *
 * Target route: app/(portal)/dashboard
 * Surface: warm (member-facing).
 */

type JobStageTone = Extract<KitTone, 'warn' | 'muted' | 'info'>;

interface PipelineRow {
  role: string;
  company: string;
  stage: string;
  tone: JobStageTone;
  appliedLabel?: string;
  stageIndex?: number;
  stageTotal?: number;
}

interface GoalSummary {
  title: string;
  percent: number;
}

export interface StatSpark {
  series?: number[];
  delta?: string;
  direction?: 'up' | 'down';
}

export interface WeeklyActivityPoint {
  day: string;
  minutes: number;
}

export interface PointsLedgerEntry {
  label: string;
  amount: number;
  tone?: KitTone;
  /** @deprecated Categorical fill — use `tone`. Ignored when `tone` is set. */
  color?: 'accent' | 'info' | 'gold' | 'success' | 'text' | 'muted';
}

export interface MemberHomeKitProps {
  firstName?: string;
  greeting?: string;
  coursePercent?: number;
  courseProgressStale?: boolean;
  activeJobs?: number;
  certs?: number;
  points?: number;
  programTitle?: string;
  programStatus?: string;
  noProgram?: boolean;
  nextLesson?: string;
  nextLessonDue?: string;
  nextLessonHref?: string;
  nextBadgePercent?: number;
  nextBadgeName?: string;
  nextBadgeRemaining?: string;
  pipeline?: PipelineRow[];
  programHref?: string;
  resumeHref?: string;
  toolkitHref?: string;
  jobsHref?: string;
  coursesHref?: string;
  currentStreak?: number;
  longestStreak?: number;
  goals?: GoalSummary[];
  goalsHref?: string;
  jobOffers?: Array<{ id: string; role: string; company: string }>;
  first90?: First90DaysCardProps | null;
  youthNoticeAge?: number | null;
  showStaffViewBanner?: boolean;
  programSwitch?: {
    options: DashboardProgramOption[];
    activeProgramSlug: string;
    viewingSecondary?: boolean;
    pathname?: string;
  } | null;
  doThisNext?: NextBestAction | null;
  advisor?: AssignedCounselor | null;
  upNext?: NextBestAction[];
  recommendedTool?: MemberToolRecommendation | null;
  preassessmentCompleted?: boolean;
  ungatedDigitalBasicsHref?: string | null;
  courseSpark?: StatSpark;
  activeJobsSpark?: StatSpark;
  certsSpark?: StatSpark;
  pointsSpark?: StatSpark;
  certModulesDone?: number;
  certModulesTotal?: number;
  programCoursesNote?: string | null;
  weeklyActivity?: WeeklyActivityPoint[];
  weeklyActivityDeltaLabel?: string;
  pointsThisWeek?: number;
  pointsLedger?: PointsLedgerEntry[];
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function defaultStageIndex(tone: JobStageTone): number {
  if (tone === 'warn') return 3;
  if (tone === 'info') return 2;
  return 1;
}

const LOGO_COLORS = ['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-gold)', 'var(--wa-success)', 'var(--wa-accent-dark)'];
function logoColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function pipelineCompanyDisplay(company: string): string | null {
  const trimmed = company.trim();
  if (!trimmed || isExcludedPublicEmployerName(trimmed)) return null;
  return trimmed;
}

function isInterviewAction(action: NextBestAction): boolean {
  const hay = `${action.id} ${action.href} ${action.title}`.toLowerCase();
  return hay.includes('interview') || hay.includes('readiness');
}

function resolveInterviewHref(toolkitHref: string): string {
  return toolkitHref.startsWith('/dev/member')
    ? '/dev/member/interview-practice'
    : '/dashboard/ai-tools/interview-practice';
}

const HOME_TEXT_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  fontSize: 'var(--wa-type-body)',
  fontWeight: 700,
  color: 'var(--wa-accent)',
  textDecoration: 'none',
  flexShrink: 0,
  gap: 6,
};

const CLAIM_TITLE: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 'clamp(1.15rem, 2.6vw, 1.5rem)',
  letterSpacing: '-0.02em',
  textWrap: 'balance',
  lineHeight: 1.25,
};

const UP_NEXT_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '4px 12px',
  minHeight: 44,
  padding: '10px 0',
  borderTop: '1px solid var(--wa-border)',
  textDecoration: 'none',
  color: 'inherit',
};

function PipelineStageTrack({ row }: { row: PipelineRow }) {
  const total = row.stageTotal ?? 3;
  const filled = Math.max(0, Math.min(total, row.stageIndex ?? defaultStageIndex(row.tone)));
  return (
    <div
      aria-hidden
      className={cx('wa-flex wa-items-center wa-gap-1', toneClass(row.tone))}
      style={{ width: 84 }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{ height: 5, flex: 1, borderRadius: 3, background: i < filled ? 'var(--wa-kit-tone)' : 'var(--wa-track)' }}
        />
      ))}
    </div>
  );
}

function PipelineRoleCell({ row, roleWeight = 700 }: { row: PipelineRow; roleWeight?: number }) {
  const company = pipelineCompanyDisplay(row.company);
  const markSource = company ?? row.role;
  const initial = markSource.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="wa-flex wa-items-center wa-gap-3">
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 'var(--wa-type-meta)',
          color: 'var(--wa-on-accent)',
          background: logoColorFor(markSource),
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: roleWeight, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
        {company ? (
          <div className="wa-kit-meta" style={{ fontWeight: 600, marginTop: 1 }}>{company}</div>
        ) : null}
      </div>
    </div>
  );
}

function focusClaim(
  th: ReturnType<typeof useTranslations>,
  args: { programTitle?: string; remaining: number | null },
): string {
  if (!args.programTitle) return th('focusClaimNoProgram');
  if (args.remaining === null) return th('focusClaimNoCount', { program: args.programTitle });
  if (args.remaining <= 0) return th('focusClaimDone', { program: args.programTitle });
  return th('focusClaim', { count: args.remaining, program: args.programTitle });
}

export function MemberHomeKit({
  firstName = '',
  greeting,
  coursePercent = 0,
  courseProgressStale = false,
  programTitle,
  programStatus,
  noProgram = false,
  nextLesson,
  nextLessonDue,
  nextLessonHref,
  pipeline = [],
  programHref = MEMBER_PROGRAM_HREF,
  resumeHref = MEMBER_PROGRAM_HREF,
  toolkitHref = '/dashboard/ai-tools',
  jobsHref = '/dashboard/jobs',
  currentStreak = 0,
  longestStreak = 0,
  goals = [],
  goalsHref = '/dashboard/career-brief#goals',
  jobOffers = [],
  first90 = null,
  youthNoticeAge = null,
  showStaffViewBanner = false,
  programSwitch = null,
  advisor = null,
  upNext = [],
  recommendedTool = null,
  ungatedDigitalBasicsHref = null,
  certModulesDone,
  certModulesTotal,
  programCoursesNote,
}: MemberHomeKitProps) {
  const th = useTranslations('dashboard.home');
  const te = useTranslations('empty');
  const pct = clampPct(coursePercent);
  const showProgramSwitch = Boolean(programSwitch && programSwitch.options.length > 1 && programSwitch.activeProgramSlug);
  const hasModuleRow = typeof certModulesDone === 'number' && typeof certModulesTotal === 'number' && certModulesTotal > 0;
  const remaining = hasModuleRow ? Math.max(0, (certModulesTotal as number) - (certModulesDone as number)) : null;
  const modulePct = hasModuleRow
    ? clampPct(((certModulesDone as number) / (certModulesTotal as number)) * 100)
    : pct;
  const ringTone: KitTone | undefined = modulePct >= 100 ? 'ok' : pct === 0 && programTitle && courseProgressStale ? 'warn' : undefined;
  const interviewSteps = upNext.filter(isInterviewAction);
  const claim = focusClaim(th, { programTitle, remaining });
  const openerTitle = greeting && firstName ? `${greeting}, ${firstName}` : firstName ? th('welcomeBack', { name: firstName }) : th('title');
  const openerLede = nextLesson
    ? nextLessonDue
      ? th('ledeNextDue', { lesson: nextLesson, due: nextLessonDue })
      : th('ledeNext', { lesson: nextLesson })
    : th('ledeDefault');

  const pipelineColumns: Column<PipelineRow>[] = [
    {
      key: 'role',
      header: th('pipelineRole'),
      render: (row) => <PipelineRoleCell row={row} />,
    },
    {
      key: 'status',
      header: th('pipelineStatus'),
      render: (row) => <StatusTag tone={row.tone}>{row.stage}</StatusTag>,
    },
    {
      key: 'stageTrack',
      header: th('pipelineStage'),
      render: (row) => <PipelineStageTrack row={row} />,
    },
    {
      key: 'applied',
      header: th('pipelineApplied'),
      align: 'right',
      render: (row) => (
        <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {row.appliedLabel ?? '—'}
        </span>
      ),
    },
  ];

  const pipelineCard = (row: PipelineRow) => (
    <div className="wa-kit-card wa-kit-card--sm">
      <div className="wa-flex wa-flex-col wa-items-start wa-gap-2 md:wa-flex-row md:wa-justify-between md:wa-gap-3">
        <div style={{ minWidth: 0 }}>
          <PipelineRoleCell row={row} roleWeight={800} />
        </div>
        <StatusTag tone={row.tone}>{row.stage}</StatusTag>
      </div>
      <div className="wa-flex wa-items-center wa-justify-between" style={{ marginTop: 10 }}>
        <PipelineStageTrack row={row} />
        <span className="wa-kit-meta" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {row.appliedLabel ?? '—'}
        </span>
      </div>
    </div>
  );

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker={th('kicker')}
          title={openerTitle}
          lede={openerLede}
          action={
            currentStreak > 0 ? (
              <span className="wa-kit-streak-chip">
                <Flame size={15} aria-hidden />
                <span>
                  {longestStreak > currentStreak
                    ? th('streakBest', { count: currentStreak, best: longestStreak })
                    : th('streak', { count: currentStreak })}
                </span>
              </span>
            ) : null
          }
        />

        {showStaffViewBanner ? <StaffViewBanner page="dashboard" /> : null}

        {noProgram ? (
          <div
            className="wa-kit-card wa-flex wa-items-center wa-gap-3"
            role="status"
            style={{ padding: '12px 14px' }}
          >
            <StatusTag tone="warn">{th('noProgramTag')}</StatusTag>
            <span style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}>
              {th('noProgramBody')}
            </span>
          </div>
        ) : null}

        {youthNoticeAge !== null && youthNoticeAge < 18 ? <YouthDashboardNotice age={youthNoticeAge} /> : null}

        <section className="wa-kit-card wa-kit-cert-path" aria-labelledby="member-home-focus-heading" data-testid="member-home-focus">
          {showProgramSwitch && programSwitch ? (
            <div data-testid="home-program-switch" style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              <DashboardProgramSelector
                options={programSwitch.options}
                activeProgramSlug={programSwitch.activeProgramSlug}
                pathname={programSwitch.pathname}
              />
            </div>
          ) : null}
          <div className="wa-kit-cert-path-body">
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <ProgressRing
                pct={modulePct}
                size={120}
                tone={ringTone}
                showLabel={false}
                label={hasModuleRow ? th('moduleProgressLabel', { done: certModulesDone, total: certModulesTotal }) : th('courseCompletion')}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 18,
                  letterSpacing: '-0.02em',
                  color: ringTone ? 'var(--wa-kit-tone)' : 'var(--wa-accent)',
                }}
              >
                {hasModuleRow ? th('moduleProgress', { done: certModulesDone, total: certModulesTotal }) : `${pct}%`}
              </div>
            </div>
            <div className="wa-kit-cert-path-copy">
              {programStatus ? <StatusTag tone="info">{programStatus}</StatusTag> : null}
              <h2 id="member-home-focus-heading" style={{ ...CLAIM_TITLE, marginTop: programStatus ? 8 : 0 }}>
                {claim}
              </h2>
              {nextLesson ? (
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', marginTop: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--wa-text)' }}>{th('nextModuleLabel')}: </span>
                  {nextLessonHref ? (
                    <Link
                      href={nextLessonHref}
                      className="wa-kit-focus"
                      style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2 }}
                    >
                      {nextLesson}
                    </Link>
                  ) : (
                    nextLesson
                  )}
                  {nextLessonDue ? (
                    <>
                      {' '}
                      · <span style={{ color: 'var(--wa-accent)', fontWeight: 700 }}>{nextLessonDue}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', marginTop: 8 }}>
                  {programTitle ? th('noNextModule') : th('chooseProgramHint')}
                </p>
              )}
              {programTitle && programCoursesNote ? (
                <p
                  data-testid="program-courses-note"
                  style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 6 }}
                >
                  {programCoursesNote}
                </p>
              ) : null}
              <div style={{ marginTop: 16 }} className="wa-flex wa-items-center wa-gap-4 wa-flex-wrap">
                <Link
                  href={resolveMemberProgramHref(resumeHref)}
                  className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                >
                  {programTitle ? (
                    <>
                      {th('resumeModule')} <Play size={13} aria-hidden />
                    </>
                  ) : (
                    <>
                      {th('chooseProgram')} <ArrowRight size={13} aria-hidden />
                    </>
                  )}
                </Link>
                <a
                  href={programHref}
                  className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                  style={HOME_TEXT_LINK}
                >
                  {th('openPlan')}
                </a>
              </div>
            </div>
          </div>
        </section>

        <MemberAdvisorCard advisor={advisor} />

        <MemberAiToolsCard toolkitHref={toolkitHref} recommendedTool={recommendedTool} />

        {jobOffers.length > 0 ? (
          <ErrorBoundary>
            <PlacementConfirmationStrip offers={jobOffers} variant="kit" />
          </ErrorBoundary>
        ) : null}
        {first90 ? (
          <ErrorBoundary>
            <First90DaysCard {...first90} variant="kit" />
          </ErrorBoundary>
        ) : null}

        {!programTitle && ungatedDigitalBasicsHref ? (
          <div className="wa-kit-card" style={{ display: 'grid', gap: 10 }}>
            <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {th('digitalBasicsKicker')}
            </p>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{th('digitalBasicsTitle')}</h3>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              {th('digitalBasicsBody')}
            </p>
            <Link
              href={ungatedDigitalBasicsHref}
              className="wa-kit-cta wa-kit-cta--xl wa-kit-cta--block wa-kit-focus hover:wa-opacity-90"
            >
              {th('digitalBasicsCta')}
            </Link>
          </div>
        ) : null}

        <section className="wa-kit-card" aria-labelledby="member-home-interview-heading">
          <h2 id="member-home-interview-heading" style={CLAIM_TITLE}>
            {th('interviewClaim')}
          </h2>
          {interviewSteps.length > 0 ? (
            <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 2 }} aria-label={th('interviewClaim')}>
              {interviewSteps.map((action) => (
                <li key={action.id}>
                  <Link
                    href={resolveMemberProgramHref(action.href)}
                    className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                    style={UP_NEXT_ROW}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, color: 'var(--wa-text)' }}>{action.title}</span>
                      <span style={{ display: 'block', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 2 }}>
                        {action.body}
                      </span>
                    </span>
                    <span style={{ ...HOME_TEXT_LINK, fontSize: 'var(--wa-type-meta)' }}>
                      {action.cta} <ArrowRight size={13} aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <p className="wa-kit-lede" style={{ margin: 0 }}>{th('interviewEmpty')}</p>
              <Link
                href={resolveInterviewHref(toolkitHref)}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {th('interviewCta')} <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          )}
        </section>

        <section className="wa-kit-card" aria-labelledby="member-home-habit-heading">
          <h2 id="member-home-habit-heading" style={CLAIM_TITLE}>
            {currentStreak > 0 ? th('habitClaimStreak', { count: currentStreak }) : th('habitClaim')}
          </h2>
          <p className="wa-kit-lede" style={{ margin: '10px 0 0' }}>{th('habitBody')}</p>
          <div className="wa-flex wa-items-center wa-gap-4 wa-flex-wrap" style={{ marginTop: 14 }}>
            <Link
              href={programHref}
              className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
            >
              {th('habitOpenProgram')}
            </Link>
            <a
              href={goalsHref}
              className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
              style={HOME_TEXT_LINK}
            >
              <Target size={14} aria-hidden /> {goals.length > 0 ? th('openGoals') : th('setAGoal')}
            </a>
          </div>
        </section>

        <section className="wa-kit-card" aria-labelledby="member-home-applications-heading">
          <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12, gap: 12 }}>
            <h2 id="member-home-applications-heading" style={CLAIM_TITLE}>
              {pipeline.length > 0 ? th('applicationsClaim') : th('applicationsClaimEmpty')}
            </h2>
            <a
              href={jobsHref}
              className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
              style={HOME_TEXT_LINK}
            >
              {th('openJobs')}
            </a>
          </div>
          <DataTable<PipelineRow>
            columns={pipelineColumns}
            rows={pipeline}
            rowKey={(row) => `${row.role}-${row.company}`}
            mobile="cards"
            cardRender={pipelineCard}
            minWidth={560}
            empty={{
              kind: 'first',
              title: te('activeApplications.title'),
              description: te('activeApplications.body'),
              primaryAction: { label: te('activeApplications.action'), href: jobsHref },
            }}
          />
        </section>
      </div>
    </DesignSurface>
  );
}
