'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Play,
  Medal,
  GraduationCap,
  ArrowRight,
  Check,
  Flame,
  Target,
  BookOpen,
  Briefcase,
  Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  DataTable,
  DesignSurface,
  PageOpener,
  ProgressBar,
  ProgressRing,
  StatSparkTile,
  StatusTag,
  colorVar,
  cx,
  toneClass,
  tonePaint,
  type Column,
  type KitColor,
  type KitTone,
} from '@/components/portal/kit';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import MemberStartHereCard from './MemberStartHereCard';
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
import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import styles from './MemberHomeKit.module.css';

/**
 * Member Portal — HOME view (C1 + C3 redesign).
 *
 * Built on the portal design kit (warm surface + --wa-* tokens + wa-kit-*
 * classes + lucide icons). Layout, top to bottom:
 *   1. Header: greeting + ONE contextual sentence (today's date and the next
 *      lesson), with the approval steps strip at the right on desktop
 *      (`approvalSlot`, rendered through PageOpener `aside`) and stacked below
 *      on phone. Under it, only when they apply: the staff-view notice
 *      (`showStaffViewBanner`), the no-program notice, and the youth notice for
 *      a member under 18 (`youthNoticeAge`).
 *   2. Two columns from 1100px (main about 2/3, right rail 352px); one column
 *      on phone with the rail after the main flow.
 *      Main: the "Today" next-best-action card (MemberDoThisNextCard), the
 *      Start here shortcuts, the placement confirmation strip for OFFER
 *      applications (`jobOffers`) and the First 90 Days check-in (`first90`),
 *      AI Career Tools, the "This week" task list (the next-best-actions after
 *      the dominant one, `upNext`), the certification path with segmented
 *      module progress (with more than one enrollment it carries the view-only
 *      program switch, `programSwitch`, which reloads `/dashboard?program=<slug>`
 *      and never changes an enrollment), the application pipeline, and the four
 *      totals tiles.
 *      Rail: the assigned counselor (`advisor`), streak + points, recent points,
 *      study this week, and the next badge with goals folded in.
 *
 * All visual data (sparklines, weekly activity, points ledger, per-row applied
 * date + stage index) is additive/optional and degrades gracefully when a
 * caller doesn't pass it (see each prop's doc comment below) — the live route
 * (app/(portal)/dashboard/page.tsx) keeps rendering unchanged.
 *
 * Target route: app/(portal)/dashboard
 * Surface: warm (member-facing).
 */

/**
 * A pipeline row's stage tone. Declared as a subset of `KitTone` so the stage
 * track can hand it straight to `toneClass()` and paint from
 * `--wa-kit-tone`, instead of mapping it to `var(--wa-gold)` /
 * `var(--wa-info)` by hand (#2434).
 */
type JobStageTone = Extract<KitTone, 'warn' | 'muted' | 'info'>;

interface PipelineRow {
  role: string;
  company: string;
  stage: string;
  tone: JobStageTone;
  /** Applied date label, e.g. "Jun 18". Omit to render an em dash. */
  appliedLabel?: string;
  /** 1-based current position in the stage tracker. Falls back to a value derived from `tone` when omitted. */
  stageIndex?: number;
  /** Total segments in the stage tracker. Defaults to 3. */
  stageTotal?: number;
}

interface GoalSummary {
  title: string;
  /** 0–100 completion. */
  percent: number;
}

/**
 * Tiny inline sparkline + delta chip for a stat tile. Omit any field to hide
 * that piece. Structurally the kit's `SparkStat` (components/portal/kit/
 * CommandCenter.tsx) — the home tiles render the shared `StatSparkTile`.
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
   * already flagged it. Gates the Course tile's warning tone — a member who
   * enrolled an hour ago is at 0% for no bad reason.
   */
  courseProgressStale?: boolean;
  activeJobs?: number;
  certs?: number;
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
  /** Short list shown in the home "Application pipeline" table. */
  pipeline?: PipelineRow[];
  programHref?: string;
  resumeHref?: string;
  toolkitHref?: string;
  jobsHref?: string;
  coursesHref?: string;
  /** Daily-habit streak (see lib/member/streaks.ts). 0 hides the streak cell; points still show. */
  currentStreak?: number;
  longestStreak?: number;
  /** Up to a few active goals, folded into the Next Badge tile. */
  goals?: GoalSummary[];
  /** Where "Open goals" / "Set a goal" go: the goals section of the career brief (kit page, not `?ui=legacy`). */
  goalsHref?: string;
  /**
   * OFFER applications for the placement confirmation strip — the one
   * member-initiated path to a (member-reported) placement record. Empty
   * renders nothing.
   */
  jobOffers?: Array<{ id: string; role: string; company: string }>;
  /** First 90 Days check-in card props while a placement is inside its window. `null` renders nothing. */
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
  /** Dominant next-best-action banner rendered above the bento grid. `null`/omitted renders nothing (no empty shell). */
  doThisNext?: NextBestAction | null;
  /** Active assigned counselor (resolveAssignedCounselor). Null hides the advisor card. */
  advisor?: AssignedCounselor | null;
  /** The steps after `doThisNext`, most important first. Empty renders nothing. */
  upNext?: NextBestAction[];
  /** Optional stage-specific pick inside the permanent AI Career Tools introduction. */
  recommendedTool?: MemberToolRecommendation | null;
  /** True once the WIOA preassessment is on file; the Start-here link then reads as done. */
  preassessmentCompleted?: boolean;
  /** Ungated Digital Literacy lesson 1. Shown when the member has no enrolled program. */
  ungatedDigitalBasicsHref?: string | null;
  /** Sparkline + delta chip for the course-progress stat tile. Omit to hide both. */
  courseSpark?: StatSpark;
  /** Sparkline + delta chip for the active-jobs stat tile. */
  activeJobsSpark?: StatSpark;
  /** Sparkline + delta chip for the certifications stat tile. */
  certsSpark?: StatSpark;
  /** Sparkline + delta chip for the points stat tile. */
  pointsSpark?: StatSpark;
  /** Modules completed toward the active certification — pairs with `certModulesTotal` to show the module-dot row. Omit either to hide the row. */
  certModulesDone?: number;
  /** Total modules in the active certification. */
  certModulesTotal?: number;
  /**
   * Plain line under the module row naming the WorkforceAP lab inside the
   * module count, so nobody wonders why Coursera's path covers one fewer.
   */
  programCoursesNote?: string | null;
  /** Daily study-minutes series for the weekly activity chart. Omit/short (<2 points) shows a placeholder instead of an empty chart. */
  weeklyActivity?: WeeklyActivityPoint[];
  /** Caption next to the weekly-activity legend, e.g. "+41% vs last week". Omit to hide. */
  weeklyActivityDeltaLabel?: string;
  /** Points earned this week, shown as a delta chip under the points total. Omit to hide. */
  pointsThisWeek?: number;
  /** Recent point-earning events for the points ledger. Omit/empty to hide the list (points total still shows). */
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

function defaultStageIndex(tone: JobStageTone): number {
  if (tone === 'warn') return 3;
  if (tone === 'info') return 2;
  return 1;
}

/**
 * Deterministic brand-safe color for a company-initial avatar (no arbitrary hex).
 *
 * Already on the design tokens — every entry is a `--wa-*` custom property, so
 * light/dark and rebrands follow for free. Deliberately NOT moved onto the
 * `KitTone` palette: the hue here identifies an employer, it does not rate one.
 * A tone would make "Acme" green and "Globex" amber and invite the reader to
 * see a judgement about the company that nothing in the data supports. The
 * list is ordered for adjacent-swatch contrast, not by severity.
 */
const LOGO_COLORS = ['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-gold)', 'var(--wa-success)', 'var(--wa-accent-dark)'];
function logoColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

/**
 * Company line for the home pipeline. Reuses the public job-board sandbox /
 * QA / demo employer rule (`isExcludedPublicEmployerName`) so fixture names
 * like "QA Audit Co" stay off the member home while real employers (e.g.
 * Dell Technologies) still show.
 */
function pipelineCompanyDisplay(company: string): string | null {
  const trimmed = company.trim();
  if (!trimmed || isExcludedPublicEmployerName(trimmed)) return null;
  return trimmed;
}

/* ---------------------------------------------------------------------- */
/* Presentational sub-components                                          */
/* ---------------------------------------------------------------------- */

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

const pipelineColumns: Column<PipelineRow>[] = [
  {
    key: 'role',
    header: 'Role',
    render: (row) => <PipelineRoleCell row={row} />,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusTag tone={row.tone}>{row.stage}</StatusTag>,
  },
  {
    key: 'stageTrack',
    header: 'Stage',
    render: (row) => <PipelineStageTrack row={row} />,
  },
  {
    key: 'applied',
    header: 'Applied',
    align: 'right',
    render: (row) => (
      <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {row.appliedLabel ?? '—'}
      </span>
    ),
  },
];

const pipelineCard = (row: PipelineRow) => {
  return (
    <div className="wa-kit-card wa-kit-card--sm">
      {/* Phones: stack the stage tag under the role+company block. Side by
          side, the nowrap tag took up to 116px of the 226px row, leaving the
          role column 98-139px and wrapping titles onto 3 lines. Row layout
          returns at >=768px. */}
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
};

/* ---------------------------------------------------------------------- */
/* Main component                                                          */
/* ---------------------------------------------------------------------- */

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

export function MemberHomeKit({
  firstName = '',
  greeting,
  coursePercent = 0,
  courseProgressStale = false,
  activeJobs = 0,
  certs = 0,
  points = 0,
  programTitle,
  programStatus,
  noProgram = false,
  nextLesson,
  nextLessonDue,
  nextLessonHref,
  nextBadgePercent = 0,
  nextBadgeName,
  nextBadgeRemaining,
  pipeline = [],
  programHref = MEMBER_PROGRAM_HREF,
  resumeHref = MEMBER_PROGRAM_HREF,
  toolkitHref = '/dashboard/ai-tools',
  jobsHref = '/dashboard/jobs',
  coursesHref = '/dashboard/learning',
  currentStreak = 0,
  longestStreak = 0,
  goals = [],
  goalsHref = '/dashboard/career-brief#goals',
  jobOffers = [],
  first90 = null,
  youthNoticeAge = null,
  showStaffViewBanner = false,
  programSwitch = null,
  doThisNext = null,
  advisor = null,
  upNext = [],
  recommendedTool = null,
  preassessmentCompleted = false,
  ungatedDigitalBasicsHref = null,
  courseSpark,
  activeJobsSpark,
  certsSpark,
  pointsSpark,
  certModulesDone,
  certModulesTotal,
  programCoursesNote,
  weeklyActivity = [],
  weeklyActivityDeltaLabel,
  pointsThisWeek,
  pointsLedger = [],
  approvalSlot = null,
}: MemberHomeKitProps) {
  const t = useTranslations('dashboard');
  const te = useTranslations('empty');
  const pct = clampPct(coursePercent);
  const today = useTodayLabel();

  /**
   * Only a state paints a tile (WAP-99). These four used to be magenta /
   * blue / gold / green by column, which told the member nothing: the hue
   * was the tile's position, not its value. Each now derives a kit tone
   * (#2434) from what the number says, and a plain running total stays
   * neutral. No number, threshold or definition changes here — the same
   * counts render, in the palette the admin kits already use.
   */
  const statTiles: Array<{ key: string; icon: LucideIcon; label: string; value: string | number; tone?: KitTone; spark?: StatSpark }> = [
    {
      key: 'course',
      icon: BookOpen,
      label: 'Course',
      value: `${pct}%`,
      // Finished the course reads as done. Nothing started while enrolled is
      // only worth a nudge once it has actually gone quiet: 0% an hour after
      // enrolling is not a fault, so the warn tone waits for the shared
      // staleness threshold (`STALE_TRAINING_ACTIVITY_DAYS`) to be crossed.
      tone: pct >= 100 ? 'ok' : pct === 0 && programTitle && courseProgressStale ? 'warn' : undefined,
      spark: courseSpark,
    },
    {
      key: 'jobs',
      icon: Briefcase,
      label: 'Active jobs',
      value: activeJobs,
      tone: activeJobs > 0 ? 'ok' : undefined,
      spark: activeJobsSpark,
    },
    {
      key: 'certs',
      icon: Medal,
      label: 'Certs',
      value: certs,
      tone: certs > 0 ? 'ok' : undefined,
      spark: certsSpark,
    },
    // A running score with no good/bad state of its own.
    { key: 'points', icon: Star, label: 'Points', value: points.toLocaleString(), spark: pointsSpark },
  ];

  const showProgramSwitch = Boolean(programSwitch && programSwitch.options.length > 1 && programSwitch.activeProgramSlug);
  const hasModuleRow = typeof certModulesDone === 'number' && typeof certModulesTotal === 'number' && certModulesTotal > 0;
  const moduleDone = hasModuleRow ? Math.max(0, Math.min(certModulesTotal as number, certModulesDone as number)) : 0;
  const moduleTotal = hasModuleRow ? (certModulesTotal as number) : 0;
  const segmentsCompact = moduleTotal > 8;

  const studyMinutes = weeklyActivity.reduce((sum, d) => sum + d.minutes, 0);
  const hasStudyWeek = weeklyActivity.length > 1;

  const nextSentence = nextLesson
    ? `Next: ${nextLesson}${nextLessonDue ? ` · ${nextLessonDue}` : ''}`
    : 'Pick up your program, jobs, or AI Career Tools.';

  const hasNotices = showStaffViewBanner || noProgram || (youthNoticeAge !== null && youthNoticeAge < 18);

  return (
    <DesignSurface surface="warm">
      <div className={styles.page}>
        <div className="wa-kit-home-grid">
          <div className="wa-kit-home-grid__head wa-kit-stack">
            <PageOpener
              title={greeting && firstName ? `${greeting}, ${firstName}` : firstName ? `Welcome back, ${firstName}` : 'Home'}
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
            {/* Dominant next-best-action. Renders nothing when there's no
                pending action (see MemberDoThisNextCard). */}
            <MemberDoThisNextCard action={doThisNext} />

            {/* Pinned shortcuts: members were not finding the preassessment (ops 10/8/26). */}
            <MemberStartHereCard toolkitHref={toolkitHref} preassessmentCompleted={preassessmentCompleted} />

            {/* Post-offer surfaces, each only when it applies: confirm an accepted
                offer (writes a member-reported placement and alerts the
                counselor), then the First 90 Days check-in (a trouble report
                escalates to the counselor). Both call their own server actions.
                The kit variant drops their legacy gutter so they sit flush in
                this column like the kit cards around them. */}
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

            <MemberAiToolsCard toolkitHref={toolkitHref} recommendedTool={recommendedTool} />

            {/* This week: the next-best-actions after the dominant one, as a task list. */}
            {upNext.length > 0 ? (
              <section className="wa-kit-card wa-kit-card--flush" aria-labelledby="member-this-week-heading">
                <div className="wa-kit-card__head wa-kit-card__head--ruled">
                  <h2 id="member-this-week-heading" className="wa-kit-card-title">This week</h2>
                  <span className="wa-kit-card-count"><b>{upNext.length}</b> {upNext.length === 1 ? 'step' : 'steps'}</span>
                </div>
                <ol className="wa-kit-task-list" aria-label="Up next">
                  {upNext.map((action, index) => (
                    <li key={action.id}>
                      <Link
                        href={resolveMemberProgramHref(action.href)}
                        className="wa-kit-task-row wa-kit-task-row--link wa-kit-focus"
                        data-state={index === 0 ? 'current' : 'todo'}
                      >
                        <span className="wa-kit-task-row__check" aria-hidden="true" />
                        <span className="wa-kit-task-row__body">
                          <span className="wa-kit-task-row__title" style={{ display: 'block' }}>{action.title}</span>
                          <span className="wa-kit-task-row__sub" style={{ display: 'block' }}>{action.body}</span>
                        </span>
                        <span className={styles.rowAction}>
                          {action.cta} <ArrowRight size={13} aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
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
                <p data-testid="program-courses-note" className={styles.certNote}>
                  {programCoursesNote}
                </p>
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

            {/* Application pipeline. */}
            <div className="wa-kit-card">
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12, gap: 12 }}>
                <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', textWrap: 'balance' }}>Application pipeline</h3>
                <a
                  href={jobsHref}
                  className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                  style={HOME_TEXT_LINK}
                >
                  Open jobs
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
            </div>

            {/* Totals at a glance — icon + delta chip + value/label + optional sparkline. */}
            <div className={styles.tiles}>
              {statTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <StatSparkTile
                    key={tile.key}
                    icon={<Icon size={16} />}
                    label={tile.label}
                    value={tile.value}
                    tone={tile.tone}
                    spark={tile.spark}
                    emptyTrendLabel={t('noTrendYet')}
                  />
                );
              })}
            </div>

            {/* Learning Hub remains available after the progress overview. */}
            <div className={styles.footLinks}>
              <a
                href={coursesHref}
                className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ ...HOME_TEXT_LINK, color: 'var(--wa-info-dark)' }}
              >
                <GraduationCap size={14} aria-hidden /> Learning hub <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          </div>

          {/* ───────── Right rail: people and rhythm ───────── */}
          <aside className="wa-kit-home-grid__rail" aria-label="Your people and progress">
            <MemberAdvisorCard advisor={advisor} />

            <section
              className="wa-kit-card wa-kit-stat-pair"
              aria-label="Streak and points"
              style={currentStreak > 0 ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}
            >
              {currentStreak > 0 ? (
                <div className="wa-kit-stat-pair__cell">
                  <span className={cx('wa-kit-stat-pair__value', styles.streakValue)}><Flame size={20} aria-hidden />{currentStreak}</span>
                  <span className="wa-kit-stat-pair__label">
                    day streak{longestStreak > currentStreak ? ` · best ${longestStreak}` : ''}
                  </span>
                </div>
              ) : null}
              <div className="wa-kit-stat-pair__cell">
                <span className="wa-kit-stat-pair__value">{points.toLocaleString()}</span>
                <span className="wa-kit-stat-pair__label">points</span>
                {typeof pointsThisWeek === 'number' ? (
                  <span className="wa-kit-stat-pair__label">{pointsThisWeek} this week</span>
                ) : null}
              </div>
            </section>

            {pointsLedger.length > 0 ? (
              <section className="wa-kit-card" aria-labelledby="member-points-heading">
                <div className="wa-kit-card__head">
                  <h2 id="member-points-heading" className="wa-kit-card-title">Recent points</h2>
                </div>
                <ul className={styles.ledger}>
                  {pointsLedger.map((entry, i) => (
                    <li
                      key={`${entry.label}-${i}`}
                      className={cx(styles.ledgerRow, toneClass(entry.tone))}
                    >
                      <span className={styles.ledgerLabel}>
                        <span
                          aria-hidden
                          className={styles.ledgerDot}
                          style={{ background: tonePaint(entry.tone, entry.color) ?? colorVar('accent') }}
                        />
                        {entry.label}
                      </span>
                      <span className={styles.ledgerAmount}>+{entry.amount}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="wa-kit-card" aria-labelledby="member-study-heading">
              <div className="wa-kit-card__head">
                <h2 id="member-study-heading" className="wa-kit-card-title">Study this week</h2>
              </div>
              {hasStudyWeek ? (
                <>
                  <p className={styles.studyTotal}>{formatStudyMinutes(studyMinutes)}</p>
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
                    ? `${pointsThisWeek} points earned this week. Study minutes are not tracked for this program yet. `
                    : 'No study minutes this week. '}
                  <a href={programHref} className={cx('wa-kit-focus', styles.inlineLink)}>
                    Open program
                  </a>
                </p>
              )}
            </section>

            <section className="wa-kit-card" aria-labelledby="member-next-badge-heading">
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
