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
 * Metrics — the raw platform metrics workspace (dense).
 * Mockup: workforceap-admin-full.html "Metrics" view.
 * Target route: /admin/metrics
 *
 * Pure read view — no interactivity, so no 'use client'.
 *
 * NOTE on data: the mockup's KPI strip shows infra latency/uptime numbers
 * (API p50/p99, error rate, uptime). The admin metrics module has no real
 * source for those infra figures, so the page passes "—" for any it can't
 * derive rather than fabricating them. The "Requests by surface" bars and any
 * KPI that maps to a real count (e.g. AI tool runs / events) use live data.
 */
export interface MetricsKitProps {
  /** Headline KPI tiles (API p50 / p99 / Error rate / Uptime 30d). */
  kpis?: KpiItem[];
  /** "Requests by surface (last 24h)" ranked bars. */
  bySurface?: RankDatum[];
  /** Subtitle/caption under the "Requests by surface" card. */
  surfaceCaption?: string;
  /** Page header title. */
  title?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Page goal caption under the title. */
  goal?: string;
  /** Right-aligned header action (e.g. an export button). */
  headerAction?: ReactNode;
}

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'API p50', value: '—' },
  { label: 'API p99', value: '—' },
  { label: 'Error rate', value: '—' },
  { label: 'Uptime 30d', value: '—' },
];

const DEFAULT_BY_SURFACE: RankDatum[] = [
  { label: 'Member portal', value: '—', pct: 0, tone: 'info' },
  { label: 'Admin', value: '—', pct: 0, tone: 'info' },
  { label: 'API / webhooks', value: '—', pct: 0, tone: 'info' },
];

export function MetricsKit({
  kpis = DEFAULT_KPIS,
  bySurface = DEFAULT_BY_SURFACE,
  surfaceCaption = 'last 24h',
  title = 'Metrics',
  kicker,
  goal = 'Raw platform metrics',
  headerAction,
}: MetricsKitProps) {
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} kicker={kicker ?? 'Admin'} lede={goal} action={headerAction} />

      <KpiStrip items={kpis} />

      <div className="wa-mt-6">
        {/* RankBars are %-width, so they stay within the card at any width;
            `minWidth: 0` guards against grid/flex overflow on phones. */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>
            Requests by surface
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2, marginBottom: 20 }}>
            {surfaceCaption}
          </p>
          <RankBars data={bySurface} />
        </Card>
      </div>
    </DesignSurface>
  );
}
