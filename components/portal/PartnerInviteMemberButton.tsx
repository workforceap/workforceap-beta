'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type Props = {
  compact?: boolean;
};

export default function PartnerInviteMemberButton({ compact = false }: Props) {
  const tPartner = useTranslations('partner');
  const tCommon = useTranslations('common');
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const emailErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, submitting]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedMessage = personalMessage.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      setSuccess(null);
      return;
    }

    if (trimmedMessage.length > 2000) {
      setError('Personal message must be 2,000 characters or less.');
      setSuccess(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/partner/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          personalMessage: trimmedMessage || null,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        inviteUrl?: string;
      };

      if (!response.ok) throw new Error(data.error ?? 'Could not send invite.');

      setSuccess(data.message ?? 'Invite sent.');
      setInviteUrl(data.inviteUrl ?? null);
      setEmail('');
      setPersonalMessage('');
    } catch (err) {
      setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not send invite.' }, 'partner-invite'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={compact ? 'btn btn-outline' : 'btn btn-primary'}
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(null);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
      >
        {tPartner('inviteMember')}
      </button>

      {open ? (
        <div
          onClick={() => !submitting && setOpen(false)}
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(18, 14, 15, 0.52)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 80,
          }}
        >
          <div
            id={dialogId}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            style={{
              width: 'min(100%, 34rem)',
              background: '#fff',
              borderRadius: '1rem',
              padding: '1.25rem',
              border: '1px solid #ebe7e7',
              boxShadow: '0 20px 45px rgba(28, 27, 27, 0.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wa-accent-text)' }}>
                  Partner Invite
                </p>
                <h2 id={titleId} style={{ margin: '0.35rem 0 0.3rem', fontSize: '1.2rem', color: 'var(--color-on-surface)' }}>
                  Invite a member to apply
                </h2>
                <p id={descriptionId} style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
                  We&rsquo;ll email your partner referral link so the member enters WorkforceAP through your organization.
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={submitting}>
                {tCommon('close')}
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
              <label className="form-group" style={{ margin: 0 }}>
                <span>Member email</span>
                <input
                  ref={emailRef}
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="person@example.com"
                  disabled={submitting}
                  aria-invalid={!!error}
                  aria-describedby={error ? emailErrorId : undefined}
                />
              </label>

              <label className="form-group" style={{ margin: 0 }}>
                <span>Personal message</span>
                <textarea
                  rows={4}
                  value={personalMessage}
                  onChange={(event) => setPersonalMessage(event.target.value)}
                  placeholder="Optional note to explain why you’re inviting them."
                  disabled={submitting}
                  maxLength={2000}
                />
              </label>

              {error ? (
                <p id={emailErrorId} className="form-error" role="alert" style={{ margin: 0 }}>
                  {error}
                </p>
              ) : null}

              {success ? (
                <div
                  style={{
                    background: '#f6fbf7',
                    border: '1px solid #d8efdc',
                    borderRadius: '0.85rem',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <p style={{ margin: 0, color: '#166534', fontWeight: 700 }}>{success}</p>
                  {inviteUrl ? (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
                      Referral link: {inviteUrl}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={submitting}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !email.trim()} aria-busy={submitting}>
                  <span aria-live="polite">
                    {submitting ? 'Sending…' : 'Send Invite'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
