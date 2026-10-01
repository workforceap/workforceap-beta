'use client';

/**
 * Surfaces the top course slugs landing in `completion_status='unresolved_course'`
 * or `'unmatched'` over the last 30 days. The list points an admin
 * straight at the slugs that need a canonical mapping (or an actor-email
 * remap, in the unmatched case). `'ignored'` is normal progress traffic and
 * is shown only as context (WAP-276).
 *
 * Backed by `GET /api/admin/coursera/ignored-xapi-summary`.
 */
import { useEffect, useState } from 'react';

type SummaryRow = {
  courseSlug: string | null;
  courseName: string | null;
  eventCount: number;
  distinctLearners: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

type Summary = {
  lookbackDays: number;
  outstandingTotal: number;
  ignoredTotal: number;
  unresolvedTotal?: number;
  unmatchedTotal: number;
  topSlugs: SummaryRow[];
};

export default function IgnoredXapiSummaryCard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/coursera/ignored-xapi-summary?limit=20');
        const json = (await res.json().catch(() => null)) as
          | (Summary & { error?: string })
          | { error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            (json && 'error' in json && typeof json.error === 'string' && json.error) ||
            `Server error ${res.status}`;
          throw new Error(msg);
        }
        setData(json as Summary);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          padding: '1rem',
          borderRadius: '0.85rem',
          background: 'var(--surface-container-low)',
          border: '1px solid var(--outline-variant)',
          fontSize: '0.85rem',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        Loading ignored-xAPI summary…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: '1rem',
          borderRadius: '0.85rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          fontSize: '0.85rem',
          color: 'var(--color-error, #dc2626)',
        }}
      >
        Failed to load ignored xAPI summary: {error}
      </div>
    );
  }

  if (!data) return null;

  const { ignoredTotal, unmatchedTotal, outstandingTotal, lookbackDays, topSlugs } = data;
  const unresolvedTotal = data.unresolvedTotal ?? 0;
  const severity =
    outstandingTotal === 0
      ? 'rgba(34, 197, 94, 0.10)'
      : outstandingTotal > 100
        ? 'rgba(239, 68, 68, 0.10)'
        : 'rgba(251, 191, 36, 0.12)';

  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: '0.85rem',
        background: severity,
        border: '1px solid var(--outline-variant)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          xAPI events that lost progress (last {lookbackDays} days)
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          {outstandingTotal.toLocaleString()} stuck — {unresolvedTotal.toLocaleString()} for an
          unmapped course, {unmatchedTotal.toLocaleString()} unmatched to a member. Slugs below need a
          canonical mapping or an actor-email remap.
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {ignoredTotal.toLocaleString()} other events were normal progress traffic (ignored). Rows
          recorded before 2026-09-25 can read ignored even if their course was unmapped.
        </div>
      </div>
      {topSlugs.length === 0 ? (
        <div style={{ fontSize: '0.85rem' }}>Pipeline clear — no stuck events in the window.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th scope="col" style={{ padding: '0.4rem 0.5rem' }}>Course slug</th>
                <th scope="col" style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Events</th>
                <th scope="col" style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Learners</th>
                <th scope="col" style={{ padding: '0.4rem 0.5rem' }}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {topSlugs.map((row, i) => (
                <tr key={`${row.courseSlug ?? '<null>'}-${i}`} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <code>{row.courseSlug ?? '<null>'}</code>
                    {row.courseName ? (
                      <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
                        {row.courseName}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.eventCount.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.distinctLearners}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    {row.lastSeen ? new Date(row.lastSeen).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
