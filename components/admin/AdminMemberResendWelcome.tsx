'use client';

import { useRef, useState } from 'react';

export default function AdminMemberResendWelcome({ memberId }: { memberId: string }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/resend-welcome`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || 'The welcome letter could not be sent. Please try again later.');
      }
      setFeedback({ ok: true, message: 'Welcome letter accepted by the email provider.' });
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof TypeError ? 'Email provider acceptance could not be confirmed. Check before retrying.' : error instanceof Error ? error.message : 'Email provider acceptance could not be confirmed. Check before retrying.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div>
    <button type="button" className="btn btn-outline" onClick={() => void send()} disabled={busy}>
      {busy ? 'Sending welcome letter…' : 'Resend welcome letter'}
    </button>
    {feedback && <p role={feedback.ok ? 'status' : 'alert'}>{feedback.message}</p>}
  </div>;
}
