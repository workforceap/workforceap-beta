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
};

export type EnrollmentOutcomesPanelData = {
  kpis: KpiItem[];
  /** Enrollment by program, each bar its share of every enrolled member. */
  enrollmentByProgram: RankDatum[];
  enrolledTotal: number;
  careerOs: KpiItem[];
};

const fmt = (n: number) => n.toLocaleString('en-US');

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
  };
}
