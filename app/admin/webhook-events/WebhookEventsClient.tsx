'use client';

import Link from 'next/link';
import { useState } from 'react';

import DataTable from '@/components/portal/ui/DataTable';

interface WebhookEvent {
  id: string;
  source: string;
  eventType: string | null;
  eventId: string | null;
  payloadSize: number;
  processingTimeMs: number | null;
  status: string;
  httpStatusCode: number | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  success: { bg: 'rgba(34,197,94,0.1)', color: '#16a34a' },
  failed: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
  retrying: { bg: 'rgba(59,130,246,0.1)', color: '#2563eb' },
  dead_letter: { bg: 'rgba(249,115,22,0.1)', color: '#ea580c' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildHref(
  page: number,
  q: string,
  source: string,
  status: string,
  dateFrom: string,
  dateTo: string
): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (source.trim()) params.set('source', source.trim());
  if (status.trim()) params.set('status', status.trim());
  if (dateFrom.trim()) params.set('dateFrom', dateFrom.trim());
  if (dateTo.trim()) params.set('dateTo', dateTo.trim());
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `/admin/webhook-events?${s}` : '/admin/webhook-events';
}

export default function WebhookEventsClient({
  events,
  page,
  totalPages,
  pageSize,
  totalMatching,
  initialQ,
  initialSource,
  initialStatus,
  initialDateFrom,
  initialDateTo,
  sources,
  statuses,
}: {
  events: WebhookEvent[];
  page: number;
  totalPages: number;
  pageSize: number;
  totalMatching: number;
  initialQ: string;
  initialSource: string;
  initialStatus: string;
  initialDateFrom: string;
  initialDateTo: string;
  sources: { name: string; count: number }[];
  statuses: { name: string; count: number }[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const start = totalMatching === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalMatching);

  return (
    <div>
      {/* Filters — GET form resets to page 1 */}
      <form
        action="/admin/webhook-events"
        method="get"
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Search</span>
          <input
            type="text"
            name="q"
            placeholder="Search source, event ID, error…"
            defaultValue={initialQ}
            style={{
              minHeight: '44px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
            }}
          />
        </label>
        <label style={{ minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Source</span>
          <select
            name="source"
            defaultValue={initialSource}
            style={{
              minHeight: '44px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
            }}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Status</span>
          <select
            name="status"
            defaultValue={initialStatus}
            style={{
              minHeight: '44px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>From</span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={initialDateFrom}
            style={{
              minHeight: '44px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
            }}
          />
        </label>
        <label style={{ minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>To</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={initialDateTo}
            style={{
              minHeight: '44px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
            }}
          />
        </label>
        <button
          type="submit"
          style={{
            minHeight: '44px',
            padding: '0 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </form>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>
          {totalMatching === 0
            ? 'No events match'
            : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${totalMatching.toLocaleString()} events`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link
            href={buildHref(Math.max(1, page - 1), initialQ, initialSource, initialStatus, initialDateFrom, initialDateTo)}
            aria-disabled={page <= 1}
            style={{
              pointerEvents: page <= 1 ? 'none' : undefined,
              opacity: page <= 1 ? 0.45 : 1,
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-accent)',
              textDecoration: 'none',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Previous
          </Link>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            Page {page} / {totalPages}
          </span>
          <Link
            href={buildHref(Math.min(totalPages, page + 1), initialQ, initialSource, initialStatus, initialDateFrom, initialDateTo)}
            aria-disabled={page >= totalPages}
            style={{
              pointerEvents: page >= totalPages ? 'none' : undefined,
              opacity: page >= totalPages ? 0.45 : 1,
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-accent)',
              textDecoration: 'none',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Next
          </Link>
        </div>
      </div>

      {/* Desktop table */}
      <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
        <DataTable
          density="compact"
          variant="portal"
          scrollX={false}
          rows={events}
          rowKey={(e) => e.id}
          getRowProps={(e) => ({
            style: {
              cursor: e.errorMessage ? 'pointer' : 'default',
            },
            onClick: () => {
              if (e.errorMessage) setExpandedId(expandedId === e.id ? null : e.id);
            },
          })}
          emptyState={
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              No webhook events match your filters.
            </div>
          }
          columns={[
            {
              key: 'time',
              header: 'Time',
              cell: (e) => (
                <span style={{ whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>{formatTime(e.createdAt)}</span>
              ),
            },
            {
              key: 'source',
              header: 'Source',
              cell: (e) => <span style={{ fontWeight: 500 }}>{e.source}</span>,
            },
            {
              key: 'eventType',
              header: 'Event',
              cell: (e) => (
                <span style={{ color: 'var(--color-on-surface-variant)' }}>{e.eventType ?? '—'}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (e) => {
                const style = STATUS_STYLES[e.status] ?? { bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
                return (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.125rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: style.bg,
                      color: style.color,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {e.status}
                  </span>
                );
              },
            },
            {
              key: 'payload',
              header: 'Payload',
              cell: (e) => (
                <span style={{ whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>{formatBytes(e.payloadSize)}</span>
              ),
            },
            {
              key: 'processing',
              header: 'Time',
              cell: (e) => (
                <span style={{ whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>
                  {e.processingTimeMs ? `${e.processingTimeMs}ms` : '—'}
                </span>
              ),
            },
            {
              key: 'retry',
              header: 'Retry',
              cell: (e) => (
                <span style={{ whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>
                  {e.retryCount > 0 ? `${e.retryCount}` : '—'}
                  {e.nextRetryAt ? ` · ${formatTime(e.nextRetryAt)}` : ''}
                </span>
              ),
            },
            {
              key: 'details',
              header: '',
              cell: (e) =>
                e.errorMessage ? (
                  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--color-on-surface-variant)' }} aria-hidden="true">
                    {expandedId === e.id ? 'expand_less' : 'expand_more'}
                  </span>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </div>

      {/* Mobile card list */}
      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
        {events.map((e) => {
          const style = STATUS_STYLES[e.status] ?? { bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
          return (
            <div
              key={e.id}
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-lg)',
                padding: '0.875rem 1rem',
              }}
              onClick={() => e.errorMessage && setExpandedId(expandedId === e.id ? null : e.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                <span style={{ fontWeight: 500 }}>{e.source}</span>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.125rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    background: style.bg,
                    color: style.color,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {e.status}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                {e.eventType ?? '—'} · {formatBytes(e.payloadSize)} · {e.processingTimeMs ? `${e.processingTimeMs}ms` : '—'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                {formatTime(e.createdAt)}
                {e.retryCount > 0 ? ` · Retry ${e.retryCount}` : ''}
              </div>
              {expandedId === e.id && e.errorMessage && (
                <pre
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-container-highest)',
                    fontSize: '0.8125rem',
                    overflow: 'auto',
                    maxHeight: '200px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#dc2626',
                  }}
                >
                  {e.errorMessage}
                </pre>
              )}
            </div>
          );
        })}
        {events.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
            No webhook events match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
