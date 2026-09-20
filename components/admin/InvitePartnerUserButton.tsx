'use client';

import { useState } from 'react';

const INVITE_NOT_SENT = 'Invite not sent: ';

/**
 * Every failure reads "Invite not sent: <reason>" so the admin knows the
 * invite did not go out even when the API only had a generic status
 * (audit 2026-09-20: a 500 left the box blank).
 */
export function inviteFailureText(apiMessage: string | null, status: number): string {
  const reason = apiMessage?.trim()
    ? apiMessage.trim()
    : status >= 500
      ? 'the server hit an unexpected error. Try again in a few minutes.'
      : 'the request was rejected. Check the email address and try again.';
  if (reason.toLowerCase().startsWith(INVITE_NOT_SENT.toLowerCase())) return reason;
  const lowered = reason.charAt(0).toLowerCase() + reason.slice(1);
  return `${INVITE_NOT_SENT}${lowered}`;
}

export default function InvitePartnerUserButton({ partnerId }: { partnerId: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: inviteFailureText(typeof data.error === 'string' ? data.error : null, res.status) });
        return;
      }
      setMessage({ type: 'ok', text: 'Invite sent. They will receive an email to access the partner portal.' });
      setEmail('');
    } catch {
      setMessage({ type: 'err', text: inviteFailureText('the request did not reach the server. Check your connection and try again.', 0) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <input
        type="email"
        required
        aria-label="Partner user email"
        aria-describedby={message ? 'partner-invite-message' : undefined}
        aria-invalid={message?.type === 'err' ? true : undefined}
        placeholder="partner@organization.org"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: '0.5rem 0.75rem', minWidth: 220, borderRadius: 6, border: '1px solid var(--color-border)' }}
      />
      <button type="submit" className="btn btn-primary" disabled={loading} aria-busy={loading}>
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {loading ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
              Sending…
            </>
          ) : (
            'Invite Partner User'
          )}
        </span>
      </button>
      {message && (
        <span
          id="partner-invite-message"
          role={message.type === 'ok' ? 'status' : 'alert'}
          style={{ fontSize: '0.875rem', fontWeight: 600, color: message.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--color-accent)', width: '100%' }}
        >
          {message.text}
        </span>
      )}
    </form>
  );
}
