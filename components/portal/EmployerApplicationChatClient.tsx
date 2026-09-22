'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type AppMsg = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  isFromEmployer: boolean;
};

type Props = {
  applicationId: string;
  studentName: string;
  jobTitle: string;
  initialMessages: AppMsg[];
};

export default function EmployerApplicationChatClient({
  applicationId,
  studentName,
  jobTitle,
  initialMessages,
}: Props) {
  const apiPath = `/api/employer/applications/${applicationId}/messages`;
  const [messages, setMessages] = useState<AppMsg[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(async () => {
    try {
      await fetch(apiPath, { method: 'PATCH', credentials: 'include' });
    } catch {
      /* ignore */
    }
  }, [apiPath]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    void markRead();
  }, [messages.length, markRead]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch(apiPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Send failed');
        return;
      }
      const msg = data.message as AppMsg | undefined;
      if (msg) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setDraft('');
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  const initials = studentName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--color-border, #ebe7e7)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.875rem',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '9999px',
            background: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: 'var(--wa-on-accent-control)',
            fontSize: '0.8125rem',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>{studentName}</p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }} className="wa-truncate">
            {jobTitle}
          </p>
        </div>
      </div>

      <div
        className="member-counselor-chat__scroll"
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
        role="log"
        aria-live="polite"
      >
        {error ? (
          <p className="member-counselor-chat__error" role="alert">
            {error}
          </p>
        ) : null}
        {messages.length === 0 ? (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
            No messages yet. Start the conversation about this application.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.isFromEmployer;
            return (
              <div
                key={m.id}
                className={`member-counselor-chat__bubble${mine ? ' member-counselor-chat__bubble--mine' : ''}`}
                style={{ maxWidth: 'min(100%, 420px)', alignSelf: mine ? 'flex-end' : 'flex-start' }}
              >
                <div className="member-counselor-chat__bubble-body">{m.body}</div>
                <time className="member-counselor-chat__bubble-time" dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleString()}
                </time>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--color-border, #ebe7e7)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-end',
        }}
      >
        <label htmlFor="employer-application-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="employer-application-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          rows={2}
          maxLength={5000}
          className="member-counselor-chat__input"
          style={{ flex: 1, maxWidth: 'none', minHeight: '3rem' }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending || !draft.trim()}
          style={{ flexShrink: 0 }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
