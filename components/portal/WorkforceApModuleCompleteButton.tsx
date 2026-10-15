'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WorkforceApModuleCompleteButton({
  courseSlug,
  programSlug,
  completed,
  label = 'Mark lab complete',
  completedLabel = 'Completed',
  savingLabel = 'Saving…',
  saveErrorLabel = 'Could not save completion. Please try again.',
  networkErrorLabel = 'Could not reach the server. Check your connection and try again.',
}: {
  courseSlug: string;
  programSlug: string;
  completed: boolean;
  label?: string;
  completedLabel?: string;
  savingLabel?: string;
  saveErrorLabel?: string;
  networkErrorLabel?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return <span className="wa-kit-cta wa-kit-cta--ghost" role="status">{completedLabel}</span>;
  }

  const complete = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/member/courses/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseSlug, programSlug }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? saveErrorLabel);
        return;
      }
      router.refresh();
    } catch {
      setError(networkErrorLabel);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
        onClick={complete}
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? savingLabel : label}
      </button>
      {error ? <p role="alert" style={{ marginTop: 8, color: 'var(--color-error)' }}>{error}</p> : null}
    </div>
  );
}
