'use client';

import { useState, useCallback } from 'react';
import { Download, CheckCircle2, XCircle, Loader2, Ban, type LucideIcon } from 'lucide-react';
import DataTable from '@/components/portal/ui/DataTable';

export type CronExecutionRow = {
  id: string;
  jobName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  recordsProcessed: number | null;
  durationMs: number | null;
  createdAt: Date;
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'rgba(74,155,79,0.12)',
  FAILED: 'rgba(173,44,77,0.1)',
  RUNNING: 'rgba(43,123,185,0.1)',
  SKIPPED: 'rgba(255,187,0,0.1)',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  SUCCESS: 'var(--wa-success-dark)',
  FAILED: 'var(--color-accent)',
  RUNNING: 'var(--wa-info-dark)',
  SKIPPED: 'var(--wa-gold-dark)',
};

/** Icon per status so a run's outcome reads at a glance, not by color alone. */
const STATUS_ICON: Record<string, LucideIcon> = {
  SUCCESS: CheckCircle2,
  FAILED: XCircle,
  RUNNING: Loader2,
  SKIPPED: Ban,
};

export default function AdminCronsClient({
  initialExecutions,
  jobNames,
}: {
  initialExecutions: CronExecutionRow[];
  jobNames: string[];
}) {
  const [filterJob, setFilterJob] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const toggleError = useCallback((id: string) => {
    setExpandedErrorId((prev) => (prev === id ? null : id));
  }, []);

  const filtered = initialExecutions.filter((row) => {
    if (filterJob && !row.jobName.toLowerCase().includes(filterJob.toLowerCase())) return false;
    if (filterStatus && row.status !== filterStatus) return false;
    return true;
  });

  function exportCsv() {
    const params = new URLSearchParams();
    if (filterJob) params.set('jobName', filterJob);
    if (filterStatus) params.set('status', filterStatus);
    window.open(`/api/admin/crons/export?${params.toString()}`, '_blank');
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterJob}
          onChange={(e) => setFilterJob(e.target.value)}
          aria-label="Filter by job"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--wa-control-border)',
            background: 'var(--surface-container)',
            color: 'var(--color-on-surface)',
            fontSize: '0.875rem',
          }}
        >
          <option value="">All jobs</option>
          {jobNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--wa-control-border)',
            background: 'var(--surface-container)',
            color: 'var(--color-on-surface)',
            fontSize: '0.875rem',
          }}
        >
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="RUNNING">Running</option>
          <option value="SKIPPED">Skipped</option>
        </select>
        {(filterJob || filterStatus) && (
          <button
            onClick={() => {
              setFilterJob('');
              setFilterStatus('');
            }}
            className="btn btn-ghost btn-sm"
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="btn btn-outline btn-sm"
          title="Export cron executions to CSV"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="portal-card portal-card--flat" style={{ overflow: 'auto' }}>
        <DataTable
          variant="admin"
          tableClassName="dashboard-table"
          scrollX={false}
          rows={filtered}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'jobName',
              header: 'Job',
              cell: (row) => (
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', fontWeight: 600 }}>
                  {row.jobName}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => {
                const bg = STATUS_COLOR[row.status] ?? 'var(--surface-container-low)';
                const color = STATUS_TEXT_COLOR[row.status] ?? 'var(--color-on-surface-variant)';
                const Icon = STATUS_ICON[row.status];
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.8125rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      background: bg,
                      color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {Icon && (
                      <Icon
                        size={10}
                        aria-hidden
                        style={row.status === 'RUNNING' ? { animation: 'spin 1s linear infinite' } : undefined}
                      />
                    )}
                    <span>{row.status}</span>
                  </span>
                );
              },
            },
            {
              key: 'startedAt',
              header: 'Started',
              cell: (row) => (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  {new Date(row.startedAt).toLocaleString()}
                </span>
              ),
            },
            {
              key: 'duration',
              header: 'Duration',
              align: 'right',
              cell: (row) => (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.durationMs !== null && row.durationMs !== undefined
                    ? `${row.durationMs < 1000 ? `${row.durationMs}ms` : `${(row.durationMs / 1000).toFixed(1)}s`}`
                    : row.status === 'RUNNING'
                      ? '—'
                      : '—'}
                </span>
              ),
            },
            {
              key: 'records',
              header: 'Records',
              align: 'right',
              cell: (row) => (
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.recordsProcessed ?? '—'}
                </span>
              ),
            },
            {
              key: 'error',
              header: 'Error',
              cell: (row) => {
                if (!row.errorMessage) return <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>—</span>;
                const isExpanded = expandedErrorId === row.id;
                return (
                  <div>
                    <button
                      onClick={() => toggleError(row.id)}
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--wa-accent-text)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {isExpanded ? 'Hide details' : 'View error'}
                    </button>
                    {isExpanded && (
                      <p
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--wa-accent-text)',
                          margin: '0.25rem 0 0',
                          maxWidth: '300px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.4,
                        }}
                      >
                        {row.errorMessage}
                      </p>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
        {filtered.length === 0 && (
          <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            No executions match the current filters.
          </p>
        )}
      </div>
    </div>
  );
}
