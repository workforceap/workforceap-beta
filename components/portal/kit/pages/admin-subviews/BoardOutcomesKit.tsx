import type { ReactNode } from 'react';
import { FileSpreadsheet, Users, ArrowRight, FileText } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import {
  DesignSurface,
  KpiStrip,
  SectionHeader,
  BarChartMini,
  RankBars,
  type KpiItem,
  type ChartDatum,
  type RankDatum,
} from '@/components/portal/kit';

/**
 * Board Outcomes — the board-ready outcomes & metrics workspace (dense).
 * Mockup: workforceap-admin-suite.html "Outcomes & Metrics" view.
 * Target route: /admin/outcomes
 *
 * Pure read view — no interactivity, so no 'use client'.
 */
export interface FunderExport {
  /** Stable key + label, e.g. "Outcomes CSV". */
  label: string;
  /** Short description of what the export contains. */
  description: string;
  /** Where the export download is triggered (wire to a real endpoint later). */
  href: string;
}

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
  /** "Funder exports" list. */
  exports?: FunderExport[];
  /** Page header title. Defaults to the outcomes-view title. */
  title?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Page goal caption under the title. */
  goal?: string;
  /** Right-aligned header action (e.g. a "Generate report" button). */
  headerAction?: ReactNode;
  /**
   * Whether to render the "Funder exports" card. Defaults to `true` so the
   * existing /admin/outcomes view is unchanged; the board view can hide it.
   */
  showExports?: boolean;
}

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'Placement Rate', value: '68%', color: 'success' },
  { label: 'Avg Starting Wage', value: '$58k', color: 'text' },
  { label: 'Credentials Earned', value: 541, color: 'gold' },
  { label: '90-Day Retention', value: '84%', color: 'info' },
];

const DEFAULT_EXPORTS: FunderExport[] = [
  {
    label: 'Outcomes CSV',
    description: 'Placements, wages & retention by cohort — board-ready.',
    href: '/api/admin/outcomes/snapshot?format=csv',
  },
  {
    label: 'Board meeting PDF',
    description: 'Printable board packet with KPIs, cohorts, and data notes.',
    href: '/api/admin/outcomes/snapshot?format=pdf',
  },
  {
    label: 'Demographics report',
    description: 'Enrollment & outcomes broken out by demographic.',
    href: '/api/admin/outcomes/snapshot?format=md',
  },
];

function exportIcon(label: string) {
  if (label === 'Demographics report') return <Users size={18} aria-hidden />;
  if (label === 'Board meeting PDF') return <FileText size={18} aria-hidden />;
  return <FileSpreadsheet size={18} aria-hidden />;
}

export function BoardOutcomesKit({
  kpis = DEFAULT_KPIS,
  placementsByMonth = [],
  placementsTotal = 0,
  periodLabel = 'This period',
  byProgram = [],
  exports = DEFAULT_EXPORTS,
  title = 'Board Outcomes',
  kicker = 'Outcomes & Metrics',
  goal = 'Board-ready — everything in one place.',
  headerAction,
  showExports = true,
}: BoardOutcomesKitProps) {
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader title={title} kicker={kicker} goal={goal} action={headerAction} />

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

      {/* Funder exports */}
      {showExports && (
        <Card className="wa-mt-6">
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Funder exports
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginBottom: 16 }}>
            Download the files funders and the board ask for.
          </p>
          <div className="wa-space-y-2">
            {exports.map((exp) => (
              <ClickableCard key={exp.label} label={exp.label} href={exp.href} padding={3}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: 'var(--wa-accent-soft)',
                      color: 'var(--wa-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {exportIcon(exp.label)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{exp.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{exp.description}</div>
                  </div>
                  <ArrowRight size={16} aria-hidden style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
                </div>
              </ClickableCard>
            ))}
          </div>
        </Card>
      )}
    </DesignSurface>
  );
}
