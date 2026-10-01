'use client';

import Link from 'next/link';
import { useState } from 'react';

import DataTable from '@/components/portal/ui/DataTable';

interface AuditEvent {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  sourcePage: string | null;
  sessionId: string | null;
  createdAt: string;
}

function buildAuditLogsHref(
  page: number,
  q: string,
  event: string,
  order: 'asc' | 'desc'
): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (event.trim()) params.set('event', event.trim());
  if (order !== 'desc') params.set('order', order);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `/admin/audit-logs?${s}` : '/admin/audit-logs';
}

export default function AuditLogsClient({
  events,
  page,
  totalPages,
  pageSize,
  totalMatching,
  initialQ,
  initialEvent,
  order,
  eventTypes,
}: {
  events: AuditEvent[];
  page: number;
  totalPages: number;
  pageSize: number;
  totalMatching: number;
  initialQ: string;
  initialEvent: string;
  order: 'asc' | 'desc';
  eventTypes: { name: string; count: number }[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const start = totalMatching === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalMatching);

  return (
    <div>
      {/* Filters — GET form resets to page 1 */}
      <form
        action="/admin/audit-logs"
        method="get"
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Search</span>
          {order !== 'desc' ? <input type="hidden" name="order" value={order} /> : null}
          <input
            type="text"
            name="q"
            placeholder="Search users, events, source…"
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
        <label style={{ minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Event type</span>
          <select
            name="event"
            defaultValue={initialEvent}
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
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
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
            href={buildAuditLogsHref(Math.max(1, page - 1), initialQ, initialEvent, order)}
            aria-disabled={page <= 1}
            style={{
              pointerEvents: page <= 1 ? 'none' : undefined,
              opacity: page <= 1 ? 0.45 : 1,
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
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
            href={buildAuditLogsHref(Math.min(totalPages, page + 1), initialQ, initialEvent, order)}
            aria-disabled={page >= totalPages}
            style={{
              pointerEvents: page >= totalPages ? 'none' : undefined,
              opacity: page >= totalPages ? 0.45 : 1,
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
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
              cursor: e.metadata ? 'pointer' : 'default',
            },
            onClick: () => {
              if (e.metadata) setExpandedId(expandedId === e.id ? null : e.id);
            },
          })}
          renderSubRow={(e) =>
            expandedId === e.id && e.metadata ? (
              <pre
                style={{
                  margin: 0,
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-container-highest)',
                  fontSize: '0.8125rem',
                  overflow: 'auto',
                  maxHeight: '240px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            ) : null
          }
          emptyState={
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              No events match your filters.
            </div>
          }
          columns={[
            {
              key: 'time',
              cellDataLabel: 'Time',
              header: (
                <Link
                  href={buildAuditLogsHref(1, initialQ, initialEvent, order === 'desc' ? 'asc' : 'desc')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    color: 'inherit',
                    textDecoration: 'none',
                    font: 'inherit',
                    fontWeight: 'inherit',
                  }}
                  aria-label={`Sort by time, currently ${order === 'desc' ? 'newest' : 'oldest'} first`}
                >
                  Time
                  <span style={{ fontSize: '0.7em' }} aria-hidden>{order === 'desc' ? '▼' : '▲'}</span>
                </Link>
              ),
              cell: (e) => (
                <span style={{ whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>{formatTime(e.createdAt)}</span>
              ),
            },
            {
              key: 'user',
              header: 'User',
              cell: (e) => (
                <>
                  <div style={{ fontWeight: 500 }}>{e.userName ?? '—'}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{e.userEmail ?? '—'}</div>
                </>
              ),
            },
            {
              key: 'event',
              header: 'Event',
              cell: (e) => (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.125rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(173,44,77,0.1)',
                    color: 'var(--wa-accent-text)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  {e.eventName}
                </span>
              ),
            },
            {
              key: 'entity',
              header: 'Entity',
              cell: (e) => (
                <span style={{ color: 'var(--color-on-surface-variant)' }}>
                  {e.entityType ? `${e.entityType}${e.entityId ? ` #${e.entityId.slice(0, 8)}` : ''}` : '—'}
                </span>
              ),
            },
            {
              key: 'source',
              header: 'Source',
              cell: (e) => <span style={{ color: 'var(--color-on-surface-variant)' }}>{e.sourcePage || '—'}</span>,
            },
            {
              key: 'details',
              header: 'Details',
              cell: (e) =>
                e.metadata ? (
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
        {events.map((e) => (
          <div
            key={e.id}
            style={{
              background: 'var(--surface-container)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.875rem 1rem',
            }}
            onClick={() => e.metadata && setExpandedId(expandedId === e.id ? null : e.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.125rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(173,44,77,0.1)',
                  color: 'var(--wa-accent-text)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                {e.eventName}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{formatTime(e.createdAt)}</span>
            </div>
            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{e.userName ?? '—'}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {e.entityType && `${e.entityType} `}
              {e.sourcePage && `· ${e.sourcePage}`}
            </div>
            {expandedId === e.id && e.metadata && (
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
                }}
              >
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
            No events match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
