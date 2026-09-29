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
import type { CronFreshness } from '@/lib/cron/cronFreshness';

/**
 * Cron monitor — scheduled-job health rendered as a dense roster.
 * Mockup: workforceap-admin-full.html "crons" view.
 * Target route: /admin/crons
 *
 * One row per distinct cron job (its latest execution). Columns:
 * Job · Schedule · Last run · Duration · Status. Status maps the
 * CronExecution status onto a StatusTag (Success=ok, Failed=danger,
 * Disabled/idle=muted). A warn tag beside it flags a scheduled job whose
 * last success is more than twice its interval old ("Overdue · last success
 * 3h ago"), and a scheduled job with no recorded run shows "Never run" in
 * place of a status (lib/cron/cronFreshness.ts). Server-rendered: all aggregation happens in the
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
  /** Latest run's status, or null when the job has never recorded a run. */
  status: CronDisplayStatus | null;
  /** Whether the job is still succeeding on schedule (lib/cron/cronFreshness.ts). */
  freshness: CronFreshness;
  /** Relative caption of the last SUCCESS (e.g. "3h ago"), or "—" when it has none. */
  lastSuccess: string;
}

export interface CronsMonitorKitProps {
  jobs: CronJobRow[];
  /** Total distinct cron jobs (KPI). */
  totalJobs: number;
  /** Jobs whose latest run succeeded (KPI "Last run OK"). */
  enabled: number;
  /** Jobs flagged overdue (KPI). Defaults to the count in `jobs`. */
  overdue?: number;
  /** Scheduled jobs that have never recorded a run (KPI caption). Defaults to the count in `jobs`. */
  neverRun?: number;
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

function freshnessLabel(row: CronJobRow): string | null {
  if (row.freshness === 'never_run') return 'Never run';
  if (row.freshness !== 'overdue') return null;
  return row.lastSuccess === '—' ? 'Overdue · no successful run' : `Overdue · last success ${row.lastSuccess}`;
}

function StatusTagFor({ row }: { row: CronJobRow }) {
  return row.status ? <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag> : null;
}

function FreshnessTag({ row }: { row: CronJobRow }) {
  const flag = freshnessLabel(row);
  return flag ? <StatusTag tone="warn">{flag}</StatusTag> : null;
}

function StatusCell({ row }: { row: CronJobRow }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
      <StatusTagFor row={row} />
      <FreshnessTag row={row} />
    </span>
  );
}

export function CronsMonitorKit({
  jobs,
  totalJobs,
  enabled,
  overdue = jobs.filter((j) => j.freshness === 'overdue').length,
  neverRun = jobs.filter((j) => j.freshness === 'never_run').length,
  failing,
  lastRun,
}: CronsMonitorKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total Jobs', value: totalJobs },
    { label: 'Last run OK', value: enabled },
    {
      label: 'Overdue',
      value: overdue,
      tone: overdue > 0 || neverRun > 0 ? 'warn' : undefined,
      delta: neverRun > 0 ? `${neverRun} never run` : undefined,
      deltaTone: 'warn',
    },
    { label: 'Failing', value: failing, tone: failing > 0 ? 'danger' : undefined },
    { label: 'Last Run', value: lastRun },
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
      render: (row) => <StatusCell row={row} />,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title="Cron Monitor" kicker="System" lede="Scheduled jobs" />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} cols={5} />
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
                    fontSize: 13,
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
                {row.status ? <StatusTagFor row={row} /> : <FreshnessTag row={row} />}
              </div>
            </div>
            {row.status && freshnessLabel(row) ? (
              <div style={{ marginTop: 8 }}>
                <FreshnessTag row={row} />
              </div>
            ) : null}
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
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {jobs.length} of {totalJobs}
      </p>
    </DesignSurface>
  );
}
