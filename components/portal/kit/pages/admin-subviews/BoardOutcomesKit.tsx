import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Download } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import {
  KpiStrip,
  BarChartMini,
  RankBars,
  type KpiItem,
  type ChartDatum,
  type RankDatum,
} from '@/components/portal/kit';
import { EmbeddableFrame } from './EmbeddableFrame';

/**
 * Board Outcomes — the board-ready outcomes & metrics workspace (dense).
 * Mockup: workforceap-admin-suite.html "Outcomes & Metrics" view.
 * Target route: /admin/outcomes
 *
 * Pure read view — no interactivity, so no 'use client'.
 */

/** Every funder / board file lives on one page; this view links there. */
export const ADMIN_EXPORTS_HREF = '/admin/exports';

export interface BoardOutcomesKitProps {
  /** Headline KPI tiles. Defaults from the mockup. */
  kpis?: KpiItem[];
  /** "Placements by month" bar chart data. */
  placementsByMonth?: ChartDatum[];
  /** Total placements caption for the chart subtitle. */
  placementsTotal?: number;
  /** Reporting period label (chart subtitle + page caption). */
  periodLabel?: string;
  /** "By program" ranked bars. */
  byProgram?: RankDatum[];
  /** Page header title. Defaults to the outcomes-view title. */
  title?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Page goal caption under the title. */
  goal?: string;
  /** Right-aligned header action (e.g. a "Generate report" button). */
  headerAction?: ReactNode;
  /**
   * Whether to render the "Funder exports" pointer (one link to
   * `/admin/exports`, where every file is listed once). Defaults to `true`;
   * the board view hides it.
   */
  showExports?: boolean;
  /** Where the exports pointer goes; the reporting hub points at its own Exports tab. */
  exportsHref?: string;
  /** Mount inside a hub tab: no page surface, no opener (the hub owns the h1). */
  embedded?: boolean;
}

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'Placement Rate', value: '68%' },
  { label: 'Avg Starting Wage', value: '$58k' },
  { label: 'Credentials Earned', value: 541 },
  { label: '90-Day Retention', value: '84%' },
];

export function BoardOutcomesKit({
  kpis = DEFAULT_KPIS,
  placementsByMonth = [],
  placementsTotal = 0,
  periodLabel = 'This period',
  byProgram = [],
  title = 'Board Outcomes',
  kicker = 'Outcomes & Metrics',
  goal = 'Board-ready — everything in one place.',
  headerAction,
  showExports = true,
  exportsHref = ADMIN_EXPORTS_HREF,
  embedded = false,
}: BoardOutcomesKitProps) {
  return (
    <EmbeddableFrame embedded={embedded} title={title} kicker={kicker ?? 'Admin'} lede={goal} action={headerAction}>
      <KpiStrip cols={4} items={kpis} />

      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5 wa-mt-6">
        {/* Placements by month. `minWidth: 0` lets this grid column shrink to
            the viewport on phones — grid items default to `min-width: auto`,
            which can otherwise let the flex bar row force horizontal overflow.
            The chart itself is fluid (flex:1 bars + height only), so it stays
            in width and desktop is unchanged. */}
        <Card className="lg:wa-col-span-2" style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>
            Placements by month
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2, marginBottom: 20 }}>
            {periodLabel} · {placementsTotal} total
          </p>
          {placementsByMonth.length > 0 ? (
            <BarChartMini data={placementsByMonth} highlightLast height={176} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', padding: '48px 0', textAlign: 'center' }}>
              No placements recorded for this period yet.
            </p>
          )}
        </Card>

        {/* By program — same `minWidth: 0` guard; RankBars are %-width, so
            they stay within the column at any phone width. */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 16 }}>
            By program
          </h3>
          {byProgram.length > 0 ? (
            <RankBars data={byProgram} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', padding: '32px 0', textAlign: 'center' }}>
              No placements by program yet.
            </p>
          )}
        </Card>
      </div>

      {/* Funder exports live on /admin/exports (one list, one verb per row);
          this page only points there instead of keeping its own copy
          (admin audit 2026-09-20, Outcomes). */}
      {showExports && (
        <Card className="wa-mt-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="wa-kit-tone-icon" aria-hidden>
              <Download size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>Funder exports</h3>
              <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>
                Outcomes CSV, the board packet and every other file funders ask for are on the Exports page.
              </p>
            </div>
            <Link
              href={exportsHref}
              className="wa-kit-focus"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
            >
              Open exports
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </Card>
      )}
    </EmbeddableFrame>
  );
}
