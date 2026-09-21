'use client';

import type { CSSProperties } from 'react';
import {
  Play,
  Wand2,
  Medal,
  GraduationCap,
  ArrowRight,
  ArrowUp,
  ArrowDown,
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
  StatusTag,
  colorVar,
  cx,
  toneClass,
  type Column,
  type KitColor,
  type KitTone,
} from '@/components/portal/kit';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import { MEMBER_PROGRAM_HREF, resolveMemberProgramHref } from '@/lib/member/memberProgramHref';

/**
 * Member Portal — HOME view ("Command Center" redesign).
 *
 * Faithful port of the approved Command Center mockup onto the portal design
 * kit (warm surface + --wa-* tokens + wa-kit-* classes + lucide icons). Layout
 * order, top to bottom:
 *   1. PageOpener (Home kicker + greeting) with the streak chip in `action`.
 *   2. Full-bleed "Do this next" banner (MemberDoThisNextCard, kit variant).
 *   3. A 4-up stat-tile row (course / active jobs / certs / points), each with
 *      an optional inline sparkline + delta chip.
 *   4. A mixed row: certification progress ring, weekly-activity area chart,
 *      and a points ledger.
 *   5. The application pipeline table + a Next Badge tile with segmented
 *      progress.
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

/** Tiny inline sparkline + delta chip for a stat tile. Omit any field to hide that piece. */
export interface StatSpark {
  /** Sparkline series (2+ points, auto-scaled). Omit to hide the sparkline. */
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
  color?: KitColor;
}

export interface MemberHomeKitProps {
  firstName?: string;
  /** Optional time-of-day phrase. Omit on live — title is the member's name. */
  greeting?: string;
  /** 0–100 course completion. */
  coursePercent?: number;
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
  goalsHref?: string;
  /** Dominant next-best-action banner rendered above the bento grid. `null`/omitted renders nothing (no empty shell). */
  doThisNext?: NextBestAction | null;
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

/** Deterministic brand-safe color for a company-initial avatar (no arbitrary hex). */
const LOGO_COLORS = ['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-gold)', 'var(--wa-success)', 'var(--wa-accent-dark)'];
function logoColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function sparklinePoints(series: number[]): string {
  const w = 100;
  const h = 28;
  const pad = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  return series
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
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

/**
 * Trend pill. The direction IS the state, so it declares its own tone hook
 * (`ok` up / `danger` down) and paints from `--wa-kit-tone`; it never names
 * `var(--wa-success)` / `var(--wa-danger)` inline (#2434, WAP-99).
 */
function DeltaChip({ delta, direction = 'up' }: { delta: string; direction?: 'up' | 'down' }) {
  const Icon = direction === 'down' ? ArrowDown : ArrowUp;
  return (
    <span
      className={toneClass(direction === 'down' ? 'danger' : 'ok')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 'var(--wa-type-meta)',
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: 999,
        color: 'var(--wa-kit-tone)',
        background: 'var(--wa-kit-tone-soft)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Icon size={10} aria-hidden />
      {delta}
    </span>
  );
}

/**
 * Member home KPI tile, on the same tone contract as the kit's
 * `StatSparkTile` (components/portal/kit/CommandCenter.tsx): the value is
 * always neutral `--wa-text`, and a `tone` — a state derived from the value,
 * never the column it sits in (WAP-99) — declares `.wa-kit-tone--<tone>` so
 * the icon chip and the trend line paint from `--wa-kit-tone`. Untoned, the
 * chip is the neutral surface pair and the line is the brand accent.
 */
function StatSparkTile({
  icon: Icon,
  label,
  value,
  tone,
  spark,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** Semantic state derived from the value; paints the icon chip and trend line only. */
  tone?: KitTone;
  spark?: StatSpark;
}) {
  return (
    <div className="wa-kit-card">
      <div className={cx(toneClass(tone))} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="wa-flex wa-items-start wa-justify-between">
        <div aria-hidden className="wa-kit-tone-icon">
          <Icon size={16} />
        </div>
        {spark?.delta ? <DeltaChip delta={spark.delta} direction={spark.direction} /> : null}
      </div>
      <div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: 'var(--wa-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </div>
        <div style={{ marginTop: 4, fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}>
          {label}
        </div>
      </div>
      {spark?.series && spark.series.length > 1 ? (
        <svg aria-hidden focusable="false" viewBox="0 0 100 28" width="100%" height={28} preserveAspectRatio="none">
          <polyline
            points={sparklinePoints(spark.series)}
            fill="none"
            stroke={tone ? 'var(--wa-kit-tone)' : 'var(--wa-accent)'}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      </div>
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
  goalsHref = '/dashboard?ui=legacy&tab=learning#goals',
  doThisNext = null,
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
      // Finished the course; nothing started while enrolled is worth a nudge.
      tone: pct >= 100 ? 'ok' : pct === 0 && programTitle ? 'warn' : undefined,
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
              <span
                className="wa-flex wa-items-center wa-gap-2"
                style={{
                  padding: '7px 13px 7px 10px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--wa-gold) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--wa-gold) 35%, transparent)',
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 700,
                  color: 'var(--wa-gold-dark)',
                  flexShrink: 0,
                }}
              >
                <Flame size={15} aria-hidden />
                <span>
                  <b style={{ color: 'var(--wa-text)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{currentStreak}</b>
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

        {/* 2. Dominant next-best-action banner. Renders nothing when there's no
            pending action (see MemberDoThisNextCard). */}
        <MemberDoThisNextCard action={doThisNext} variant="kit" paddingX="0" />

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

        {/* 3. Stat tiles — icon + delta chip + value/label + optional sparkline. */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
          {statTiles.map((t) => (
            <StatSparkTile key={t.key} icon={t.icon} label={t.label} value={t.value} tone={t.tone} spark={t.spark} />
          ))}
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
                  <div key={`${entry.label}-${i}`} className="wa-flex wa-items-center wa-justify-between" style={{ fontSize: 'var(--wa-type-meta)' }}>
                    <span className="wa-flex wa-items-center wa-gap-2" style={{ color: 'var(--wa-muted)', fontWeight: 600 }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: colorVar(entry.color ?? 'accent') }} />
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
              emptyTitle="No active applications"
              emptyDescription="Saved and submitted jobs will appear here."
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
            ) : null}
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
