'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import {
  Play,
  Wand2,
  Medal,
  GraduationCap,
  ArrowRight,
  ArrowUp,
  Flame,
  Target,
  BookOpen,
  Briefcase,
  Star,
  Home,
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
import First90DaysCard, { type First90DaysCardProps } from '@/components/portal/First90DaysCard';
import YouthDashboardNotice from '@/components/portal/YouthDashboardNotice';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import PlacementConfirmationStrip from '@/app/(portal)/dashboard/PlacementConfirmationStrip';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import type { MemberToolRecommendation } from '@/lib/member/recommendMemberTool';
import { MEMBER_PROGRAM_HREF, resolveMemberProgramHref } from '@/lib/member/memberProgramHref';

/**
 * Member Portal — HOME view ("Command Center" redesign).
 *
 * Faithful port of the approved Command Center mockup onto the portal design
 * kit (warm surface + --wa-* tokens + wa-kit-* classes + lucide icons). Layout
 * order, top to bottom:
 *   1. PageOpener (Home kicker + greeting) with the streak chip in `action`,
 *      then the youth notice for a member under 18 (`youthNoticeAge`).
 *   2. Full-bleed "Do this next" banner (MemberDoThisNextCard).
 *      Under it, only when they apply: the placement confirmation strip for
 *      OFFER applications (`jobOffers`) and the First 90 Days check-in card
 *      while a placement is inside its window (`first90`) — the two
 *      post-offer surfaces the `?ui=legacy` home used to own (WAP-188). Then
 *      an "Up next" list of the following steps beside one AI Career Tools
 *      pick for the member's stage (both from the loader; either may be
 *      empty, and the row disappears when both are).
 *   3. A 4-up stat-tile row (course / active jobs / certs / points), each with
 *      an optional inline sparkline + delta chip.
 *   4. A mixed row: certification progress ring, weekly-activity area chart,
 *      and a points ledger.
 *   5. The application pipeline table + a Next Badge tile with segmented
 *      progress. Goals fold into that tile and link to the goals section on
 *      the career brief; with none, a quiet "Set a goal" link goes there.
 * A quiet "quick links" row (Learning Hub / AI Career Tools) closes out the
 * page — those destinations also live in the primary portal nav, so they get
 * a low-key footer instead of competing bento tiles.
 *
 * All-new visual data (sparklines, weekly activity, points ledger, per-row
 * applied date + stage index) is additive/optional and degrades gracefully
 * when a caller doesn't pass it (see each prop's doc comment below) — the
 * live route (app/(portal)/dashboard/page.tsx) keeps rendering unchanged.
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
  /** Daily-habit streak (see lib/member/streaks.ts). 0 renders nothing. */
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
  /** Dominant next-best-action banner rendered above the bento grid. `null`/omitted renders nothing (no empty shell). */
  doThisNext?: NextBestAction | null;
  /** The steps after `doThisNext`, most important first. Empty renders nothing. */
  upNext?: NextBestAction[];
  /** One AI Career Tools pick for the member's stage. `null` renders nothing. */
  recommendedTool?: MemberToolRecommendation | null;
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

/** One "Up next" row: title + reason on the left, the action on the right; the whole row is the link. */
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

function KitCardHead({ title, linkLabel, linkHref }: { title: string; linkLabel?: string; linkHref?: string }) {
  return (
    <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 14, gap: 12 }}>
      <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', textWrap: 'balance' }}>{title}</h3>
      {linkLabel && linkHref ? (
        <a
          href={linkHref}
          className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
          style={HOME_TEXT_LINK}
        >
          {linkLabel}
        </a>
      ) : null}
    </div>
  );
}

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

/** Decorative area chart (aria-hidden) + a visually-hidden text equivalent nearby. */
function WeeklyActivityChart({ data }: { data: WeeklyActivityPoint[] }) {
  const w = 460;
  const h = 140;
  const padX = 10;
  const padTop = 10;
  const padBottom = 20;
  const max = Math.max(...data.map((d) => d.minutes), 1);
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + (h - padTop - padBottom) * (1 - d.minutes / max),
    minutes: d.minutes,
    day: d.day,
  }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baseline = h - padBottom;
  const areaPath = `M${points[0].x.toFixed(1)},${baseline.toFixed(1)} L${points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' L')} L${points[points.length - 1].x.toFixed(1)},${baseline.toFixed(1)} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const trendingUp = last.minutes >= first.minutes;
  const a11yText = `Study minutes ${trendingUp ? 'trending up' : 'trending down'} across the week, from ${first.minutes} minutes on ${first.day} to ${last.minutes} minutes on ${last.day}.`;

  return (
    <div>
      <svg aria-hidden focusable="false" viewBox={`0 0 ${w} ${h}`} width="100%" height={140} preserveAspectRatio="none">
        <defs>
          <linearGradient id="wa-home-weekly-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--wa-accent)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--wa-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = padTop + (h - padTop - padBottom) * f;
          return <line key={f} x1={0} x2={w} y1={y} y2={y} stroke="var(--wa-border)" strokeWidth={1} />;
        })}
        <path d={areaPath} fill="url(#wa-home-weekly-fill)" />
        <polyline points={line} fill="none" stroke="var(--wa-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--wa-accent)" />
        ))}
        <circle cx={last.x} cy={last.y} r={5.5} fill="var(--wa-surface)" stroke="var(--wa-accent)" strokeWidth={2.5} />
      </svg>
      <div
        className="wa-flex wa-items-center wa-justify-between"
        style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', fontWeight: 600, padding: '2px 4px 0' }}
      >
        {data.map((d) => (
          <span key={d.day}>{d.day}</span>
        ))}
      </div>
      <p className="sr-only">{a11yText}</p>
    </div>
  );
}

const pipelineColumns: Column<PipelineRow>[] = [
  {
    key: 'role',
    header: 'Role',
    render: (row) => {
      const initial = row.company.trim().charAt(0).toUpperCase() || '?';
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
              background: logoColorFor(row.company),
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
            <div className="wa-kit-meta" style={{ fontWeight: 600, marginTop: 1 }}>{row.company}</div>
          </div>
        </div>
      );
    },
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
  const initial = row.company.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="wa-kit-card wa-kit-card--sm">
      {/* Phones: stack the stage tag under the role+company block. Side by
          side, the nowrap tag took up to 116px of the 226px row, leaving the
          role column 98-139px and wrapping titles onto 3 lines. Row layout
          returns at >=768px. */}
      <div className="wa-flex wa-flex-col wa-items-start wa-gap-2 md:wa-flex-row md:wa-justify-between md:wa-gap-3">
        <div className="wa-flex wa-items-center wa-gap-3" style={{ minWidth: 0 }}>
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
              background: logoColorFor(row.company),
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
            <div className="wa-kit-meta" style={{ marginTop: 2 }}>{row.company}</div>
          </div>
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
  doThisNext = null,
  upNext = [],
  recommendedTool = null,
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
}: MemberHomeKitProps) {
  const t = useTranslations('dashboard');
  const te = useTranslations('empty');
  const pct = clampPct(coursePercent);

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

  const hasModuleRow = typeof certModulesDone === 'number' && typeof certModulesTotal === 'number' && certModulesTotal > 0;

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Home"
          title={greeting && firstName ? `${greeting}, ${firstName}` : firstName ? `Welcome back, ${firstName}` : 'Home'}
          lede={nextLesson ? `Next: ${nextLesson}${nextLessonDue ? ` · ${nextLessonDue}` : ''}` : 'Pick up your program, jobs, or AI Career Tools.'}
          icon={<Home size={13} aria-hidden="true" />}
          action={
            currentStreak > 0 ? (
              <span className="wa-kit-streak-chip">
                <Flame size={15} aria-hidden />
                <span>
                  <b>{currentStreak}</b>
                  -day streak{longestStreak > currentStreak ? ` · best ${longestStreak}` : ''}
                </span>
              </span>
            ) : null
          }
        />

        {noProgram ? (
          <div
            className="wa-kit-card wa-flex wa-items-center wa-gap-3"
            role="status"
            style={{ padding: '12px 14px' }}
          >
            <StatusTag tone="warn">No program</StatusTag>
            <span style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}>
              Your Coursera progress is saved. A counselor still needs to enroll you in a WorkforceAP program.
            </span>
          </div>
        ) : null}

        {youthNoticeAge !== null && youthNoticeAge < 18 ? <YouthDashboardNotice age={youthNoticeAge} /> : null}

        {/* 2. Dominant next-best-action banner. Renders nothing when there's no
            pending action (see MemberDoThisNextCard). */}
        <MemberDoThisNextCard action={doThisNext} />

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
          <div className="wa-kit-card" style={{ display: 'grid', gap: 10 }}>
            <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              No application needed
            </p>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Start digital basics</h3>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
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

        {upNext.length > 0 || recommendedTool ? (
          <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-12 wa-gap-4">
            {upNext.length > 0 ? (
              <div className={cx('wa-kit-card', recommendedTool ? 'lg:wa-col-span-7' : 'lg:wa-col-span-12')}>
                <KitCardHead title="Up next" />
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }} aria-label="Up next">
                  {upNext.map((action) => (
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
              </div>
            ) : null}
            {recommendedTool ? (
              <div
                className={cx('wa-kit-card', upNext.length > 0 ? 'lg:wa-col-span-5' : 'lg:wa-col-span-12')}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                data-testid="recommended-tool"
                data-tool={recommendedTool.slug}
              >
                <p
                  className="wa-kit-meta wa-flex wa-items-center wa-gap-2"
                  style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                >
                  <Wand2 size={13} aria-hidden /> Recommended tool
                </p>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', textWrap: 'balance' }}>
                  {recommendedTool.title}
                </h3>
                <p className="wa-kit-lede" style={{ margin: 0 }}>
                  {recommendedTool.body}
                </p>
                <div className="wa-flex wa-items-center wa-gap-4 wa-flex-wrap" style={{ marginTop: 'auto' }}>
                  <Link
                    href={recommendedTool.href}
                    className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                  >
                    {recommendedTool.cta} <ArrowRight size={13} aria-hidden />
                  </Link>
                  <a
                    href={toolkitHref}
                    className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                    style={{ ...HOME_TEXT_LINK, fontSize: 'var(--wa-type-meta)' }}
                  >
                    All AI Career Tools
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 3. Stat tiles — icon + delta chip + value/label + optional sparkline. */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
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

        {/* 4. Mixed row — certification ring, weekly activity, points ledger. */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-12 wa-gap-4">
          <div className="lg:wa-col-span-4 wa-min-w-0">
          <div className="wa-kit-card wa-kit-cert-path">
            <KitCardHead title="Certification path" linkLabel="Open plan" linkHref={programHref} />
            <div className="wa-kit-cert-path-body">
              <ProgressRing pct={pct} size={112} tone={pct >= 100 ? 'ok' : undefined} label="Course completion" />
              <div className="wa-kit-cert-path-copy">
                {programStatus ? <StatusTag tone="info">{programStatus}</StatusTag> : null}
                <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', marginTop: programStatus ? 8 : 0 }}>
                  {programTitle ?? 'No program enrolled'}
                </h3>
                {nextLesson ? (
                  <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 4 }}>
                    Next:{' '}
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
                  <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 4 }}>
                    {programTitle ? 'No next module on file.' : 'Choose a program to start.'}
                  </p>
                )}
                {hasModuleRow ? (
                  <div style={{ marginTop: 10 }}>
                    <ProgressBar
                      pct={Math.round(((certModulesDone as number) / (certModulesTotal as number)) * 100)}
                      aria-label="Certification module progress"
                    />
                  </div>
                ) : null}
                {programTitle && programCoursesNote ? (
                  <p
                    data-testid="program-courses-note"
                    style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 6 }}
                  >
                    {programCoursesNote}
                  </p>
                ) : null}
                <div style={{ marginTop: 12 }}>
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
              </div>
            </div>
          </div>
          </div>

          <div className="wa-kit-card lg:wa-col-span-5" style={{ display: 'flex', flexDirection: 'column' }}>
            <KitCardHead title="Weekly study activity" />
            {weeklyActivity.length > 1 ? (
              <>
                <WeeklyActivityChart data={weeklyActivity} />
                <div
                  className="wa-flex wa-items-center wa-justify-between"
                  style={{ marginTop: 10, fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}
                >
                  <span className="wa-flex wa-items-center wa-gap-2">
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--wa-accent)' }} />
                    Study minutes / day
                  </span>
                  {weeklyActivityDeltaLabel ? (
                    <span style={{ color: 'var(--wa-success-dark)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {weeklyActivityDeltaLabel}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="wa-kit-lede" style={{ margin: 0 }}>
                {typeof pointsThisWeek === 'number' && pointsThisWeek > 0
                  ? `${pointsThisWeek} points earned this week. Study minutes are not tracked for this program yet. `
                  : 'No study minutes this week. '}
                <a href={programHref} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700, textDecoration: 'none' }}>
                  Open program
                </a>
              </p>
            )}
          </div>

          <div className="wa-kit-card lg:wa-col-span-3" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <KitCardHead title="Points" />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {points.toLocaleString()}
              </span>
              <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', fontWeight: 700 }}>pts</span>
            </div>
            {typeof pointsThisWeek === 'number' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 700,
                  // Text on a success tint reads the text-on-tint token (4.8:1 light);
                  // --wa-success itself is a fill/icon colour (3.2:1 on the page).
                  color: 'var(--wa-success-dark)',
                  background: 'var(--wa-success-soft)',
                  padding: '3px 8px',
                  borderRadius: 999,
                  width: 'fit-content',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <ArrowUp size={10} aria-hidden />
                {pointsThisWeek} this week
              </span>
            ) : null}
            {pointsLedger.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
                {pointsLedger.map((entry, i) => (
                  <div
                    key={`${entry.label}-${i}`}
                    className={cx('wa-flex wa-items-center wa-justify-between', toneClass(entry.tone))}
                    style={{ fontSize: 'var(--wa-type-meta)' }}
                  >
                    <span className="wa-flex wa-items-center wa-gap-2" style={{ color: 'var(--wa-muted)', fontWeight: 600 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: tonePaint(entry.tone, entry.color) ?? colorVar('accent'),
                        }}
                      />
                      {entry.label}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{entry.amount}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* 5. Application pipeline table + Next Badge (segmented progress). */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-12 wa-gap-4">
          <div className="wa-kit-card lg:wa-col-span-8">
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

          <div className="wa-kit-card lg:wa-col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <KitCardHead title="Next badge" />
            <div className="wa-flex wa-items-center wa-gap-3">
              <div
                aria-hidden
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  flexShrink: 0,
                  background: 'var(--wa-gold-soft)',
                  color: 'var(--wa-gold-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Medal size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{nextBadgeName ?? 'Next badge'}</div>
                {nextBadgeRemaining ? (
                <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {nextBadgeRemaining} to go
                </div>
                ) : null}
              </div>
            </div>
            {/* Progress toward the next badge is neutral: there is no good or bad
                value, only how far along it is (WAP-99). */}
            <SegmentedProgress pct={nextBadgePercent} segments={7} label={`${nextBadgeName} badge progress`} />
            {goals.length > 0 ? (
              <div style={{ marginTop: 2, paddingTop: 14, borderTop: '1px solid var(--wa-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--wa-muted)' }} className="wa-flex wa-items-center wa-gap-2">
                  <Target size={14} aria-hidden /> Goals
                </span>
                {goals.slice(0, 2).map((g) => (
                  <div key={g.title}>
                    <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 3 }}>
                      <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.title}
                      </span>
                      <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', flexShrink: 0, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                        {g.percent}%
                      </span>
                    </div>
                    <div className="wa-kit-bar-track" role="progressbar" aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                      <div className="wa-kit-bar-fill" style={{ width: `${g.percent}%` }} />
                    </div>
                  </div>
                ))}
                <a
                  href={goalsHref}
                  className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                  style={HOME_TEXT_LINK}
                >
                  Open goals
                </a>
              </div>
            ) : (
              // No active goal: one quiet way to set one, not an empty goals block.
              <a
                href={goalsHref}
                className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ ...HOME_TEXT_LINK, alignSelf: 'flex-start', fontSize: 'var(--wa-type-meta)' }}
              >
                <Target size={14} aria-hidden /> Set a goal
              </a>
            )}
          </div>
        </div>

        {/* Quiet quick links — Learning Hub + AI Career Tools are also reachable
            from the primary portal nav, so this stays a low-key footer rather
            than competing bento tiles. */}
        <div className="wa-flex wa-items-center wa-gap-5 wa-flex-wrap">
          <a
            href={coursesHref}
            className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
            style={{ ...HOME_TEXT_LINK, color: 'var(--wa-info-dark)' }}
          >
            <GraduationCap size={14} aria-hidden /> Learning hub <ArrowRight size={14} aria-hidden />
          </a>
          <a
            href={toolkitHref}
            className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
            style={HOME_TEXT_LINK}
          >
            <Wand2 size={14} aria-hidden /> AI Career Tools <ArrowRight size={14} aria-hidden />
          </a>
        </div>
      </div>
    </DesignSurface>
  );
}
