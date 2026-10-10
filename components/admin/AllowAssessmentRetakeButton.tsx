'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Staff action (ops 10/9/26): let a member retake the WIOA Preassessment.
 * The previous score is archived to history; the retake gets a new shuffled
 * order of questions and answers.
 */
export default function AllowAssessmentRetakeButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const allow = async () => {
    if (!window.confirm(`Allow ${memberName} to retake the preassessment?\n\nTheir current score is saved in history, and the new attempt shows the questions and answers in a different order.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/counselor/assessment-retake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setMessage({ kind: 'error', text: data.error ?? 'Could not allow a retake.' });
        return;
      }
      setMessage({ kind: 'ok', text: data.message ?? 'Retake allowed.' });
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Could not allow a retake. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-outline" onClick={() => void allow()} disabled={busy} data-testid="allow-assessment-retake">
        {busy ? 'Allowing…' : 'Allow retake'}
      </button>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
