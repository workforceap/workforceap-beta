'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Play, ArrowRight, Flame, Target } from 'lucide-react';
import Link from 'next/link';
import {
  DataTable,
  DesignSurface,
  KpiStrip,
  PageOpener,
  ProgressBar,
  StatusTag,
  cx,
  toneClass,
  type Column,
  type KitTone,
} from '@/components/portal/kit';
import { Avatar } from '@/components/portal/kit/Avatar';
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

export interface CurriculumItem {
  title: string;
  state: 'done' | 'active' | 'upcoming';
  grade?: string;
  due?: string;
  number?: number;
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
  curriculum?: CurriculumItem[];
  interviewWhen?: string;
  priorityBody?: string;
  estRemainingMinutes?: number;
  resumeModuleNumber?: number;
  nextCheckIn?: string;
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
  return th('focusClaimTraining', { count: args.remaining, program: args.programTitle });
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
  curriculum = [],
  interviewWhen,
  priorityBody,
  estRemainingMinutes,
  resumeModuleNumber,
  nextCheckIn,
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
  const openerKicker = firstName ? th('workspaceKicker', { name: firstName }) : th('workspaceKickerGuest');
  const interviewCount = pipeline.filter((row) => row.tone === 'warn' || /interview/i.test(row.stage)).length;
  const resumeNumber = resumeModuleNumber ?? (hasModuleRow ? (certModulesDone as number) + 1 : 8);
  const pipelineColumns: Column<PipelineRow>[] = [
    {
      key: 'role',
      header: th('pipelineRoleEmployer'),
      render: (row) => <PipelineRoleCell row={row} />,
    },
    {
      key: 'applied',
      header: th('pipelineDate'),
      render: (row) => (
        <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {row.appliedLabel ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: th('pipelineStatus'),
      render: (row) => <StatusTag tone={row.tone}>{row.stage}</StatusTag>,
    },
    {
      key: 'action',
      header: th('pipelineAction'),
      align: 'right',
      render: (row) => (
        <span className="wa-kit-meta" style={{ fontWeight: 700, color: 'var(--wa-accent)' }}>
          {row.tone === 'warn' ? th('openNotes') : row.tone === 'info' ? th('details') : th('review')}
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
      <div className="wa-dense-page wa-space-y-5">
        <PageOpener
          kicker={openerKicker}
          title={claim}
          action={
            <div className="wa-flex wa-items-center wa-gap-2 wa-flex-wrap">
              {currentStreak > 0 ? (
                <span className="wa-kit-streak-chip">
                  <Flame size={15} aria-hidden />
                  <span>
                    {longestStreak > currentStreak
                      ? th('streakBest', { count: currentStreak, best: longestStreak })
                      : th('streak', { count: currentStreak })}
                  </span>
                </span>
              ) : null}
              {advisor ? <StatusTag tone="muted">{th('advisorChip', { name: advisor.name })}</StatusTag> : null}
            </div>
          }
        />

        {showStaffViewBanner ? <StaffViewBanner page="dashboard" /> : null}

        {noProgram ? (
          <div className="wa-kit-card wa-flex wa-items-center wa-gap-3" role="status" style={{ padding: '12px 14px' }}>
            <StatusTag tone="warn">{th('noProgramTag')}</StatusTag>
            <span style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}>{th('noProgramBody')}</span>
          </div>
        ) : null}

        {youthNoticeAge !== null && youthNoticeAge < 18 ? <YouthDashboardNotice age={youthNoticeAge} /> : null}

        <div className="wa-kit-card">
          <KpiStrip
            items={[
              {
                label: programTitle ? programTitle : th('kpiProgramGeneric'),
                value: hasModuleRow ? th('kpiModulesOf', { done: certModulesDone, total: certModulesTotal }) : `${pct}%`,
                delta: hasModuleRow ? `${modulePct}%` : undefined,
                deltaTone: 'muted',
              },
              {
                label: th('kpiNextDue'),
                value: nextLesson ?? th('noNextModule'),
                delta: nextLessonDue ?? undefined,
                tone: nextLessonDue ? 'warn' : undefined,
                deltaTone: nextLessonDue ? 'warn' : 'muted',
              },
              {
                label: th('kpiApplications'),
                value: th('kpiActiveCount', { count: pipeline.length }),
                delta: interviewCount > 0 ? th('kpiInterviewCount', { count: interviewCount }) : undefined,
                deltaTone: interviewCount > 0 ? 'info' : 'muted',
              },
              {
                label: th('kpiInterviewPrep'),
                value: interviewWhen ?? (interviewSteps[0]?.title ?? th('interviewCta')),
                delta: interviewWhen ? undefined : undefined,
                tone: interviewWhen ? 'info' : undefined,
              },
            ]}
          />
        </div>

        <div className="wa-dense-grid wa-dense-grid--2">
          <div className="wa-space-y-5">
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
              <div className="wa-flex wa-items-center wa-justify-between wa-gap-3 wa-flex-wrap">
                <h2 id="member-home-focus-heading" className="wa-kit-meta" style={{ margin: 0, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {th('currentPriority')}
                </h2>
                {programStatus ? <StatusTag tone="info">{programStatus}</StatusTag> : null}
              </div>
              {nextLesson ? (
                <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 800, margin: '12px 0 0', letterSpacing: '-0.02em' }}>
                  {nextLessonHref ? (
                    <Link href={nextLessonHref} className="wa-kit-focus" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      {nextLesson}
                    </Link>
                  ) : (
                    nextLesson
                  )}
                  {nextLessonDue ? (
                    <>
                      {' '}
                      · <span style={{ color: 'var(--wa-gold-dark)', fontWeight: 700 }}>{nextLessonDue}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', marginTop: 12 }}>
                  {programTitle ? th('noNextModule') : th('chooseProgramHint')}
                </p>
              )}
              {priorityBody ? <p className="wa-kit-lede" style={{ marginTop: 8 }}>{priorityBody}</p> : null}
              {programTitle && programCoursesNote ? (
                <p data-testid="program-courses-note" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 6 }}>
                  {programCoursesNote}
                </p>
              ) : null}
              <div style={{ marginTop: 14 }}>
                <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{th('overallTrack')}</p>
                <ProgressBar
                  pct={modulePct}
                  tone={ringTone}
                  aria-label={hasModuleRow ? th('moduleProgressLabel', { done: certModulesDone, total: certModulesTotal }) : th('courseCompletion')}
                />
                <div className="wa-flex wa-items-center wa-justify-between" style={{ marginTop: 6 }}>
                  <span className="wa-kit-meta">{estRemainingMinutes ? th('minutesRemaining', { minutes: estRemainingMinutes }) : null}</span>
                  {nextLessonDue ? <span className="wa-kit-meta" style={{ color: 'var(--wa-gold-dark)', fontWeight: 700 }}>{nextLessonDue}</span> : null}
                </div>
              </div>
              <div style={{ marginTop: 16 }} className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap">
                <Link
                  href={resolveMemberProgramHref(resumeHref)}
                  className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                >
                  {programTitle ? (
                    <>
                      {th('resumeModuleN', { n: resumeNumber })} <Play size={13} aria-hidden />
                    </>
                  ) : (
                    <>
                      {th('chooseProgram')} <ArrowRight size={13} aria-hidden />
                    </>
                  )}
                </Link>
                <a href={programHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>
                  {th('viewSyllabus')}
                </a>
                <a href={programHref} className="wa-kit-focus" style={HOME_TEXT_LINK}>{th('openPlan')}</a>
              </div>
            </section>

            {curriculum.length > 0 ? (
              <section className="wa-kit-card" aria-labelledby="member-home-curriculum-heading">
                <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
                  <h2 id="member-home-curriculum-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{th('curriculumStatus')}</h2>
                  <span className="wa-kit-meta">{th('modulesTotal', { count: certModulesTotal ?? curriculum.length })}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {curriculum.map((item) => {
                    const tone: KitTone = item.state === 'done' ? 'ok' : item.state === 'active' ? 'warn' : 'muted';
                    const label = item.state === 'done' ? th('curriculumDone') : item.state === 'active' ? th('curriculumActive') : th('curriculumUpcoming');
                    return (
                      <li key={item.title} className={cx('wa-kit-card wa-kit-card--sm', toneClass(tone))} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div>
                          <strong style={{ display: 'block' }}>{item.number ? `${th('moduleLabel', { n: item.number })}: ${item.title}` : item.title}</strong>
                          <span className="wa-kit-meta">{item.grade ?? item.due ?? ''}</span>
                        </div>
                        <StatusTag tone={tone}>{label}</StatusTag>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="wa-space-y-5">
            <section className="wa-kit-card" aria-labelledby="member-home-applications-heading">
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12, gap: 12 }}>
                <div>
                  <h2 id="member-home-applications-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{th('pipelineTitle')}</h2>
                  <p className="wa-kit-meta" style={{ margin: '4px 0 0' }}>{th('pipelineSubtitle')}</p>
                </div>
                <a href={jobsHref} className="wa-kit-focus" style={HOME_TEXT_LINK}>{th('viewAll')}</a>
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

            <section className="wa-kit-card" aria-labelledby="member-home-support-heading">
              <h2 id="member-home-support-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{th('dedicatedSupport')}</h2>
              {advisor ? (
                <div className="wa-flex wa-items-center wa-gap-3" style={{ marginTop: 12 }} data-testid="member-advisor-card">
                  <Avatar initials={advisor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '?'} size={44} src={advisor.avatar ?? undefined} />
                  <p style={{ margin: 0, fontWeight: 800 }}>{advisor.name}</p>
                </div>
              ) : null}
              {nextCheckIn ? <p className="wa-kit-lede" style={{ marginTop: 8 }}>{th('nextCheckIn', { when: nextCheckIn })}</p> : null}
              {advisor ? <p className="wa-kit-meta">{th('replyTime')}</p> : null}
              <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 12 }}>
                {advisor ? (
                  <Link href={advisor.messagingHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
                    {th('messageAdvisor', { name: advisor.firstName })}
                  </Link>
                ) : null}
                <a href={advisor?.messagingHref ?? '/dashboard/messages'} className="wa-kit-cta wa-kit-focus" style={{ textDecoration: 'none' }}>
                  {th('bookCheckIn')}
                </a>
                <a href={goalsHref} className="wa-kit-focus" style={HOME_TEXT_LINK}>
                  <Target size={14} aria-hidden /> {goals.length > 0 ? th('openGoals') : th('setAGoal')}
                </a>
              </div>
            </section>
          </div>
        </div>
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
            <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{th('digitalBasicsKicker')}</p>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{th('digitalBasicsTitle')}</h3>
            <p className="wa-kit-lede" style={{ margin: 0 }}>{th('digitalBasicsBody')}</p>
            <Link href={ungatedDigitalBasicsHref} className="wa-kit-cta wa-kit-cta--xl wa-kit-cta--block wa-kit-focus hover:wa-opacity-90">
              {th('digitalBasicsCta')}
            </Link>
          </div>
        ) : null}

        <section className="wa-kit-card" aria-labelledby="member-home-interview-heading">
          <h2 id="member-home-interview-heading" style={CLAIM_TITLE}>{th('interviewClaim')}</h2>
          {interviewSteps.length > 0 ? (
            <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 2 }} aria-label={th('interviewClaim')}>
              {interviewSteps.map((action) => (
                <li key={action.id}>
                  <Link href={resolveMemberProgramHref(action.href)} className="wa-kit-focus" style={UP_NEXT_ROW}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700 }}>{action.title}</span>
                      <span className="wa-kit-meta">{action.body}</span>
                    </span>
                    <span style={{ ...HOME_TEXT_LINK, fontSize: 'var(--wa-type-meta)' }}>
                      {action.cta} <ArrowRight size={13} aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ marginTop: 12 }}>
              <p className="wa-kit-lede" style={{ margin: 0 }}>{th('interviewEmpty')}</p>
              <Link href={resolveInterviewHref(toolkitHref)} className="wa-kit-focus" style={{ ...HOME_TEXT_LINK, marginTop: 8 }}>
                {th('interviewCta')} <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          )}
        </section>
      </div>
    </DesignSurface>
  );
}
