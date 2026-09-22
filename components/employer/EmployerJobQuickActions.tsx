'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

export default function EmployerJobQuickActions({
  jobId,
  title,
  status,
}: {
  jobId: string;
  title: string;
  status: string;
}) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const [busy, setBusy] = useState<'pause' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showPause = status === 'live';
  const showClose = status === 'live' || status === 'approved';

  async function updateStatus(action: 'pause' | 'close', status: 'approved' | 'closed', fallback: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/employer/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      // A server rejection is JSON `{ error }`; a non-JSON answer falls through
      // to the generic sentence below.
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      setError(typeof data.error === 'string' && data.error.trim() ? data.error : fallback);
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback },
          `employer-job-${action}`,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  const pause = () => updateStatus('pause', 'approved', 'Could not pause this job. Please try again.');
  const closeJob = () => updateStatus('close', 'closed', 'Could not close this job. Please try again.');

  const btnStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'center',
    padding: '0.5rem',
    background: 'var(--surface-container)',
    color: 'var(--color-on-surface)',
    borderRadius: '0.375rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    border: '1px solid var(--outline-variant)',
    cursor: busy ? 'wait' : 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Link
          href={`/employer/jobs/${jobId}`}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '0.5rem',
            background: 'var(--color-accent)',
            color: '#fff',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
          className="active:wa-scale-95 wa-transition-transform"
        >
          Edit
        </Link>
        {showPause && (
          <button
            type="button"
            style={btnStyle}
            disabled={!!busy}
            onClick={() => void pause()}
          >
            {busy === 'pause' ? '…' : 'Pause'}
          </button>
        )}
        {showClose && (
          <button
            type="button"
            style={btnStyle}
            disabled={!!busy}
            onClick={() => {
              if (confirm(`Close “${title}”? It will no longer be visible to candidates.`)) {
                void closeJob();
              }
            }}
          >
            {busy === 'close' ? '…' : 'Close'}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="form-error" style={{ margin: 0, fontSize: '0.8125rem' }}>
          {error}
        </p>
      ) : null}
      <Link
        href={`/employer/jobs/${encodeURIComponent(jobId)}/applicants`}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '0.45rem',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--wa-accent-text)',
          textDecoration: 'none',
        }}
      >
        Applications
      </Link>
    </div>
  );
}
