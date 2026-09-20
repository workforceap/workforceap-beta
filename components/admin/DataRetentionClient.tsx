'use client';

import { useState, useCallback } from 'react';
import DataTable from '@/components/portal/ui/DataTable';

export type StorageRow = {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  sizeHuman: string;
};

export type PolicyRow = {
  model: string;
  description: string;
  days: number;
  cutoffDate: string;
  estimatedRows: number;
};

export type RunRow = {
  id: string;
  jobName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  recordsProcessed: number | null;
  errorMessage: string | null;
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

export default function DataRetentionClient({
  storage,
  policies,
  recentRuns,
}: {
  storage: StorageRow[];
  policies: PolicyRow[];
  recentRuns: RunRow[];
}) {
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState<{
    totalDeleted: number;
    deletedAccounts?: number;
    results: { model: string; deleted: number; error?: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCleanup = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_cleanup' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Cleanup failed');
      }
      setLastReport(data.report);
      // Refresh page after a short delay to show updated stats
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  const totalSize = storage.reduce((sum, s) => sum + s.sizeBytes, 0);

  return (
    <div>
      {/* Summary strip */}
      <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              database
            </span>
          </div>
          <p className="portal-metric-card__value">{storage.length}</p>
          <p className="portal-metric-card__label">Tables Monitored</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              save
            </span>
          </div>
          <p className="portal-metric-card__value">
            {totalSize > 0 ? `${(totalSize / 1024 / 1024).toFixed(1)} MB` : '—'}
          </p>
          <p className="portal-metric-card__label">Total Size</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--gold">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
              schedule
            </span>
          </div>
          <p className="portal-metric-card__value">{recentRuns.length}</p>
          <p className="portal-metric-card__label">Recent Runs</p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={runCleanup}
          disabled={running}
          aria-busy={running}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1rem', animation: running ? 'spin 1s linear infinite' : 'none' }}
            aria-hidden="true"
          >
            {running ? 'progress_activity' : 'cleaning_services'}
          </span>
          <span aria-live="polite">
            {running ? 'Running…' : 'Run Cleanup Now'}
          </span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(173,44,77,0.1)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--color-accent)',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {lastReport && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(74,155,79,0.12)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--wa-success-dark)',
            marginBottom: '1rem',
          }}
        >
          Cleanup complete. Deleted {lastReport.totalDeleted.toLocaleString()} rows
          {lastReport.deletedAccounts ? ` (${lastReport.deletedAccounts} accounts)` : ''}.
        </div>
      )}

      {/* Policies + estimated deletions */}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Retention Policies
      </h2>
      <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table"
          scrollX={false}
          rows={policies}
          rowKey={(r) => r.model}
          columns={[
            { key: 'model', header: 'Model', cell: (r) => r.model },
            { key: 'description', header: 'Description', cell: (r) => r.description },
            { key: 'days', header: 'Retention (days)', cell: (r) => r.days },
            {
              key: 'cutoff',
              header: 'Cutoff Date',
              cell: (r) => new Date(r.cutoffDate).toLocaleDateString(),
            },
            {
              key: 'estimated',
              header: 'Expired Rows',
              cell: (r) => r.estimatedRows.toLocaleString(),
            },
          ]}
        />
      </div>

      {/* Storage by table */}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Storage Usage
      </h2>
      <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table"
          scrollX={false}
          rows={storage}
          rowKey={(r) => r.tableName}
          columns={[
            { key: 'table', header: 'Table', cell: (r) => r.tableName },
            { key: 'rows', header: 'Rows', cell: (r) => r.rowCount.toLocaleString() },
            { key: 'size', header: 'Size', cell: (r) => r.sizeHuman },
          ]}
        />
      </div>

      {/* Cleanup run history */}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Cleanup Run History
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table"
          scrollX={false}
          rows={recentRuns}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: STATUS_COLOR[r.status] || 'transparent',
                    color: STATUS_TEXT_COLOR[r.status] || 'inherit',
                  }}
                >
                  {r.status}
                </span>
              ),
            },
            {
              key: 'started',
              header: 'Started',
              cell: (r) => new Date(r.startedAt).toLocaleString(),
            },
            {
              key: 'records',
              header: 'Records Deleted',
              cell: (r) => (r.recordsProcessed != null ? r.recordsProcessed.toLocaleString() : '—'),
            },
            {
              key: 'error',
              header: 'Error',
              cell: (r) => r.errorMessage || '—',
            },
          ]}
        />
      </div>
    </div>
  );
}
