'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Program } from '@/lib/content/programs';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

type Props = {
  programs: Program[];
};

export default function ProgramChangeRequestForm({ programs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requestedSlug, setRequestedSlug] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!requestedSlug) {
      setError('Choose a program.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Please add a reason (at least 10 characters) so the counselor can decide quickly.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/member/program-change-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestedProgramSlug: requestedSlug, reason: reason.trim() }),
        });
        if (!res.ok) {
          const msg = await getErrorMessageFromResponse(res);
          setError(msg);
          return;
        }
        setSuccess(true);
        router.refresh();
      } catch {
        setError('Network error — please try again.');
      }
    });
  };

  if (success) {
    return (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Request submitted.</p>
        <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
          A counselor will follow up via Counselor Chat or email — usually within 1–2 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Program you would like to switch to</span>
        <select
          value={requestedSlug}
          onChange={(e) => setRequestedSlug(e.target.value)}
          disabled={isPending}
          required
          style={{
            padding: '0.65rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--color-on-surface)',
            fontSize: '0.95rem',
          }}
        >
          <option value="">— Select a program —</option>
          {programs.map((p) => (
            <option key={p.slug} value={p.slug}>{p.title}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Why this change?</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isPending}
          required
          rows={5}
          minLength={10}
          maxLength={8000}
          placeholder="Briefly explain why this new program fits your goals — counselors approve faster when there is context."
          style={{
            padding: '0.65rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--color-on-surface)',
            fontSize: '0.95rem',
            resize: 'vertical',
            minHeight: '6rem',
          }}
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {reason.trim().length} / 10 minimum
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '0.6rem 0.75rem',
            borderRadius: '0.5rem',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid #b91c1c',
            color: '#b91c1c',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending}
        >
          {isPending ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}
