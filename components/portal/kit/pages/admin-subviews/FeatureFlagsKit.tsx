import type { ReactNode } from 'react';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  KitEmptyState,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import FeatureFlagToggle from './FeatureFlagToggle';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/**
 * Feature flags — admin rollout registry rendered as a dense table.
 * No mockup: consistent dense-kit treatment derived from the kit vocabulary
 * (SectionHeader + KpiStrip + DataTable + StatusTag), mirroring JobsBoardKit /
 * CounselorsRosterKit.
 * Target route: /admin/feature-flags
 *
 * Columns: Flag · Description · State · Updated.
 * State is a kit Toggle island (FeatureFlagToggle) that PATCHes the existing
 * `/api/admin/feature-flags/[id]` route — same request, same server guard —
 * and reads On/Off from the server-rendered flag. Create,
 * rollout % and role gating still live in the legacy workspace (?ui=legacy).
 * With no flags the table gives way to one kit empty state whose CTA opens
 * that workspace.
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
  /** Optional notice under the opener (e.g. org-wide warning for non-super admins). */
  notice?: ReactNode;
}

export function FeatureFlagsKit({
  flags,
  total,
  on,
  off,
  recentlyChanged,
  notice,
}: FeatureFlagsKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total Flags', value: total },
    { label: 'On', value: on },
    { label: 'Off', value: off },
    { label: 'Changed (7d)', value: recentlyChanged },
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
        <FeatureFlagToggle id={row.id} name={row.name} enabled={row.enabled} />
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
      <PageOpener className="wa-mb-5"
        title="Feature Flags"
        kicker="Platform"
        lede="Gradual rollout & role-gating of platform features"
        action={
          <KitLinkButton href="/admin/feature-flags?ui=legacy" label="Manage" variant="primary" size="sm" />
        }
      />

      {notice}

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {flags.length === 0 ? (
        <section className="wa-kit-card" aria-label="No feature flags">
          <KitEmptyState
            headingAs="h2"
            title="No feature flags yet"
            description="Create a flag to start rolling out features gradually. Flags apply to every member, counselor, employer and partner portal in this organization."
            action={
              <KitLinkButton href="/admin/feature-flags?ui=legacy" label="Create a flag" variant="primary" size="sm" />
            }
          />
        </section>
      ) : (
      <>
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
                <FeatureFlagToggle id={row.id} name={row.name} enabled={row.enabled} />
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
      </>
      )}
    </DesignSurface>
  );
}
