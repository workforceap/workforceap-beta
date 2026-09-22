'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * One-click AI "quick summary" for a member, shown on the admin member-detail
 * page. Posts to the admin-only summary endpoint and renders a plain-language
 * "where this student is + what to do next" card. Re-runnable.
 */
export default function AdminMemberQuickSummary({ memberId }: { memberId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/members/${memberId}/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? 'Could not generate a summary right now.'
          );
        }
        const data = (await res.json()) as { summary?: string };
        setSummary(data.summary ?? 'Summary unavailable, try again.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not generate a summary right now.');
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.9rem',
          fontWeight: 600,
          padding: '0.55rem 0.95rem',
          borderRadius: '0.45rem',
          border: '1px solid var(--color-accent, #ad2c4d)',
          background: 'var(--color-accent, #ad2c4d)',
          color: '#fff',
          cursor: isPending ? 'wait' : 'pointer',
        }}
      >
        <Sparkles size={16} aria-hidden />
        {isPending
          ? 'Summarizing…'
          : summary
            ? 'Re-summarize this student'
            : 'Summarize this student'}
      </button>

      {error ? (
        <p role="alert" style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
          {error}
        </p>
      ) : null}

      {summary ? (
        <div
          style={{
            marginTop: '0.85rem',
            padding: '1rem 1.1rem',
            borderRadius: '0.6rem',
            border: '1px solid var(--outline-variant, rgba(0,0,0,0.1))',
            background: 'var(--surface-container-low)',
          }}
        >
          <p
            style={{
              margin: '0 0 0.5rem',
              fontSize: '0.8125rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-on-surface-variant, #555)',
            }}
          >
            AI quick summary
          </p>
          <p
            style={{
              margin: 0,
              fontSize: '0.95rem',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              color: 'var(--color-on-surface, #1a1a1a)',
            }}
          >
            {summary}
          </p>
        </div>
      ) : null}
    </div>
  );
}
