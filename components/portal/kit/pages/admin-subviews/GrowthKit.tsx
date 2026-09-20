import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import {
  DesignSurface,
  KpiStrip,
  SectionHeader,
  RankBars,
  DataTable,
  type KpiItem,
  type RankDatum,
  type Column,
} from '@/components/portal/kit';

/**
 * Growth — paid-traffic sanity-check dashboard (dense kit treatment).
 * Target route: /admin/growth
 *
 * Pure read view — no interactivity, so no 'use client'.
 *
 * Composition mirrors AnalyticsKit / BoardOutcomesKit: SectionHeader +
 * KpiStrip + RankBars/DataTable panels. The page supplies real lean data;
 * defaults keep standalone renders sensible and give graceful empty states.
 *
 * Real data sources (from app/admin/growth/page.tsx):
 *   - KPIs: 7d signups (apply_signup_completed), 24h apply_* attempts,
 *     24h member logins, distinct UTM sources (7d).
 *   - RankBars: signups by UTM source (7d).
 *   - DataTable (signups): UTM source/medium/campaign breakdown (7d).
 *   - DataTable (apply events): apply_* MemberEvents (24h).
 *   - DataTable (conversion values): USD values forwarded to Google Ads.
 *   GA4 apply_funnel / login funnel drop-off is dataLayer-only and not
 *   queryable server-side — omitted here (linked out via headerAction).
 */
export interface GrowthUtmRow {
  source: string;
  medium: string;
  campaign: string;
  count: number;
  /** ISO-ish "YYYY-MM-DD HH:mm UTC" timestamp string of the latest signup. */
  latest: string;
}

export interface GrowthApplyEventRow {
  eventName: string;
  count: number;
}

export interface GrowthConversionValueRow {
  name: string;
  valueUsd: number;
}

export interface GrowthKitProps {
  /** Headline KPI tiles. */
  kpis?: KpiItem[];
  /** Signups grouped by UTM source (7d) for the ranked bars. */
  signupsBySource?: RankDatum[];
  /** Full UTM source/medium/campaign breakdown rows (7d). */
  utmRows?: GrowthUtmRow[];
  /** apply_* MemberEvents in the last 24h. */
  applyEvents?: GrowthApplyEventRow[];
  /** Conversion values (USD) forwarded to Google Ads. */
  conversionValues?: GrowthConversionValueRow[];
  /** Page header title. */
  title?: string;
  /** Page goal/subtitle caption under the title. */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Right-aligned header action (e.g. an "Open GA4 dashboard" link). */
  headerAction?: ReactNode;
}

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'Signups (7d)', value: 0, color: 'success' },
  { label: 'Apply Events (24h)', value: 0, color: 'accent' },
  { label: 'Logins (24h)', value: 0, color: 'info' },
  { label: 'UTM Sources (7d)', value: 0, color: 'gold' },
];

const EMPTY_HINT = (
  <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>No data for this period yet.</p>
);

const UTM_COLUMNS: Column<GrowthUtmRow>[] = [
  { key: 'source', header: 'Source' },
  { key: 'medium', header: 'Medium' },
  { key: 'campaign', header: 'Campaign' },
  { key: 'count', header: 'Count', align: 'right', render: (r) => r.count.toLocaleString('en-US') },
  { key: 'latest', header: 'Latest signup' },
];

const APPLY_COLUMNS: Column<GrowthApplyEventRow>[] = [
  {
    key: 'eventName',
    header: 'Event name',
    render: (r) => <code style={{ fontSize: 13 }}>{r.eventName}</code>,
  },
  {
    key: 'count',
    header: 'Count',
    align: 'right',
    render: (r) => r.count.toLocaleString('en-US'),
  },
];

const CONVERSION_COLUMNS: Column<GrowthConversionValueRow>[] = [
  {
    key: 'name',
    header: 'Conversion',
    render: (r) => <code style={{ fontSize: 13 }}>{r.name}</code>,
  },
  {
    key: 'valueUsd',
    header: 'Value (USD)',
    align: 'right',
    render: (r) => `$${r.valueUsd.toLocaleString('en-US')}`,
  },
];

export function GrowthKit({
  kpis = DEFAULT_KPIS,
  signupsBySource,
  utmRows,
  applyEvents,
  conversionValues,
  title = 'Growth',
  goal = 'Day-1 sanity check that paid-traffic signups & funnel events are flowing.',
  kicker = 'Paid Traffic',
  headerAction,
}: GrowthKitProps) {
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader title={title} kicker={kicker} goal={goal} action={headerAction} />

      <KpiStrip cols={4} items={kpis} />

      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-5 wa-mt-6">
        {/* Signups by UTM source (last 7 days). `minWidth: 0` lets this grid
            column shrink to the viewport on phones; RankBars are %-width. */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>
            Signups by source
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
            last 7 days · apply_signup_completed
          </p>
          {signupsBySource && signupsBySource.length > 0 ? (
            <RankBars data={signupsBySource} />
          ) : (
            EMPTY_HINT
          )}
        </Card>

        {/* apply_* MemberEvents (last 24h). */}
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>
            Apply events
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
            last 24h · every server-recorded apply_* event
          </p>
          <DataTable<GrowthApplyEventRow>
            columns={APPLY_COLUMNS}
            rows={applyEvents ?? []}
            rowKey={(r) => r.eventName}
            mobile="scroll"
            minWidth={360}
            emptyTitle="No apply_* events"
            emptyDescription="Nothing recorded in the last 24 hours."
          />
        </Card>
      </div>

      {/* Signups by UTM source / medium / campaign (last 7 days). */}
      <Card className="wa-mt-6" style={{ minWidth: 0 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>
          Signups by UTM breakdown
        </h3>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
          last 7 days · grouped by source / medium / campaign
        </p>
        <DataTable<GrowthUtmRow>
          columns={UTM_COLUMNS}
          rows={utmRows ?? []}
          rowKey={(r) => `${r.source}|${r.medium}|${r.campaign}`}
          mobile="scroll"
          minWidth={620}
          emptyTitle="No signups in the last 7 days"
          emptyDescription="No apply_signup_completed events recorded for this period."
        />
      </Card>

      {/* Conversion values forwarded to Google Ads. */}
      <Card className="wa-mt-6" style={{ minWidth: 0 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 2 }}>
          Conversion values
        </h3>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 0, marginBottom: 16 }}>
          USD values forwarded with each conversion so the bid optimizer can learn CPA → LTV
        </p>
        <DataTable<GrowthConversionValueRow>
          columns={CONVERSION_COLUMNS}
          rows={conversionValues ?? []}
          rowKey={(r) => r.name}
          mobile="scroll"
          minWidth={360}
          emptyTitle="No conversion values configured"
        />
      </Card>
    </DesignSurface>
  );
}
