import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  DesignSurface,
  KitEmptyState,
  KpiStrip,
  PageOpener,
  RankBars,
  TabPanel,
  Tabs,
  type KpiItem,
  type RankDatum,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { ANALYTICS_TABS, type AnalyticsTabId } from '@/lib/admin/analyticsTabs';

/**
 * Analytics — engagement & funnel analytics workspace.
 * Mockup: workforceap-admin-full.html "analytics" view.
 * Target route: /admin/analytics
 *
 * Pure read view — no interactivity, so no 'use client'.
 *
 * Composition mirrors BoardOutcomesKit: SectionHeader + KpiStrip + a
 * responsive grid of RankBars panels. The page supplies real lean data;
 * the defaults here keep Storybook/standalone renders sensible and give
 * a graceful empty state when a series is omitted.
 */
export interface AnalyticsKitProps {
  /** Headline KPI tiles: WAU / Avg Session / AI Tool Uses / Voice Sessions. */
  kpis?: KpiItem[];
  /** "Most-used tools (last 30 days)" ranked bars. */
  topTools?: RankDatum[];
  /** "Weekly active by program" ranked bars. */
  activeByProgram?: RankDatum[];
  /** Page header title. */
  title?: string;
  /** Page goal/subtitle caption under the title. */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /**
   * Server-rendered "Enrollment and outcomes" panel. When present the page
   * mounts as kit Tabs (`?tab=engagement|enrollment`); without it the
   * engagement view renders alone, as before.
   */
  enrollmentPanel?: ReactNode;
  /** Tab open on first render (`?tab=`), when `enrollmentPanel` is set. */
  initialTab?: AnalyticsTabId;
}

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'WAU', value: 0 },
  { label: 'Avg Session', value: '—' },
  { label: 'AI Tool Uses', value: 0 },
  { label: 'Voice Sessions', value: 0 },
];

/**
 * Empty panels say WHY the ranking is empty and what fills it, at the kit's
 * 13px floor, instead of a bare "No data for this period yet." (admin audit
 * 2026-09-20, Analytics).
 */
const EMPTY_TOP_TOOLS = (
  <KitEmptyState
    title="No AI tool results saved in the last 30 days"
    description="This ranks the tools members saved a result from, such as Resume Studio or Interview Practice. It fills in as members use them."
    action={<EmptyStateLink href="/admin/ai-tools">Open AI tools</EmptyStateLink>}
  />
);

const EMPTY_ACTIVE_BY_PROGRAM = (
  <KitEmptyState
    title="No weekly activity by program yet"
    description="Counts members with an enrolled program and any portal activity in the last 7 days. Members without a program are not shown here."
    action={<EmptyStateLink href="/admin/students?view=training">Open training progress</EmptyStateLink>}
  />
);

function EmptyStateLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="wa-kit-focus"
      style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
    >
      {children} →
    </Link>
  );
}

export function AnalyticsKit({
  kpis = DEFAULT_KPIS,
  topTools,
  activeByProgram,
  title = 'Analytics',
  goal = 'Engagement & funnel analytics',
  kicker,
  enrollmentPanel,
  initialTab = 'engagement',
}: AnalyticsKitProps) {
  const engagement = (
    <>
      <KpiStrip cols={4} items={kpis} />

      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-5 wa-mt-6">
        {/* Most-used tools (last 30 days). `minWidth: 0` lets this grid column
            shrink to the viewport on phones; RankBars are %-width so they stay
            within the column at any width. */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>
            Most-used tools
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
            last 30 days
          </p>
          {topTools && topTools.length > 0 ? <RankBars data={topTools} /> : EMPTY_TOP_TOOLS}
        </Card>

        {/* Weekly active by program. */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 16 }}>
            Weekly active by program
          </h3>
          {activeByProgram && activeByProgram.length > 0 ? (
            <RankBars data={activeByProgram} />
          ) : (
            EMPTY_ACTIVE_BY_PROGRAM
          )}
        </Card>
      </div>
    </>
  );

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} kicker={kicker ?? 'Admin'} lede={goal} />

      {enrollmentPanel ? (
        // Both panels are server-rendered; the Tabs island only toggles
        // `hidden`, and `?tab=` picks the opening tab (same pattern as the
        // counselor student record).
        <Tabs items={ANALYTICS_TABS} defaultValue={initialTab} label="Analytics views" idBase="admin-analytics" urlParam="tab">
          <TabPanel value="engagement">{engagement}</TabPanel>
          <TabPanel value="enrollment">{enrollmentPanel}</TabPanel>
        </Tabs>
      ) : (
        engagement
      )}
    </DesignSurface>
  );
}
