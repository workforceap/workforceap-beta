'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

/**
 * Manual "Refresh from Coursera" button. Bypasses the 60s server cache
 * by calling /api/member/coursera/refresh-progress (which invalidates
 * the per-learner cache key) and then refreshes the route so the
 * server component re-fetches and re-renders. Useful when a learner
 * just finished a course and wants to see it reflected immediately.
 */
export default function RefreshCourseraProgressButton() {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    setPartial(false);
    try {
      const res = await fetch('/api/member/coursera/refresh-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coverage?: string;
        complete?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Refresh failed');
      }
      setPartial(data.coverage === 'capped' || data.coverage === 'unavailable' || data.complete === false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Refresh failed' }, 'coursera-refresh-progress'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      {error && (
        <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-error, #c83232)' }}>
          {error}
        </span>
      )}
      {partial && (
        <span role="status">
          Coursera returned a partial update. Progress shown uses available course records.
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy || isPending}
        aria-busy={busy || isPending}
        className="btn btn-outline"
        style={{
          fontSize: '0.8125rem',
          padding: '0.35rem 0.75rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '1rem',
            animation: busy || isPending ? 'spin 1s linear infinite' : undefined,
          }}
          aria-hidden="true"
        >
          refresh
        </span>
        {busy || isPending ? 'Refreshing…' : 'Refresh from Coursera'}
      </button>
    </span>
  );
}
