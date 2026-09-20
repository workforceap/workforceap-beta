import Link from 'next/link';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import {
  DesignSurface,
  SectionHeader,
  KpiStrip,
  DataTable,
  StatusTag,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';

/**
 * Feature flags — admin rollout registry rendered as a dense table.
 * No mockup: consistent dense-kit treatment derived from the kit vocabulary
 * (SectionHeader + KpiStrip + DataTable + StatusTag), mirroring JobsBoardKit /
 * CounselorsRosterKit.
 * Target route: /admin/feature-flags
 *
 * Columns: Flag · Description · State · Updated.
 * State is a StatusTag (On=ok, Off=muted). Server-rendered (read-only); the
 * interactive create/toggle/edit workspace lives behind ?ui=legacy.
 */
export interface FeatureFlagRow {
  id: string;
  /** Human-readable flag name. */
  name: string;
  /** Stable flag key, e.g. "coursera-v2". */
  key: string;
  /** Optional description; "—" when absent. */
  description: string;
  enabled: boolean;
  /** Rollout percentage (0–100). */
  rolloutPercentage: number;
  /** Pre-formatted "updated" caption, e.g. "Jun 18" or "—". */
  updated: string;
}

export interface FeatureFlagsKitProps {
  flags: FeatureFlagRow[];
  /** Total flags. */
  total: number;
  /** Flags currently on (enabled). */
  on: number;
  /** Flags currently off (disabled). */
  off: number;
  /** Flags changed within the recent window (e.g. last 7 days). */
  recentlyChanged: number;
}

export function FeatureFlagsKit({
  flags,
  total,
  on,
  off,
  recentlyChanged,
}: FeatureFlagsKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total Flags', value: total },
    { label: 'On', value: on, color: 'success' },
    { label: 'Off', value: off, color: 'muted' },
    { label: 'Changed (7d)', value: recentlyChanged, color: 'info' },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const FlagCell = ({ row }: { row: FeatureFlagRow }) => (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.name}
      </div>
      <code
        style={{
          fontSize: 13,
          color: 'var(--wa-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        {row.key}
      </code>
    </div>
  );

  const columns: Column<FeatureFlagRow>[] = [
    { key: 'name', header: 'Flag', render: (row) => <FlagCell row={row} /> },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span
          style={{
            color: 'var(--wa-muted)',
            display: 'block',
            maxWidth: 360,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.description}
        </span>
      ),
    },
    {
      key: 'enabled',
      header: 'State',
      render: (row) => (
        <StatusTag tone={row.enabled ? 'ok' : 'muted'}>
          {row.enabled ? 'On' : 'Off'}
        </StatusTag>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.updated}</span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Feature Flags"
        kicker="Platform"
        goal="Gradual rollout & role-gating of platform features"
        action={
          <AstryxLink href="/admin/feature-flags?ui=legacy" as={Link as never} isStandalone>
            <Button label="Manage" variant="primary" size="sm" />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<FeatureFlagRow>
        columns={columns}
        rows={flags}
        rowKey={(row) => row.id}
        minWidth={680}
        mobile="cards"
        cardRender={(row) => (
          <div className="wa-kit-card wa-kit-card--sm">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <FlagCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatusTag tone={row.enabled ? 'ok' : 'muted'}>
                  {row.enabled ? 'On' : 'Off'}
                </StatusTag>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {row.description}
              </span>
              <span style={{ ...numStyle, whiteSpace: 'nowrap' }}>{row.updated}</span>
            </div>
          </div>
        )}
        emptyTitle="No feature flags yet"
        emptyDescription="Create a flag to start rolling out features gradually."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {flags.length} of {total}
      </p>
    </DesignSurface>
  );
}
