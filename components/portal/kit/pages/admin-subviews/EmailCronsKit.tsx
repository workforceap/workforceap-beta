import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { EmailCronRowActions } from './EmailCronRowActions';

/**
 * Email & cron management — automated email/workflow jobs rendered as a dense
 * roster. Sibling of the CronsMonitorKit "crons" view, but sourced from the
 * static CRON_REGISTRY joined with the latest WorkflowDiagnostic run per job.
 * Target route: /admin/email-crons
 *
 * One row per registered cron. Columns: Email job · Schedule · Last run ·
 * Status. Status folds the registry `enabled` flag and the latest run status
 * onto an Astryx Token (Success=green, Failed=red, Disabled=gray,
 * Pending=blue). All aggregation happens in the page loader and lands here
 * as plain data. DataTable mobile="cards" so the wide table stacks instead
 * of squishing. With `manageable`, each row gets Enable/Disable, Dry run and
 * Send now (EmailCronRowActions), which used to live only on ?ui=legacy
 * (WAP-193).
 */

/**
 * Display status mapped from the underlying job state.
 * `Failed` (not `Retrying`) — WorkflowDiagnostic has no retry/attempt
 * tracking, so an errored run has no evidence a retry is actually happening.
 */
export type EmailCronDisplayStatus =
  | 'Success'
  | 'Failed'
  | 'Disabled'
  | 'Pending';

export interface EmailCronRow {
  id: string;
  /** Job display name. */
  job: string;
  /** Human schedule caption (e.g. "Sunday 6PM UTC"). */
  schedule: string;
  /** Relative last-run caption (e.g. "3h ago") or "—" when never run. */
  lastRun: string;
  status: EmailCronDisplayStatus;
  /** Registry enabled flag (drives the Enable/Disable action). */
  enabled?: boolean;
}

export interface EmailCronsKitProps {
  jobs: EmailCronRow[];
  /** Total registered email/cron jobs (KPI). */
  totalJobs: number;
  /** Jobs currently enabled (KPI). */
  enabled: number;
  /** Jobs whose latest run failed (KPI). */
  failing: number;
  /** Relative caption of the most recent run across all jobs, or "—". */
  lastRun: string;
  /** Per-row Enable/Disable, Dry run and Send now. */
  manageable?: boolean;
  /** Optional notice under the opener (e.g. CRON_SECRET missing). */
  notice?: ReactNode;
}

const STATUS_TOKEN_COLOR: Record<EmailCronDisplayStatus, TokenColor> = {
  Success: 'green',
  Failed: 'red',
  Disabled: 'gray',
  Pending: 'blue',
};

export function EmailCronsKit({
  jobs,
  totalJobs,
  enabled,
  failing,
  lastRun,
  manageable = false,
  notice,
}: EmailCronsKitProps) {
  const actions = (row: EmailCronRow) => (
    <EmailCronRowActions id={row.id} name={row.job} enabled={row.enabled ?? row.status !== 'Disabled'} />
  );
  const kpis: KpiItem[] = [
    { label: 'Total Jobs', value: totalJobs },
    { label: 'Enabled', value: enabled },
    { label: 'Failing', value: failing, tone: failing > 0 ? 'danger' : undefined },
    { label: 'Last Run', value: lastRun },
  ];

  const columns: Column<EmailCronRow>[] = [
    {
      key: 'job',
      header: 'Email job',
      render: (row) => (
        <span style={{ fontWeight: 700, fontSize: 13 }}>{row.job}</span>
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
      key: 'status',
      header: 'Status',
      render: (row) => <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />,
    },
  ];
  if (manageable) {
    columns.push({ key: 'actions', header: 'Actions', render: actions });
  }

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Email Crons"
        kicker="System"
        lede="Automated email & workflow jobs"
      />

      {notice}

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<EmailCronRow>
        columns={columns}
        rows={jobs}
        rowKey={(row) => row.id}
        minWidth={manageable ? 900 : 640}
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
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
                <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
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
            </div>
            {manageable ? <div style={{ marginTop: 12 }}>{actions(row)}</div> : null}
          </Card>
        )}
        emptyTitle="No email crons registered"
        emptyDescription="Registered email and workflow jobs will appear here."
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
