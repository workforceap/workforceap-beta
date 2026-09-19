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

/**
 * Cron monitor — scheduled-job health rendered as a dense roster.
 * Mockup: workforceap-admin-full.html "crons" view.
 * Target route: /admin/crons
 *
 * One row per distinct cron job (its latest execution). Columns:
 * Job · Schedule · Last run · Duration · Status. Status maps the
 * CronExecution status onto a StatusTag (Success=ok, Failed=danger,
 * Disabled/idle=muted). Server-rendered: all aggregation happens in the
 * page loader and lands here as plain data. DataTable mobile="cards" so the
 * wide table stacks instead of squishing on mobile.
 */

/**
 * Display status mapped from the underlying CronExecution status.
 * `Failed` (not `Retrying`) — CronExecution has no retry/attempt tracking, so
 * a FAILED run has no evidence a retry is actually happening; the next run is
 * just the next scheduled invocation. Labeling it "Retrying" overstated the
 * system's actual behavior.
 */
export type CronDisplayStatus = 'Success' | 'Failed' | 'Running' | 'Disabled';

export interface CronJobRow {
  id: string;
  /** Job name (machine identifier, mono). */
  job: string;
  /** Human schedule caption (e.g. "Every 15 min") or "—" when not tracked. */
  schedule: string;
  /** Relative last-run caption (e.g. "3 min ago") or "—". */
  lastRun: string;
  /** Duration caption (e.g. "2.4s") or "—". */
  duration: string;
  status: CronDisplayStatus;
}

export interface CronsMonitorKitProps {
  jobs: CronJobRow[];
  /** Total distinct cron jobs (KPI). */
  totalJobs: number;
  /** Jobs whose latest run succeeded (KPI). */
  enabled: number;
  /** Jobs currently failing / retrying (KPI). */
  failing: number;
  /** Relative caption of the most recent run across all jobs, or "—". */
  lastRun: string;
}

const STATUS_TONE: Record<CronDisplayStatus, KitTone> = {
  Success: 'ok',
  // 'danger' (not 'alert') per the KitTone doc: reserved for failed/destructive states.
  Failed: 'danger',
  Running: 'info',
  Disabled: 'muted',
};

export function CronsMonitorKit({
  jobs,
  totalJobs,
  enabled,
  failing,
  lastRun,
}: CronsMonitorKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total Jobs', value: totalJobs },
    { label: 'Enabled', value: enabled, color: 'success' },
    { label: 'Failing', value: failing, color: failing > 0 ? 'accent' : 'muted' },
    { label: 'Last Run', value: lastRun, color: 'info' },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const columns: Column<CronJobRow>[] = [
    {
      key: 'job',
      header: 'Job',
      render: (row) => (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13 }}>
          {row.job}
        </span>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.schedule}</span>,
    },
    {
      key: 'lastRun',
      header: 'Last run',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.lastRun}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.duration}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title="Cron Monitor" kicker="System" lede="Scheduled jobs" />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<CronJobRow>
        columns={columns}
        rows={jobs}
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
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 700,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.job}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.schedule}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span>
                Last run <b style={{ color: 'var(--wa-text)' }}>{row.lastRun}</b>
              </span>
              <span style={numStyle}>
                Duration <b style={{ color: 'var(--wa-text)' }}>{row.duration}</b>
              </span>
            </div>
          </div>
        )}
        emptyTitle="No cron executions yet"
        emptyDescription="Scheduled jobs will appear here after their first run is recorded."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {jobs.length} of {totalJobs}
      </p>
    </DesignSurface>
  );
}
