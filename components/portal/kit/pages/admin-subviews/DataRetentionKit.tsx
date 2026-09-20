import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  StatusTag,
  type Column,
  type KpiItem,
  type KitTone,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';

/**
 * Data retention — policies, storage usage & cleanup history (dense).
 * No mockup: consistent light dense-kit treatment for an ops/policy page.
 * Target route: /admin/data-retention (default kit view).
 *
 * Server-rendered (no interactivity): all aggregation happens in the page
 * loader and lands here as plain data. The interactive "Run Cleanup Now"
 * purge action lives in the legacy client view (?ui=legacy) — it is NOT
 * reproduced here so this stays a read-only server module.
 */
export interface StorageRow {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  sizeHuman: string;
}

export interface PolicyRow {
  model: string;
  description: string;
  days: number;
  cutoffDate: string;
  estimatedRows: number;
}

export interface RunRow {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number | null;
  errorMessage: string | null;
}

export interface DataRetentionKitProps {
  storage: StorageRow[];
  policies: PolicyRow[];
  recentRuns: RunRow[];
}

/** Cleanup run status → semantic tone. */
const STATUS_TONE: Record<string, KitTone> = {
  SUCCESS: 'ok',
  FAILED: 'alert',
  RUNNING: 'info',
  SKIPPED: 'warn',
};

const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

function formatRetention(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years}y`;
  }
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  return `${days}d`;
}

export function DataRetentionKit({ storage, policies, recentRuns }: DataRetentionKitProps) {
  const totalSizeBytes = storage.reduce((sum, s) => sum + s.sizeBytes, 0);
  const totalSizeHuman =
    totalSizeBytes > 0 ? `${(totalSizeBytes / 1024 / 1024).toFixed(1)} MB` : '—';
  const totalExpired = policies.reduce((sum, p) => sum + p.estimatedRows, 0);

  const kpis: KpiItem[] = [
    { label: 'Tables Monitored', value: storage.length },
    { label: 'Total Size', value: totalSizeHuman },
    { label: 'Rows Eligible for Purge', value: totalExpired.toLocaleString(), tone: totalExpired > 0 ? 'alert' : undefined },
    { label: 'Recent Runs', value: recentRuns.length },
  ];

  const policyColumns: Column<PolicyRow>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.model}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)', fontSize: 13 }}>{row.description}</span>
      ),
    },
    {
      key: 'days',
      header: 'Retention',
      align: 'right',
      render: (row) => <span style={numStyle}>{formatRetention(row.days)}</span>,
    },
    {
      key: 'cutoff',
      header: 'Cutoff',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>
          {new Date(row.cutoffDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'estimated',
      header: 'Expired rows',
      align: 'right',
      render: (row) => (
        <span
          style={{
            ...numStyle,
            fontWeight: 700,
            color: row.estimatedRows > 0 ? 'var(--wa-accent)' : 'var(--wa-muted)',
          }}
        >
          {row.estimatedRows.toLocaleString()}
        </span>
      ),
    },
  ];

  const storageColumns: Column<StorageRow>[] = [
    {
      key: 'table',
      header: 'Table',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.tableName}</span>,
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (row) => <span style={numStyle}>{row.rowCount.toLocaleString()}</span>,
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.sizeHuman}</span>
      ),
    },
  ];

  const runColumns: Column<RunRow>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusTag tone={STATUS_TONE[row.status] ?? 'muted'}>{row.status}</StatusTag>
      ),
    },
    {
      key: 'started',
      header: 'Started',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)', fontSize: 13 }}>
          {new Date(row.startedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'records',
      header: 'Records deleted',
      align: 'right',
      render: (row) => (
        <span style={numStyle}>
          {row.recordsProcessed != null ? row.recordsProcessed.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) =>
        row.errorMessage ? (
          <span style={{ color: 'var(--wa-accent)', fontSize: 13 }}>{row.errorMessage}</span>
        ) : (
          <span style={{ color: 'var(--wa-muted)' }}>—</span>
        ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Data Retention"
        kicker="System"
        lede="Keep log & telemetry tables within their retention windows for WIOA / 20 CFR 677 compliance"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <div className="wa-mb-5">
        <h3 className="wa-text-sm wa-font-bold wa-mb-3" style={{ color: 'var(--wa-text)' }}>
          Retention Policies
        </h3>
        <DataTable<PolicyRow>
          columns={policyColumns}
          rows={policies}
          rowKey={(row) => row.model}
          minWidth={640}
          mobile="cards"
          cardRender={(row) => (
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span style={{ fontWeight: 700 }}>{row.model}</span>
                <span style={numStyle}>{formatRetention(row.days)}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '6px 0 10px' }}>
                {row.description}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--wa-muted)',
                }}
              >
                <span style={numStyle}>
                  Cutoff{' '}
                  <b style={{ color: 'var(--wa-text)' }}>
                    {new Date(row.cutoffDate).toLocaleDateString()}
                  </b>
                </span>
                <span style={numStyle}>
                  Expired{' '}
                  <b style={{ color: row.estimatedRows > 0 ? 'var(--wa-accent)' : 'var(--wa-text)' }}>
                    {row.estimatedRows.toLocaleString()}
                  </b>
                </span>
              </div>
            </Card>
          )}
          emptyTitle="No policies configured"
          emptyDescription="Retention policies are defined in lib/retention/config.ts."
        />
      </div>

      <div className="wa-mb-5">
        <h3 className="wa-text-sm wa-font-bold wa-mb-3" style={{ color: 'var(--wa-text)' }}>
          Storage Usage
        </h3>
        <DataTable<StorageRow>
          columns={storageColumns}
          rows={storage}
          rowKey={(row) => row.tableName}
          minWidth={420}
          mobile="cards"
          cardRender={(row) => (
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 0 }}>{row.tableName}</span>
                <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.sizeHuman}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 6 }}>
                <span style={numStyle}>
                  Rows <b style={{ color: 'var(--wa-text)' }}>{row.rowCount.toLocaleString()}</b>
                </span>
              </div>
            </Card>
          )}
          emptyTitle="No storage data"
          emptyDescription="Table statistics are unavailable for the monitored tables."
        />
      </div>

      <div>
        <h3 className="wa-text-sm wa-font-bold wa-mb-3" style={{ color: 'var(--wa-text)' }}>
          Cleanup Run History
        </h3>
        <DataTable<RunRow>
          columns={runColumns}
          rows={recentRuns}
          rowKey={(row) => row.id}
          minWidth={620}
          mobile="cards"
          cardRender={(row) => (
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <StatusTag tone={STATUS_TONE[row.status] ?? 'muted'}>{row.status}</StatusTag>
                <span style={{ ...numStyle, fontSize: 13, color: 'var(--wa-muted)' }}>
                  {new Date(row.startedAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 8 }}>
                <span style={numStyle}>
                  Deleted{' '}
                  <b style={{ color: 'var(--wa-text)' }}>
                    {row.recordsProcessed != null ? row.recordsProcessed.toLocaleString() : '—'}
                  </b>
                </span>
                {row.errorMessage ? (
                  <p style={{ color: 'var(--wa-accent)', margin: '6px 0 0' }}>{row.errorMessage}</p>
                ) : null}
              </div>
            </Card>
          )}
          emptyTitle="No cleanup runs yet"
          emptyDescription="The data_cleanup job has not run, or its history has been pruned."
        />
      </div>

      <p
        style={{
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
          lineHeight: 1.6,
        }}
      >
        Member records are never auto-deleted — only log/telemetry tables are in scope. To run the
        cleanup job manually, open the{' '}
        <a
          href="/admin/data-retention?ui=legacy"
          className="wa-kit-focus"
          style={{ color: 'var(--wa-accent)', fontWeight: 700 }}
        >
          legacy view
        </a>
        .
      </p>
    </DesignSurface>
  );
}
