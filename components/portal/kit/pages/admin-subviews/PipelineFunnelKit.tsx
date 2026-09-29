import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import {
  DesignSurface,
  KpiStrip,
  PageOpener,
  RankBars,
  type KpiItem,
  type RankDatum,
} from '@/components/portal/kit';

/**
 * Applications funnel — where applicants drop off.
 * Mockup: workforceap-admin-full.html "pipeline" view.
 * Target route: /admin/pipeline
 *
 * A single RankBars panel walks the five funnel stages (Started → Active),
 * each bar's `pct` set to stage/total*100 so the bars read as a drop-off
 * funnel against the top-of-funnel total. Pure read view — no interactivity,
 * so no 'use client'.
 */
export interface PipelineFunnelKitProps {
  /** Optional headline KPI tiles (top-of-funnel counts). */
  kpis?: KpiItem[];
  /** Funnel stage bars (Started application → Active). */
  funnel?: RankDatum[];
  /** Caption under the funnel card title (e.g. "last 90 days"). */
  funnelSubtitle?: string;
  /** Funnel card title. */
  funnelTitle?: string;
  /** Page header title. */
  title?: string;
  /** Page goal caption under the title. */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Right-aligned header action. */
  headerAction?: ReactNode;
  /** Extra sections rendered under the funnel (e.g. stale applications). */
  children?: ReactNode;
}

const DEFAULT_FUNNEL: RankDatum[] = [
  { label: 'Started application', value: '1,204', pct: 100, tone: 'info' },
  { label: 'Completed intake', value: '968', pct: 80, tone: 'info' },
  { label: 'Eligibility cleared', value: '847', pct: 70, tone: 'info' },
  { label: 'Enrolled', value: '724', pct: 60, tone: 'ok' },
  { label: 'Active', value: '612', pct: 51, tone: 'ok' },
];

export function PipelineFunnelKit({
  kpis,
  funnel = DEFAULT_FUNNEL,
  funnelSubtitle = 'last 90 days',
  funnelTitle = 'Funnel',
  title = 'Applications funnel',
  goal,
  kicker,
  headerAction,
  children,
}: PipelineFunnelKitProps) {
  const hasData = funnel.length > 0;
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} lede={goal} kicker={kicker ?? 'Applications'} action={headerAction} />

      {kpis && kpis.length > 0 ? (
        <KpiStrip cols={kpis.length === 5 ? 5 : 4} items={kpis} />
      ) : null}

      <div className="wa-mt-6">
        <Card style={{ minWidth: 0 }}>
          <h2 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>{funnelTitle}</h2>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2, marginBottom: 20 }}>
            {funnelSubtitle}
          </p>
          {hasData ? (
            <RankBars data={funnel} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
              No applicants in this window yet.
            </p>
          )}
        </Card>
      </div>

      {children ? <div className="wa-mt-6">{children}</div> : null}
    </DesignSurface>
  );
}
