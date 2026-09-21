/**
 * Tabs of the admin analytics page (`/admin/analytics`).
 *
 * Engagement (the kit analytics view) and "Enrollment and outcomes" (the
 * numbers `/admin/metrics` prints) live on one page as kit Tabs, so admins
 * stop hunting across two routes for the same story (admin audit
 * 2026-09-20, Analytics). Pure so the tab list, the `?tab=` parsing and the
 * metrics → kit projection are testable without React or Prisma.
 */

import type { KitTabItem } from '@/components/portal/kit/Tabs';
import type { KpiItem } from '@/components/portal/kit/KpiStrip';
import type { RankDatum } from '@/components/portal/kit/Charts';

export const ANALYTICS_TABS = [
  { id: 'engagement', label: 'Engagement' },
  { id: 'enrollment', label: 'Enrollment and outcomes' },
] as const satisfies ReadonlyArray<KitTabItem>;

export type AnalyticsTabId = (typeof ANALYTICS_TABS)[number]['id'];

export const ANALYTICS_TAB_PARAM = 'tab';

/** `?tab=` → tab id; anything unknown opens Engagement. */
export function parseAnalyticsTab(value: string | string[] | undefined | null): AnalyticsTabId {
  const raw = Array.isArray(value) ? value[0] : value;
  return ANALYTICS_TABS.some((tab) => tab.id === raw) ? (raw as AnalyticsTabId) : 'engagement';
}

/** The slice of `getAdminMetrics()` the enrollment tab prints. */
export type EnrollmentOutcomesSource = {
  totalMembers: number;
  weeklyActiveMembers: number;
  aiToolRuns: number;
  placementStats: { enrolled: number; placed: number; certifications: number; placementRate: number };
  enrollmentByProgram: Array<{ program: string; count: number }>;
  careerOsMetrics: {
    completionEventsReceived: number;
    actionsCreated: number;
    actionsPending: number;
    actionsCompleted: number;
    followThroughRate: number;
  };
  /**
   * Labels of the `getAdminMetrics()` slices that failed and were zero-filled
   * (empty when every number is real). The loader settles its slices
   * independently, so a transient failure prints 0 rather than an error — the
   * reader has to be told which ones (number audit 2026-09-20, S29).
   */
  degradedSlices?: readonly string[];
};

export type EnrollmentOutcomesPanelData = {
  kpis: KpiItem[];
  /** Enrollment by program, each bar its share of every enrolled member. */
  enrollmentByProgram: RankDatum[];
  enrolledTotal: number;
  careerOs: KpiItem[];
  /**
   * What qualifies the daily-activity series behind the "full charts" link:
   * the buckets are calendar days, so the last one is only the day so far.
   */
  chartsNote: string;
  /** Set only when a slice was zero-filled; names the affected numbers. */
  degradedNote?: string;
};

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The qualification the old `/admin/metrics` kit card carried on its
 * "last 24h" figure. `getDailyActivity` buckets by calendar day
 * (`start.setHours(0,0,0,0)` + `date_trunc('day', …)`, server time — UTC in
 * production), so the newest bucket is the day so far, not a rolling 24
 * hours. `/admin/metrics` folded into this tab in #2438 and the caption went
 * with the card, leaving the series unqualified (number audit 2026-09-20,
 * S29).
 */
export const DAILY_ACTIVITY_BUCKET_NOTE =
  'Daily activity buckets by calendar day, midnight to midnight in server time (UTC) — the newest day is the day so far, not a rolling 24 hours.';

/**
 * Prefix of the degraded-slice warning. `getAdminMetrics` settles its slices
 * independently and zero-fills a rejected one, and it declines to cache such
 * a result — so a 0 here can mean "failed", not "none", and a refresh retries.
 */
export const DEGRADED_SLICES_NOTE_PREFIX = 'Some numbers could not be loaded and are showing 0';

/** "Some numbers could not be loaded and are showing 0 (placementStats, …). Refreshing retries; this result is not cached." */
export function degradedSlicesNote(slices: readonly string[] | undefined): string | undefined {
  if (!slices || slices.length === 0) return undefined;
  return `${DEGRADED_SLICES_NOTE_PREFIX} (${[...slices].join(', ')}). Refreshing retries — a partial result is never cached.`;
}

/**
 * Projection of the metrics loader onto kit tiles and bars. Bars are shares
 * of all enrolled members (never of the leading program), so a lone program
 * reads 100% and two equal programs read 50% each.
 */
export function buildEnrollmentOutcomesPanel(source: EnrollmentOutcomesSource): EnrollmentOutcomesPanelData {
  const enrolledTotal = source.enrollmentByProgram.reduce((sum, row) => sum + row.count, 0);
  const enrollmentByProgram: RankDatum[] = [...source.enrollmentByProgram]
    .sort((a, b) => b.count - a.count || a.program.localeCompare(b.program))
    .map((row) => ({
      label: row.program,
      value: `${fmt(row.count)} · ${enrolledTotal > 0 ? Math.round((row.count / enrolledTotal) * 100) : 0}%`,
      pct: enrolledTotal > 0 ? Math.round((row.count / enrolledTotal) * 100) : 0,
      color: 'info',
    }));

  return {
    kpis: [
      { label: 'Total members', value: fmt(source.totalMembers) },
      { label: 'Weekly active', value: fmt(source.weeklyActiveMembers), delta: 'any portal activity in 7 days', deltaTone: 'muted' },
      { label: 'Placements', value: fmt(source.placementStats.placed) },
      {
        label: 'Placement rate',
        value: `${source.placementStats.placementRate}%`,
        delta: `${fmt(source.placementStats.placed)} of ${fmt(source.placementStats.enrolled)} enrolled`,
        deltaTone: 'muted',
      },
      { label: 'Certificates', value: fmt(source.placementStats.certifications) },
      { label: 'AI tool runs', value: fmt(source.aiToolRuns) },
    ],
    enrollmentByProgram,
    enrolledTotal,
    careerOs: [
      { label: 'Completion events', value: fmt(source.careerOsMetrics.completionEventsReceived) },
      { label: 'Actions created', value: fmt(source.careerOsMetrics.actionsCreated) },
      { label: 'Actions pending', value: fmt(source.careerOsMetrics.actionsPending) },
      { label: 'Actions completed', value: fmt(source.careerOsMetrics.actionsCompleted) },
      { label: 'Follow-through', value: `${source.careerOsMetrics.followThroughRate}%`, delta: 'completed of created', deltaTone: 'muted' },
    ],
    chartsNote: DAILY_ACTIVITY_BUCKET_NOTE,
    degradedNote: degradedSlicesNote(source.degradedSlices),
  };
}
