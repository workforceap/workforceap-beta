'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Medal, GraduationCap, ArrowRight, Briefcase, Check, Star, Target, TrendingUp, Wand2 } from 'lucide-react';
import Link from 'next/link';
import {
  DesignSurface,
  PageOpener,
  ProgressRing,
  StatusTag,
  cx,
  toneClass,
  type KitColor,
  type KitTone,
} from '@/components/portal/kit';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import { MemberTaskLinkRow, WhatNext } from './MemberTaskRow';
import MemberAdvisorCard from '@/components/portal/kit/pages/member/MemberAdvisorCard';
import MemberHandoffSummary from './MemberHandoffSummary';
import type { MemberHandoffEvidence } from '@/lib/member/loadMemberDashboardHome';
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
import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import type { PipelineRow } from './MemberPipelineTable';
import styles from './MemberHomeKit.module.css';

// The pipeline row shape moved with its table (MemberPipelineTable). Re-exported
// so `import type { PipelineRow } from '.../MemberHomeKit'` keeps working.
export type { PipelineRow } from './MemberPipelineTable';

/**
 * Member Portal HOME view: "This week" (C3).
 *
 * Built on the portal design kit (warm surface + --wa-* tokens + wa-kit-*
 * classes + lucide icons). Layout, top to bottom:
 *   1. Header: greeting + ONE contextual sentence (today's date and the next
 *      lesson), with the approval strip at the right on desktop
 *      (`approvalSlot`, rendered through PageOpener `aside`) and stacked below
 *      on phone. Under it, only when they apply: the staff-view notice
 *      (`showStaffViewBanner`), the no-program notice, and the youth notice for
 *      a member under 18 (`youthNoticeAge`).
 *   2. Two columns from 1100px (main about 2/3, right rail 352px); one column
 *      on phone with the rail after the main flow.
 *      Main:
 *        a. ONE "This week" card of ordered task rows (`.wa-kit-task-row`).
 *           Row 1 is today's next-best action (`doThisNext`: its title, one
 *           subline, its CTA as the row action). Then, only when they apply:
 *           the job-offer confirmation for OFFER applications (`jobOffers`,
 *           Yes / Not yet inline), the First 90 Days check-in (`first90`), the
 *           WIOA preassessment while it is not on file (`preassessmentCompleted`
 *           false, and not already the next action), the remaining
 *           next-best-actions (`upNext`) and the stage-specific tool pick
 *           (`recommendedTool`). Long explanations sit under "What happens next".
 *        b. The certification path with segmented module progress (with more
 *           than one enrollment it carries the view-only program switch,
 *           `programSwitch`, which reloads `/dashboard?program=<slug>` and never
 *           changes an enrollment).
 *        c. One quiet row of links: Progress, Points, Jobs, AI Career Tools,
 *           Learning hub.
 *      Rail: the assigned counselor (`advisor`), study this week (minutes, and
 *      the share of `weeklyStudyGoalMinutes` when a goal is passed) and the
 *      next badge with goals folded in.
 *
 * What left Home, and where it lives now: the points total, the streak and
 * the recent-points ledger are on the signed-in Points page (`pointsHref`,
 * `/dashboard/points`); the application pipeline is on Jobs (`jobsHref`,
 * `/dashboard/jobs`, which already lists the member's applications; Home keeps
 * a "Jobs" link to it); course and certificate totals are
 * on Progress (`progressHref`) when that route passes them. `MemberPipelineTable`
 * renders the pipeline for the pages that own it. The "Start here" tile pair
 * became a row (WIOA preassessment) and a link (AI Career Tools).
 *
 * Props the home no longer renders are still accepted so other routes and the
 * live loader can keep passing them: `activeJobs`, `certs`, `points`,
 * `pipeline`, `jobsHref`, `currentStreak`, `longestStreak`, `pointsThisWeek`,
 * `pointsLedger`, `courseSpark`, `activeJobsSpark`, `certsSpark`, `pointsSpark`.
 * They are ignored here.
 *
 * Target route: app/(portal)/dashboard
 * Surface: warm (member-facing).
 */

interface GoalSummary {
  title: string;
  /** 0–100 completion. */
  percent: number;
}

/**
 * Tiny inline sparkline + delta chip for a stat tile. Omit any field to hide
 * that piece. Structurally the kit's `SparkStat` (components/portal/kit/
 * CommandCenter.tsx). The home no longer renders the tiles; the type stays
 * exported for the pages that do (Progress).
 */
export interface StatSpark {
  /** Sparkline series (2+ points, auto-scaled). Omit/short and the tile shows the muted `dashboard.noTrendYet` slot instead (TrendPlaceholder), not a blank. */
  series?: number[];
  /** Delta chip text, e.g. "4%" or "85". Omit to hide the chip entirely. */
  delta?: string;
  /** Chip arrow + tone. Defaults to 'up'. */
  direction?: 'up' | 'down';
}

/** One day of the weekly study-activity chart. */
export interface WeeklyActivityPoint {
  day: string;
  minutes: number;
}

/** One recent point-earning event in the points ledger. */
export interface PointsLedgerEntry {
  label: string;
  amount: number;
  /**
   * Semantic state of the entry; paints the dot through the tone hook, the
   * same contract `RankDatum` takes. Omit for a plain accent dot.
   *
   * Note that the live member home does NOT set this, and should not: today's
   * dot colour comes from `pointsLedgerColor()`, which sorts an event into
   * job / study / other. That is a category, not a state — "you applied for a
   * job" is not `ok` and "you studied today" is not `warn` — so those callers
   * stay on `color` until someone decides what, if anything, a points entry
   * could be in a good or bad state about.
   */
  tone?: KitTone;
  /** @deprecated Categorical fill — use `tone`. Ignored when `tone` is set. */
  color?: KitColor;
}

export interface MemberHomeKitProps {
  firstName?: string;
  /** Optional time-of-day phrase. Omit on live — title is the member's name. */
  greeting?: string;
  /** 0–100 course completion. */
  coursePercent?: number;
  /**
   * Training has been quiet past the shared staleness threshold
   * (`STALE_TRAINING_ACTIVITY_DAYS`, 14 days), or the stale-training cron has
   * already flagged it. Accepted for callers that still pass it; the home no
   * longer paints a Course tile.
   */
  courseProgressStale?: boolean;
  /** Not rendered on Home (Progress shows it). Accepted and ignored. */
  activeJobs?: number;
  /** Not rendered on Home (Progress shows it). Accepted and ignored. */
  certs?: number;
  /** Not rendered on Home (Progress shows it). Accepted and ignored. */
  points?: number;
  programTitle?: string;
  programStatus?: string;
  /** Coursera progress is saved, but staff has not assigned a WAP program. */
  noProgram?: boolean;
  nextLesson?: string;
  nextLessonDue?: string;
  /** Deep link for `nextLesson` when it names a program module; the cert-path card links the title. */
  nextLessonHref?: string;
  /** Next badge progress (0–100). */
  nextBadgePercent?: number;
  nextBadgeName?: string;
  nextBadgeRemaining?: string;
  /** Not rendered on Home (Jobs and Progress show the pipeline). Accepted and ignored. */
  pipeline?: PipelineRow[];
  programHref?: string;
  resumeHref?: string;
  toolkitHref?: string;
  /** Where the "Jobs" link goes: the Job board (`/dashboard/jobs`), which lists the member's applications (the pipeline that left Home). */
  jobsHref?: string;
  coursesHref?: string;
  /** Where the "Progress" link goes: the readiness page (`/dashboard/readiness`, the rail's "My progress"). */
  progressHref?: string;
  /** Where the "Points" link goes: the signed-in points page (total, level, streak and the recent-points ledger). */
  pointsHref?: string;
  /** Where the WIOA preassessment row goes. */
  preassessmentHref?: string;
  /** Not rendered on Home (Progress shows the streak). Accepted and ignored. */
  currentStreak?: number;
  /** Not rendered on Home. Accepted and ignored. */
  longestStreak?: number;
  /** Up to a few active goals, folded into the Next Badge tile. */
  goals?: GoalSummary[];
  /** Where "Open goals" / "Set a goal" go: the goals section of the career brief (kit page, not `?ui=legacy`). */
  goalsHref?: string;
  /**
   * OFFER applications for the placement confirmation row — the one
   * member-initiated path to a (member-reported) placement record. Empty
   * renders nothing.
   */
  jobOffers?: Array<{ id: string; role: string; company: string }>;
  /** First 90 Days check-in props while a placement is inside its window. `null` renders nothing. */
  first90?: First90DaysCardProps | null;
  /** The member's age when under 18 (from `profile.dob`); shows the youth notice. `null` renders nothing. */
  youthNoticeAge?: number | null;
  /**
   * The viewer is staff (`canBypassMemberAssessment`) looking at a member
   * home: shows `StaffViewBanner`, as the legacy home and My Program do.
   */
  showStaffViewBanner?: boolean;
  /**
   * View-only enrolled-program switch (`DashboardProgramSelector`) for a
   * member with more than one enrollment. `null` or a single option renders
   * nothing. `viewingSecondary` marks a non-primary enrollment on screen; its
   * program links carry `?program=` into My Program (WAP-196).
   */
  programSwitch?: {
    options: DashboardProgramOption[];
    activeProgramSlug: string;
    viewingSecondary?: boolean;
    /** Page the switch reloads with `?program=`; defaults to `/dashboard` (the dev showcase passes its own). */
    pathname?: string;
  } | null;
  /** Prevents preview fixtures from sending telemetry or invoking member mutations. */
  previewOnly?: boolean;
  /** Today's next-best action: row 1 of "This week". `null`/omitted renders no such row. */
  doThisNext?: NextBestAction | null;
  /** Loader-confirmed resume, consultation, and training handoff evidence. */
  handoff?: MemberHandoffEvidence;
  /** Preview/live continuation route for the resume workspace. */
  resumeStudioHref?: string;
  resumeReturnAction?: ReactNode;
  resumeDraftOwnerToken?: string;
  /** Active assigned counselor (resolveAssignedCounselor). Null hides the advisor card. */
  advisor?: AssignedCounselor | null;
  /** The steps after `doThisNext`, most important first. Each is a row of "This week". */
  upNext?: NextBestAction[];
  /** Optional stage-specific tool pick; renders as the last row of "This week". */
  recommendedTool?: MemberToolRecommendation | null;
  /** True once the WIOA preassessment is on file; the preassessment row then does not appear. */
  preassessmentCompleted?: boolean;
  /** Ungated Digital Literacy lesson 1. Shown when the member has no enrolled program. */
  ungatedDigitalBasicsHref?: string | null;
  /** Not rendered on Home. Accepted and ignored. */
  courseSpark?: StatSpark;
  /** Not rendered on Home. Accepted and ignored. */
  activeJobsSpark?: StatSpark;
  /** Not rendered on Home. Accepted and ignored. */
  certsSpark?: StatSpark;
  /** Not rendered on Home. Accepted and ignored. */
  pointsSpark?: StatSpark;
  /** Modules completed toward the active certification — pairs with `certModulesTotal` to show the module-dot row. Omit either to hide the row. */
  certModulesDone?: number;
  /** Total modules in the active certification. */
  certModulesTotal?: number;
  /**
   * Plain line under the module row naming the WorkforceAP lab inside the
   * module count, so nobody wonders why Coursera's path covers one fewer.
   * Shown under a "What the module count includes" disclosure.
   */
  programCoursesNote?: string | null;
  /** Daily study-minutes series for the weekly activity chart. Omit/short (<2 points) shows a placeholder instead of an empty chart. */
  weeklyActivity?: WeeklyActivityPoint[];
  /** Caption next to the weekly-activity legend, e.g. "+41% vs last week". Omit to hide. */
  weeklyActivityDeltaLabel?: string;
  /**
   * The member's weekly study goal in minutes. Only passed when the member has
   * set one; the Study card then reads "4h 8m of your 4h goal" with a bar.
   * Omit it and the card shows the total alone.
   */
  weeklyStudyGoalMinutes?: number;
  /** Points earned this week. Not rendered on Home (Progress shows points). Accepted and ignored, except as a hint that activity exists when no study minutes are tracked. */
  pointsThisWeek?: number;
  /** Recent point-earning events. Not rendered on Home (Progress shows the ledger). Accepted and ignored. */
  pointsLedger?: PointsLedgerEntry[];
  /**
   * Compact approval status for the header (`MemberApprovalStatusCard`'s strip).
   * Rendered at the right of the greeting on desktop and under it on phone.
   * Omit to render no status element.
   */
  approvalSlot?: ReactNode;
}

/* ---------------------------------------------------------------------- */
/* Small pure helpers                                                      */
/* ---------------------------------------------------------------------- */

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Segmented progress bar. Takes a `tone` (#2434's `StageTrack` contract) and
 * paints the filled segments from `--wa-kit-tone`; untoned it falls back to
 * the brand accent, so no categorical hue is named inline.
 */
function SegmentedProgress({
  pct,
  segments,
  tone,
  label,
}: {
  pct: number;
  segments: number;
  /** Semantic state of the filled segments; omit for the accent bar. */
  tone?: KitTone;
  label: string;
}) {
  const clamped = clampPct(pct);
  const filled = Math.round((clamped / 100) * segments);
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx('wa-flex wa-items-center wa-gap-1', toneClass(tone))}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: i < filled ? 'var(--wa-kit-tone, var(--wa-accent))' : 'var(--wa-track)',
          }}
        />
      ))}
    </div>
  );
}

/** "3h 25m" / "42 min" for the study-this-week total. */
function formatStudyMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const DAY_LONG: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

/** Today's date for the header sentence. Read after mount so server and client markup agree. */
function useTodayLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLabel(new Intl.DateTimeFormat('en-US', { timeZone: PORTAL_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()));
    } catch {
      setLabel(null);
    }
  }, []);
  return label;
}

/** The path of an href without its query or hash, for matching an action to a known page. */
function hrefPath(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

/** True when this action already sends the member to the WIOA preassessment. */
function isPreassessmentAction(action: NextBestAction | null | undefined): boolean {
  if (!action) return false;
  return action.id === 'skills_assessment' || /\/assessment$/.test(hrefPath(action.href));
}

/* ---------------------------------------------------------------------- */
/* Main component                                                          */
/* ---------------------------------------------------------------------- */

export function MemberHomeKit({
  firstName = '',
  greeting,
  coursePercent = 0,
  programTitle,
  programStatus,
  noProgram = false,
  nextLesson,
  nextLessonDue,
  nextLessonHref,
  nextBadgePercent = 0,
  nextBadgeName,
  nextBadgeRemaining,
  programHref = MEMBER_PROGRAM_HREF,
  resumeHref = MEMBER_PROGRAM_HREF,
  toolkitHref = '/dashboard/ai-tools',
  jobsHref = '/dashboard/jobs',
  coursesHref = '/dashboard/learning',
  progressHref = '/dashboard/readiness',
  pointsHref = '/dashboard/points',
  preassessmentHref = '/dashboard/assessment',
  goals = [],
  goalsHref = '/dashboard/career-brief#goals',
  jobOffers = [],
  first90 = null,
  youthNoticeAge = null,
  showStaffViewBanner = false,
  programSwitch = null,
  previewOnly = false,
  doThisNext = null,
  handoff,
  resumeStudioHref = '/dashboard/resume',
  resumeReturnAction,
  resumeDraftOwnerToken,
  advisor = null,
  upNext = [],
  recommendedTool = null,
  preassessmentCompleted = false,
  ungatedDigitalBasicsHref = null,
  certModulesDone,
  certModulesTotal,
  programCoursesNote,
  weeklyActivity = [],
  weeklyActivityDeltaLabel,
  weeklyStudyGoalMinutes,
  pointsThisWeek,
  approvalSlot = null,
}: MemberHomeKitProps) {
  const t = useTranslations('dashboard');
  const tTools = useTranslations('aiToolsDiscovery');
  const tDisclosure = useTranslations('common.disclosures');
  const pct = clampPct(coursePercent);
  const today = useTodayLabel();

  const showProgramSwitch = Boolean(programSwitch && programSwitch.options.length > 1 && programSwitch.activeProgramSlug);
  const hasModuleRow = typeof certModulesDone === 'number' && typeof certModulesTotal === 'number' && certModulesTotal > 0;
  const moduleDone = hasModuleRow ? Math.max(0, Math.min(certModulesTotal as number, certModulesDone as number)) : 0;
  const moduleTotal = hasModuleRow ? (certModulesTotal as number) : 0;
  const segmentsCompact = moduleTotal > 8;

  const studyMinutes = weeklyActivity.reduce((sum, d) => sum + d.minutes, 0);
  const hasStudyWeek = weeklyActivity.length > 1;
  const studyGoal = typeof weeklyStudyGoalMinutes === 'number' && weeklyStudyGoalMinutes > 0 ? weeklyStudyGoalMinutes : null;

  const nextSentence = nextLesson
    ? `Next: ${nextLesson}${nextLessonDue ? ` · ${nextLessonDue}` : ''}`
    : 'Pick up your program, jobs, or AI Career Tools.';

  const hasNotices = showStaffViewBanner || noProgram || (youthNoticeAge !== null && youthNoticeAge < 18);

  // ── This week: which rows apply, and which one is "current" ──
  // Keep the pending preassessment visible even when it is lower in the
  // recommendation list. Today already covers it when it is today's action.
  const showPreassessment = !preassessmentCompleted && !isPreassessmentAction(doThisNext);
  const remainingUpNext = upNext.filter((action) => !isPreassessmentAction(action));
  const rowKeys: string[] = [
    ...(doThisNext ? ['today'] : []),
    ...(jobOffers.length > 0 ? ['offer'] : []),
    ...(first90 ? ['first90'] : []),
    ...(showPreassessment ? ['preassessment'] : []),
    ...remainingUpNext.map((action) => `up-${action.id}`),
    ...(recommendedTool ? ['tool'] : []),
  ];
  const currentKey = rowKeys[0];
  const rowStateFor = (key: string): 'current' | 'todo' => (key === currentKey ? 'current' : 'todo');
  const stepCount = rowKeys.length - (jobOffers.length > 0 ? 1 : 0) + jobOffers.length;

  return (
    <DesignSurface surface="warm">
      <div className={styles.page}>
        <div className="wa-kit-home-grid">
          <div className="wa-kit-home-grid__head wa-kit-stack">
            <PageOpener
              // One greeting across the portal: "Welcome back, {first name}." (the staff homes and `counselor.welcomeBack` end with the period too).
              // Translated (`dashboard.home.welcomeBack`), so a Spanish member does not get an English h1 over a Spanish page.
              title={greeting && firstName ? `${greeting}, ${firstName}.` : firstName ? t('home.welcomeBack', { firstName }) : t('home.title')}
              meta={today ? `${today}. ${nextSentence}` : nextSentence}
              aside={approvalSlot}
            />
            {hasNotices ? (
              <div className={styles.headStack}>
                {showStaffViewBanner ? <StaffViewBanner page="dashboard" /> : null}

                {noProgram ? (
                  <div className={cx('wa-kit-card', styles.notice)} role="status">
                    <StatusTag tone="warn">No program</StatusTag>
                    <p className={styles.noticeText}>
                      Your Coursera progress is saved. A counselor still needs to enroll you in a WorkforceAP program.
                    </p>
                  </div>
                ) : null}

                {youthNoticeAge !== null && youthNoticeAge < 18 ? <YouthDashboardNotice age={youthNoticeAge} /> : null}
              </div>
            ) : null}
          </div>

          {/* ───────── Main column: what to do ───────── */}
          <div className="wa-kit-home-grid__main">
            {/* This week: one card, ordered task rows. Today's action first, then
                only the rows that apply to this member. */}
            <section className="wa-kit-card wa-kit-card--flush" aria-labelledby="member-this-week-heading">
              <div className="wa-kit-card__head wa-kit-card__head--ruled">
                <h2 id="member-this-week-heading" className="wa-kit-card-title">{t('home.thisWeek')}</h2>
                {stepCount > 0 ? <span className="wa-kit-card-count">{t('home.stepCount', { count: stepCount })}</span> : null}
              </div>
              {stepCount > 0 ? (
                <ol className="wa-kit-task-list" aria-label={t('home.stepsLabel')}>
                  {/* Today's next-best action. Navigation does not complete a
                      persisted suggestion; completion is recorded separately. */}
                  <MemberDoThisNextCard action={doThisNext} variant="row" rowState={rowStateFor('today')} previewOnly={previewOnly} />

                  {/* Post-offer rows, each only when it applies: confirm an accepted
                      offer (writes a member-reported placement and alerts the
                      counselor), then the First 90 Days check-in (a trouble report
                      escalates to the counselor). Both call their own server actions. */}
                  {jobOffers.length > 0 ? (
                    <ErrorBoundary>
                      <PlacementConfirmationStrip offers={jobOffers} variant="row" rowState={rowStateFor('offer')} previewOnly={previewOnly} />
                    </ErrorBoundary>
                  ) : null}
                  {first90 ? (
                    <ErrorBoundary>
                      <First90DaysCard {...first90} variant="row" rowState={rowStateFor('first90')} previewOnly={previewOnly} />
                    </ErrorBoundary>
                  ) : null}

                  {/* The WIOA preassessment while it is pending. Members were not
                      finding it (ops 10/8/26), so it is a row, not a footer link. */}
                  {showPreassessment ? (
                    <MemberTaskLinkRow
                      href={preassessmentHref}
                      state={rowStateFor('preassessment')}
                      testId="member-preassessment-row"
                      title={t('home.preassessmentTitle')}
                      sub={t('home.preassessmentSub')}
                      cta={t('home.start')}
                    />
                  ) : null}

                  {remainingUpNext.slice(0, 1).map((action) => (
                    <MemberTaskLinkRow
                      key={action.id}
                      href={resolveMemberProgramHref(action.href)}
                      state={rowStateFor(`up-${action.id}`)}
                      title={action.title}
                      sub={action.body}
                      cta={action.cta}
                    />
                  ))}
                  {remainingUpNext.length > 1 || recommendedTool ? (
                    <li className={styles.moreStepsDisclosure}>
                      <details>
                        <summary className="wa-kit-focus">{tDisclosure('moreThisWeek')}</summary>
                        <ol aria-label={t('home.stepsLabel')}>
                          {remainingUpNext.slice(1).map((action) => (
                            <MemberTaskLinkRow
                              key={action.id}
                              href={resolveMemberProgramHref(action.href)}
                              state={rowStateFor(`up-${action.id}`)}
                              title={action.title}
                              sub={action.body}
                              cta={action.cta}
                            />
                          ))}
                          {recommendedTool ? (
                            <MemberTaskLinkRow
                              href={recommendedTool.href}
                              state={rowStateFor('tool')}
                              testId="recommended-tool"
                              dataAttrs={{ 'data-tool': recommendedTool.slug }}
                              title={tTools('tryNext', { title: recommendedTool.title })}
                              sub={recommendedTool.body}
                              cta={recommendedTool.cta}
                            />
                          ) : null}
                        </ol>
                      </details>
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p className={styles.noSteps}>{t('home.noSteps')}</p>
              )}
            </section>

            {/* Keep the resume-to-consultation handoff visible with its saved
                evidence, while its confirmation guidance remains disclosed. */}
            <MemberHandoffSummary
              evidence={handoff}
              messagesHref={advisor?.messagingHref}
              resumeStudioHref={resumeStudioHref}
              resumeReturnAction={resumeReturnAction}
              resumeDraftOwnerToken={resumeDraftOwnerToken}
              showResumeAction={doThisNext?.href.split('?')[0] !== resumeStudioHref.split('?')[0]}
            />

            {!programTitle && ungatedDigitalBasicsHref ? (
              <div className={cx('wa-kit-card', styles.basicsCard)}>
                <p className={styles.basicsEyebrow}>No application needed</p>
                <h2 className={styles.basicsTitle}>Start digital basics</h2>
                <p className={cx('wa-kit-lede', styles.basicsBody)}>
                  Ten self-paced computer lessons. Open lesson 1 now.
                </p>
                <Link
                  href={ungatedDigitalBasicsHref}
                  className="wa-kit-cta wa-kit-cta--xl wa-kit-cta--block wa-kit-focus hover:wa-opacity-90"
                >
                  Start this lesson
                </Link>
              </div>
            ) : null}

            {/* Certification path: segmented module progress. */}
            <section className="wa-kit-card wa-kit-cert-path" aria-labelledby="member-cert-path-heading">
              <div className="wa-kit-card__head">
                <h2 id="member-cert-path-heading" className="wa-kit-card-title">Certification path</h2>
                <a href={programHref} className="wa-kit-card-link wa-kit-focus">Open plan</a>
              </div>
              {showProgramSwitch && programSwitch ? (
                <div data-testid="home-program-switch" className={styles.certSwitch}>
                  <DashboardProgramSelector
                    options={programSwitch.options}
                    activeProgramSlug={programSwitch.activeProgramSlug}
                    pathname={programSwitch.pathname}
                  />
                </div>
              ) : null}
              <div className={styles.certTop}>
                <ProgressRing pct={pct} size={72} tone={pct >= 100 ? 'ok' : undefined} label="Course completion" />
                <div className={styles.certCopy}>
                  <div className={styles.certTitleRow}>
                    <h3 className={styles.certTitle}>{programTitle ?? 'No program enrolled'}</h3>
                    {programStatus ? <StatusTag tone="info">{programStatus}</StatusTag> : null}
                  </div>
                  {nextLesson ? (
                    <p className={styles.certMeta}>
                      Next:{' '}
                      {nextLessonHref ? (
                        <Link href={nextLessonHref} className={cx('wa-kit-focus', styles.certMetaLink)}>
                          {nextLesson}
                        </Link>
                      ) : (
                        nextLesson
                      )}
                      {nextLessonDue ? (
                        <>
                          {' '}
                          · <span className={styles.certDue}>{nextLessonDue}</span>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p className={styles.certMeta}>
                      {programTitle ? 'No next module on file.' : 'Choose a program to start.'}
                    </p>
                  )}
                </div>
              </div>
              {hasModuleRow ? (
                <div
                  className={styles.certSegments}
                  role="progressbar"
                  aria-label="Certification module progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((moduleDone / moduleTotal) * 100)}
                  aria-valuetext={`${moduleDone} of ${moduleTotal} modules`}
                >
                  <ol
                    className={cx('wa-kit-segments', segmentsCompact && styles.certSegmentsCompact)}
                    style={{ '--wa-segments': moduleTotal } as CSSProperties}
                    aria-hidden="true"
                  >
                    {Array.from({ length: moduleTotal }).map((_, i) => {
                      const state = i < moduleDone ? 'done' : i === moduleDone ? 'current' : 'todo';
                      return (
                        <li key={i} className={`wa-kit-segment wa-kit-segment--${state}`}>
                          <span className="wa-kit-segment__bar"><i /></span>
                          {segmentsCompact ? null : (
                            <span className="wa-kit-segment__label">
                              <b className="wa-kit-segment__state">
                                {state === 'done' ? <Check size={13} /> : null}
                                {i + 1}
                              </b>
                              <span className="wa-kit-segment__name">Module {i + 1}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
              {programTitle && programCoursesNote ? (
                <div className={styles.certNote}>
                  <WhatNext label={t('home.moduleNote')}>
                    <p data-testid="program-courses-note">{programCoursesNote}</p>
                  </WhatNext>
                </div>
              ) : null}
              <div className={styles.certFoot}>
                <Link
                  href={resolveMemberProgramHref(resumeHref)}
                  className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                >
                  {programTitle ? (
                    <>
                      Resume module <Play size={13} aria-hidden />
                    </>
                  ) : (
                    <>
                      Choose program <ArrowRight size={13} aria-hidden />
                    </>
                  )}
                </Link>
              </div>
            </section>

            {/* One quiet row of links. Points, the streak and the ledger live on the
                Points page now (the only route that shows them to a signed-in member);
                the application pipeline is on Jobs (Addendum A5), so Home links there. */}
            <nav aria-label={t('home.shortcutsLabel')} className={styles.shortcuts}>
              <Link href={progressHref} className={cx('wa-kit-focus', styles.shortcut)}>
                <TrendingUp size={16} aria-hidden /> {t('home.shortcutProgress')}
              </Link>
              <Link href={pointsHref} className={cx('wa-kit-focus', styles.shortcut)}>
                <Star size={16} aria-hidden /> {t('home.shortcutPoints')}
              </Link>
              <Link href={jobsHref} className={cx('wa-kit-focus', styles.shortcut)}>
                <Briefcase size={16} aria-hidden /> {t('home.shortcutJobs')}
              </Link>
              <Link href={toolkitHref} className={cx('wa-kit-focus', styles.shortcut)}>
                <Wand2 size={16} aria-hidden /> {t('home.shortcutAiTools')}
              </Link>
              <Link href={coursesHref} className={cx('wa-kit-focus', styles.shortcut)}>
                <GraduationCap size={16} aria-hidden /> {t('home.shortcutLearning')}
              </Link>
            </nav>
          </div>

          {/* ───────── Right rail: people and rhythm ───────── */}
          <aside className="wa-kit-home-grid__rail" aria-label="Your people and progress">
            <MemberAdvisorCard advisor={advisor} />

            <section className={cx('wa-kit-card', styles.railCard)} aria-labelledby="member-study-heading">
              <div className="wa-kit-card__head">
                <h2 id="member-study-heading" className="wa-kit-card-title">Study this week</h2>
              </div>
              {hasStudyWeek ? (
                <>
                  {studyGoal ? (
                    <>
                      <p className={styles.studyGoalLine}>
                        {t('home.studyOfGoal', { time: formatStudyMinutes(studyMinutes), goal: formatStudyMinutes(studyGoal) })}
                      </p>
                      <div
                        className={cx('wa-kit-bar-track', styles.studyBar)}
                        role="progressbar"
                        aria-valuenow={clampPct((studyMinutes / studyGoal) * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Study goal progress"
                      >
                        <div className="wa-kit-bar-fill" style={{ width: `${clampPct((studyMinutes / studyGoal) * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className={styles.studyTotal}>{formatStudyMinutes(studyMinutes)}</p>
                  )}
                  <ul className={styles.studyDays} aria-label="Study days this week">
                    {weeklyActivity.map((d) => (
                      <li key={d.day} className={styles.studyDay} data-active={d.minutes > 0 ? 'true' : 'false'}>
                        <span className={styles.studyDot} aria-hidden="true" />
                        <span aria-hidden="true">{d.day.charAt(0)}</span>
                        <span className={styles.srOnly}>
                          {DAY_LONG[d.day] ?? d.day}: {d.minutes} minutes
                        </span>
                      </li>
                    ))}
                  </ul>
                  {weeklyActivityDeltaLabel ? <p className={styles.studyDelta}>{weeklyActivityDeltaLabel}</p> : null}
                </>
              ) : (
                <p className={cx('wa-kit-lede', styles.studyEmpty)}>
                  {typeof pointsThisWeek === 'number' && pointsThisWeek > 0
                    ? 'Study minutes are not tracked for this program yet. '
                    : 'No study minutes this week. '}
                  <a href={programHref} className={cx('wa-kit-focus', styles.inlineLink)}>
                    Open program
                  </a>
                </p>
              )}
            </section>

            <section className={cx('wa-kit-card', styles.railCard)} aria-labelledby="member-next-badge-heading">
              <div className="wa-kit-card__head">
                <h2 id="member-next-badge-heading" className="wa-kit-card-title">Next badge</h2>
              </div>
              <div className={styles.badgeRow}>
                <div aria-hidden className={styles.badgeIcon}>
                  <Medal size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className={styles.badgeName}>{nextBadgeName ?? 'Next badge'}</p>
                  {nextBadgeRemaining ? <p className={styles.badgeSub}>{nextBadgeRemaining} to go</p> : null}
                </div>
              </div>
              {/* Progress toward the next badge is neutral: there is no good or bad
                  value, only how far along it is (WAP-99). */}
              <SegmentedProgress pct={nextBadgePercent} segments={7} label={`${nextBadgeName} badge progress`} />
              {goals.length > 0 ? (
                <div className={styles.goals}>
                  <p className={styles.goalsLabel}>
                    <Target size={14} aria-hidden /> Goals
                  </p>
                  {goals.slice(0, 2).map((g) => (
                    <div key={g.title}>
                      <div className={styles.goalHead}>
                        <span className={styles.goalTitle}>{g.title}</span>
                        <span className={styles.goalPct}>{g.percent}%</span>
                      </div>
                      <div className="wa-kit-bar-track" role="progressbar" aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                        <div className="wa-kit-bar-fill" style={{ width: `${g.percent}%` }} />
                      </div>
                    </div>
                  ))}
                  <a href={goalsHref} className="wa-kit-card-link wa-kit-focus">
                    Open goals
                  </a>
                </div>
              ) : (
                // No active goal: one quiet way to set one, not an empty goals block.
                <a href={goalsHref} className={cx('wa-kit-card-link wa-kit-focus', styles.setGoal)}>
                  <Target size={14} aria-hidden /> Set a goal
                </a>
              )}
            </section>
          </aside>
        </div>
      </div>
    </DesignSurface>
  );
}
