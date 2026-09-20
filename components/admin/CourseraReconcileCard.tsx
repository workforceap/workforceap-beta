'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import DataTable from '@/components/portal/ui/DataTable';
import PortalEmptyState from '@/components/portal/PortalEmptyState';

type RowStatus = 'matched' | 'coursera-only' | 'wap-only' | 'wrong-course';

type ReconcileRow = {
  email: string;
  fullName: string | null;
  courseraExternalId: string | null;
  wapUserId: string | null;
  status: RowStatus;
  detail?: string;
};

type ReconcileResponse = {
  ranAt: string;
  programId: string;
  summary: {
    courseraUsers: number;
    wapUsers: number;
    matched: number;
    courseraOnly: number;
    wapOnly: number;
    wrongCourse: number;
  };
  rows: ReconcileRow[];
};

type StatusFilter = 'all' | RowStatus;

const tileStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  padding: '0.85rem 1rem',
  border: '1px solid var(--outline-variant)',
  borderRadius: '0.75rem',
  background: 'var(--surface-container-lowest)',
  minWidth: 0,
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--color-on-surface-variant)',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
};

const tileValueStyle: React.CSSProperties = {
  fontSize: '1.65rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

const btnStyle: React.CSSProperties = {
  padding: '0.55rem 0.95rem',
  borderRadius: '0.6rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  fontWeight: 600,
  fontSize: '0.9rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--surface-container)',
  color: 'var(--color-on-surface)',
};

const btnDisabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.55,
  cursor: 'not-allowed',
};

const filterPillStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.35rem 0.7rem',
  borderRadius: '999px',
  border: '1px solid var(--outline-variant)',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? 'var(--on-primary)' : 'var(--color-on-surface)',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

function statusBadge(status: RowStatus) {
  if (status === 'matched') return { text: 'matched', color: 'rgb(22, 163, 74)', bg: 'rgba(34, 197, 94, 0.15)' };
  if (status === 'coursera-only') return { text: 'coursera only', color: 'rgb(180, 83, 9)', bg: 'rgba(251, 191, 36, 0.18)' };
  if (status === 'wap-only') return { text: 'wap only', color: 'rgb(173, 44, 77)', bg: 'rgba(173, 44, 77, 0.15)' };
  return { text: 'wrong course', color: 'rgb(190, 18, 60)', bg: 'rgba(244, 63, 94, 0.15)' };
}

type Props = {
  /** Optional default Coursera program id. Falls back to the env-configured one. */
  defaultProgramId?: string;
};

export default function CourseraReconcileCard({ defaultProgramId }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReconcileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [addedUserIds, setAddedUserIds] = useState<Set<string>>(new Set());
  const [addingEmail, setAddingEmail] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string>(defaultProgramId ?? '');

  const runReconcile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAddError(null);
    try {
      const url = new URL('/api/admin/coursera/reconcile', window.location.origin);
      if (programId.trim()) url.searchParams.set('programId', programId.trim());
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) {
        const text = await response.text();
        setError(`HTTP ${response.status}: ${text.slice(0, 240)}`);
        return;
      }
      const json = (await response.json()) as ReconcileResponse;
      setData(json);
      // Default the in-card programId from the response so subsequent runs
      // don't have to retype it.
      if (!programId.trim() && json.programId) setProgramId(json.programId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile request failed');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  const handleAddToWap = useCallback(
    async (row: ReconcileRow) => {
      if (!data) return;
      if (!row.courseraExternalId) {
        setAddError(`No Coursera externalId for ${row.email}`);
        return;
      }
      setAddingEmail(row.email);
      setAddError(null);
      try {
        const response = await fetch('/api/admin/coursera/reconcile/add-to-wap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: row.email,
            fullName: row.fullName ?? undefined,
            courseraExternalId: row.courseraExternalId,
            programId: data.programId,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          userId?: string;
          error?: string;
        };
        if (!response.ok || !json.ok) {
          setAddError(json.error ?? `HTTP ${response.status}`);
          return;
        }
        // Optimistically mark the row as added — UI will refetch.
        setAddedUserIds((prev) => {
          const next = new Set(prev);
          if (json.userId) next.add(json.userId);
          next.add(row.email); // also key by email so the local check works pre-refetch
          return next;
        });
        await runReconcile();
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Add-to-WAP failed');
      } finally {
        setAddingEmail(null);
      }
    },
    [data, runReconcile],
  );

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (statusFilter === 'all') return data.rows;
    return data.rows.filter((r) => r.status === statusFilter);
  }, [data, statusFilter]);

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={runReconcile}
          disabled={loading}
          style={loading ? btnDisabledStyle : btnStyle}
        >
          {loading ? 'Reconciling…' : 'Reconcile with Coursera'}
        </button>
        <input
          type="text"
          placeholder="Coursera program id"
          aria-label="Coursera program id"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.55rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-lowest)',
            color: 'var(--color-on-surface)',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            minWidth: '14rem',
          }}
        />
        {data && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>
            Last run {new Date(data.ranAt).toLocaleString()} · program <code>{data.programId}</code>
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.6rem',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.06)',
            color: 'rgb(190, 18, 60)',
            fontSize: '0.9rem',
          }}
        >
          <strong>Reconcile failed:</strong> {error}
        </div>
      )}

      {addError && (
        <div
          role="alert"
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: '0.6rem',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.06)',
            color: 'rgb(190, 18, 60)',
            fontSize: '0.85rem',
          }}
        >
          <strong>Add to WorkforceAP failed:</strong> {addError}
        </div>
      )}

      {data && (
        <>
          {/* Stat tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.5rem',
            }}
          >
            <div style={tileStyle}>
              <span style={tileLabelStyle}>Coursera roster</span>
              <span style={tileValueStyle}>{data.summary.courseraUsers}</span>
            </div>
            <div style={tileStyle}>
              <span style={tileLabelStyle}>WAP users</span>
              <span style={tileValueStyle}>{data.summary.wapUsers}</span>
            </div>
            <div style={tileStyle}>
              <span style={tileLabelStyle}>Matched</span>
              <span style={{ ...tileValueStyle, color: 'rgb(22, 163, 74)' }}>{data.summary.matched}</span>
            </div>
            <div style={tileStyle}>
              <span style={tileLabelStyle}>Coursera only</span>
              <span style={{ ...tileValueStyle, color: 'rgb(180, 83, 9)' }}>{data.summary.courseraOnly}</span>
            </div>
            <div style={tileStyle}>
              <span style={tileLabelStyle}>WAP only</span>
              <span style={{ ...tileValueStyle, color: 'rgb(173, 44, 77)' }}>{data.summary.wapOnly}</span>
            </div>
            <div style={tileStyle}>
              <span style={tileLabelStyle}>Wrong course</span>
              <span style={{ ...tileValueStyle, color: 'rgb(190, 18, 60)' }}>{data.summary.wrongCourse}</span>
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            {(
              [
                ['all', `All (${data.rows.length})`],
                ['matched', `Matched (${data.summary.matched})`],
                ['coursera-only', `Coursera only (${data.summary.courseraOnly})`],
                ['wap-only', `WAP only (${data.summary.wapOnly})`],
                ['wrong-course', `Wrong course (${data.summary.wrongCourse})`],
              ] as Array<[StatusFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                style={filterPillStyle(statusFilter === key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Rows */}
          {filteredRows.length === 0 ? (
            <PortalEmptyState
              title={
                data.rows.length === 0
                  ? 'No reconcile data'
                  : `No ${statusFilter === 'all' ? '' : statusFilter} rows`
              }
              description={
                data.rows.length === 0
                  ? 'Click "Reconcile with Coursera" to fetch the latest roster.'
                  : 'Switch filter to see other rows.'
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DataTable
                density="compact"
                scrollX={false}
                rows={filteredRows}
                rowKey={(row) => `${row.status}:${row.email}`}
                columns={[
                  {
                    key: 'learner',
                    header: 'Learner',
                    cell: (row) => (
                      <>
                        <div style={{ fontWeight: 600 }}>{row.fullName || row.email}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                          {row.email}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (row) => {
                      const badge = statusBadge(row.status);
                      return (
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '0.5rem',
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 600,
                            textTransform: 'lowercase',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {badge.text}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'ids',
                    header: 'IDs',
                    cell: (row) => (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', display: 'grid', gap: '0.15rem' }}>
                        {row.courseraExternalId ? (
                          <span>Coursera: <code>{row.courseraExternalId}</code></span>
                        ) : null}
                        {row.wapUserId ? (
                          <span>WAP: <code>{row.wapUserId.slice(0, 8)}…</code></span>
                        ) : null}
                        {!row.courseraExternalId && !row.wapUserId ? <span>—</span> : null}
                      </div>
                    ),
                  },
                  {
                    key: 'detail',
                    header: 'Detail',
                    cell: (row) => (
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
                        {row.detail ?? ''}
                      </span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: 'Action',
                    cell: (row) => {
                      if (row.status === 'coursera-only') {
                        const alreadyAdded = addedUserIds.has(row.email);
                        const isAdding = addingEmail === row.email;
                        return (
                          <button
                            type="button"
                            onClick={() => handleAddToWap(row)}
                            disabled={alreadyAdded || isAdding}
                            style={
                              alreadyAdded || isAdding
                                ? btnDisabledStyle
                                : { ...btnSecondaryStyle, padding: '0.4rem 0.7rem', fontSize: '0.8125rem' }
                            }
                          >
                            {alreadyAdded ? 'Added' : isAdding ? 'Adding…' : 'Add to WorkforceAP'}
                          </button>
                        );
                      }
                      if (row.status === 'wrong-course' && row.wapUserId) {
                        return (
                          <Link
                            href={`/admin/members/${row.wapUserId}`}
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: 'var(--color-on-surface)',
                              textDecoration: 'underline',
                            }}
                          >
                            Fix enrollment →
                          </Link>
                        );
                      }
                      return null;
                    },
                  },
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
