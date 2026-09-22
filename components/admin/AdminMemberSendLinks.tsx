'use client';

import { useState, useTransition } from 'react';

type SendKind = 'interview' | 'eligibility' | 'public-link';

type FeedbackState = { kind: SendKind; ok: boolean; message: string } | null;

/**
 * Admin actions on the member-detail page:
 *  - "Send interview prep link" → emails the member a portal link to the
 *    login-gated WIOA interview-prep tool (§5).
 *  - "Send eligibility questionnaire" → emails the member a link to the
 *    auth-gated eligibility portal page (§9).
 *  - "Copy public questionnaire link" → mints a PUBLIC single-use tokenized
 *    link (/q/<token>) bound to this member and copies it to the clipboard.
 *    The recipient needs no account to complete the eligibility form (§9).
 *
 * All hit admin-only POST routes and give clear sent / error feedback.
 */
export default function AdminMemberSendLinks({ memberId }: { memberId: string }) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingKind, setPendingKind] = useState<SendKind | null>(null);
  const [isPending, startTransition] = useTransition();

  const send = (kind: SendKind) => {
    setFeedback(null);
    setPendingKind(kind);
    const path =
      kind === 'interview'
        ? `/api/admin/members/${memberId}/send-interview-link`
        : `/api/admin/members/${memberId}/send-eligibility-link`;
    const label = kind === 'interview' ? 'Interview prep link' : 'Eligibility questionnaire';
    startTransition(async () => {
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Could not send the email right now.');
        }
        setFeedback({ kind, ok: true, message: `${label} sent.` });
      } catch (err) {
        setFeedback({
          kind,
          ok: false,
          message: err instanceof Error ? err.message : 'Could not send the email right now.',
        });
      } finally {
        setPendingKind(null);
      }
    });
  };

  // Mints a PUBLIC single-use tokenized questionnaire link bound to this
  // member and copies the /q/<token> URL to the clipboard. The recipient
  // needs no account to open it.
  const generatePublicLink = () => {
    setFeedback(null);
    setPendingKind('public-link');
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/token-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectUserId: memberId }),
        });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? 'Could not generate a link right now.');
        }
        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(data.url);
            copied = true;
          }
        } catch {
          copied = false;
        }
        setFeedback({
          kind: 'public-link',
          ok: true,
          message: copied
            ? `Public questionnaire link copied to clipboard: ${data.url}`
            : `Public questionnaire link: ${data.url}`,
        });
      } catch (err) {
        setFeedback({
          kind: 'public-link',
          ok: false,
          message: err instanceof Error ? err.message : 'Could not generate a link right now.',
        });
      } finally {
        setPendingKind(null);
      }
    });
  };

  const btnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    padding: '0.55rem 0.95rem',
    borderRadius: '0.45rem',
    border: '1px solid var(--color-accent, #ad2c4d)',
    background: 'var(--color-accent, #ad2c4d)',
    color: 'var(--wa-on-accent-control)',
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        <button
          type="button"
          onClick={() => send('interview')}
          disabled={isPending}
          style={{ ...btnStyle, cursor: isPending ? 'wait' : 'pointer' }}
        >
          {isPending && pendingKind === 'interview' ? 'Sending…' : 'Send interview prep link'}
        </button>
        <button
          type="button"
          onClick={() => send('eligibility')}
          disabled={isPending}
          style={{ ...btnStyle, cursor: isPending ? 'wait' : 'pointer' }}
        >
          {isPending && pendingKind === 'eligibility' ? 'Sending…' : 'Send eligibility questionnaire'}
        </button>
        <button
          type="button"
          onClick={generatePublicLink}
          disabled={isPending}
          style={{ ...btnStyle, cursor: isPending ? 'wait' : 'pointer' }}
        >
          {isPending && pendingKind === 'public-link' ? 'Generating…' : 'Copy public questionnaire link'}
        </button>
      </div>

      {feedback ? (
        <p
          role={feedback.ok ? 'status' : 'alert'}
          style={{
            marginTop: '0.6rem',
            marginBottom: 0,
            fontSize: '0.85rem',
            color: feedback.ok ? 'var(--wa-success-dark)' : 'rgb(153,27,27)',
          }}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
