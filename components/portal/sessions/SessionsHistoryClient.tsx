'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';

export type SessionRow = {
  sessionId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  actorName: string | null;
  /** ISO string — Date is not serializable across server/client boundary */
  startedAt: string;
  toolCount: number;
  runHref: string;
};

/**
 * Client-side searchable history for In-office sessions. The server
 * component (SessionsIndexBody) hydrates with the latest N sessions
 * already grouped by sessionId; this component layers a free-text
 * filter on top so admins can find any member's session quickly
 * without round-tripping to the server.
 *
 * Search matches member name, member email, and (admin scope only)
 * actor name — case-insensitive substring.
 */
export default function SessionsHistoryClient({
  sessions,
  scope,
  heading,
  emptyTitle,
  emptyBody,
}: {
  sessions: SessionRow[];
  scope: 'counselor' | 'admin';
  heading: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const haystack = [
        s.memberName,
        s.memberEmail,
        scope === 'admin' ? s.actorName ?? '' : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, sessions, scope]);

  const showSearch = sessions.length > 0;
  // Only admin scope shows actor name on each row (counselor knows
  // they themselves ran every session in their list).
  const showActor = scope === 'admin';

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-on-surface)' }}>
          {heading}
          {sessions.length > 0 ? (
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {sessions.length}
            </span>
          ) : null}
        </h2>
        {showSearch ? (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.65rem',
              minWidth: '14rem',
              flex: '0 1 22rem',
            }}
          >
            <Search size={14} aria-hidden style={{ color: 'var(--color-on-surface-variant)', flexShrink: 0 }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                scope === 'admin'
                  ? 'Search by member or counselor name'
                  : 'Search by member name or email'
              }
              aria-label="Filter sessions"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.85rem',
                color: 'var(--color-on-surface)',
              }}
            />
          </label>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}
        >
          <Sparkles size={28} aria-hidden style={{ margin: '0 auto 0.75rem', display: 'block', color: 'var(--wa-accent-text)' }} />
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>{emptyTitle}</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{emptyBody}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            No sessions match &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((s) => (
            <li
              key={s.sessionId}
              className="portal-card portal-card--flat"
              style={{
                padding: '0.85rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.memberName}
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: 400,
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {s.memberEmail}
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                  {showActor && s.actorName ? (
                    <>
                      With <strong style={{ color: 'var(--color-on-surface)' }}>{s.actorName}</strong>
                      {' · '}
                    </>
                  ) : null}
                  {s.toolCount} tool run{s.toolCount === 1 ? '' : 's'}
                  {' · '}
                  {new Date(s.startedAt).toLocaleString()}
                </div>
              </div>
              <Link
                href={s.runHref}
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--wa-accent-text)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Resume &rarr;
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
