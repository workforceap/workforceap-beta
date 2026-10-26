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
      const payload: unknown = await res.json().catch(() => null);
      const data = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (!res.ok) {
        setConfirmOpen(false);
        setMessage({ kind: 'error', text: typeof data.error === 'string' ? data.error : 'Could not allow a retake.' });
        return;
      }
      if (data.ok !== true) {
        setConfirmOpen(false);
        setMessage({ kind: 'error', text: 'Retake authorization could not be confirmed. Refresh this member’s record and check the authorization status before trying again.' });
        // A successful HTTP response is not evidence that permission was saved.
        // Reload the server-owned state; never show a member prompt as granted
        // from an empty, malformed or negative acknowledgement.
        router.refresh();
        return;
      }
      setRequested(true);
      setConfirmOpen(false);
      setMessage({ kind: 'ok', text: typeof data.message === 'string' ? data.message : 'Final retake authorized.' });
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
        body="Students have 2 preassessment chances total. Confirming authorizes the final attempt in the member portal. Their previous result stays saved. Ask the student to refresh their Preassessment page after authorization."
        confirmLabel="Request final retake" busy={busy}
        onConfirm={() => void allow()} onCancel={() => setConfirmOpen(false)} />
      <button type="button" className="btn btn-outline" onClick={() => setConfirmOpen(true)} disabled={busy || isPending || attemptCount !== 1} data-testid="allow-assessment-retake">
        {busy ? 'Requesting…' : attemptCount >= 2 ? 'Attempt limit reached' : isPending ? 'Retake requested' : 'Request final retake'}
      </button>
      <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--wa-type-meta)' }}>
        {Math.min(attemptCount, 2)} of 2 available attempts used.
        {' '}{attemptCount >= 2 ? 'Both chances used. No further retakes available.' : isPending ? 'Final retake authorized. Ask the student to refresh their Preassessment page to see the prompt for attempt 2 of 2.' : attemptCount === 0 ? 'The student must complete their first attempt.' : 'Final retake is not yet authorized. Choose Request final retake and confirm to make attempt 2 available in the member portal.'}
      </p>
      {message && (message.kind === 'ok' || !pending) ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
