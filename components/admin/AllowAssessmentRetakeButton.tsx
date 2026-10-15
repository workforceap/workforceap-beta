'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from './ConfirmDialog';

/**
 * Staff action (ops 10/9/26): let a member retake the WIOA Preassessment.
 * The previous score is archived to history; the retake gets a new shuffled
 * order of questions and answers.
 */
export default function AllowAssessmentRetakeButton({ memberId, memberName, attemptCount = 1, pending = false, endpoint = '/api/counselor/assessment-retake' }: {
  memberId: string; memberName: string; attemptCount?: number; pending?: boolean; endpoint?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const isPending = pending || requested;
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const allow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setConfirmOpen(false);
        setMessage({ kind: 'error', text: data.error ?? 'Could not allow a retake.' });
        return;
      }
      setRequested(true);
      setConfirmOpen(false);
      setMessage({ kind: 'ok', text: data.message ?? 'Retake allowed.' });
      router.refresh();
    } catch {
      setConfirmOpen(false);
      setMessage({ kind: 'error', text: 'Could not allow a retake. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 'var(--wa-pad-sm)' }}>
      <ConfirmDialog open={confirmOpen} title={`Request final retake for ${memberName}?`}
        body="Students have 2 preassessment chances total. Their previous result stays saved, and a retake prompt will appear in their portal."
        confirmLabel="Request final retake" busy={busy}
        onConfirm={() => void allow()} onCancel={() => setConfirmOpen(false)} />
      <button type="button" className="btn btn-outline" onClick={() => setConfirmOpen(true)} disabled={busy || isPending || attemptCount !== 1} data-testid="allow-assessment-retake">
        {busy ? 'Requesting…' : attemptCount >= 2 ? 'Attempt limit reached' : isPending ? 'Retake requested' : 'Request final retake'}
      </button>
      <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--wa-type-meta)' }}>
        {Math.min(attemptCount, 2)} of 2 available attempts used.
        {' '}{attemptCount >= 2 ? 'Both chances used. No further retakes available.' : isPending ? 'The student has a prompt for their final attempt.' : attemptCount === 0 ? 'The student must complete their first attempt.' : 'One staff-authorized retake available.'}
      </p>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
