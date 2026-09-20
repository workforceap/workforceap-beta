'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { Avatar } from './Avatar';

export interface ChatMessage {
  id: string;
  from: 'self' | 'other';
  text: string;
  /** Label/avatar content for "other" messages (e.g. initials). */
  author?: ReactNode;
}

interface ChatThreadProps {
  messages: ChatMessage[];
  placeholder?: string;
  onSend?: (text: string) => void | boolean | Promise<void | boolean>;
  /** Initial, editable context. Never sends until the member submits. */
  initialText?: string;
  multiline?: boolean;
}

function authorLabel(author: ReactNode | undefined): string {
  if (author == null) return 'CS';
  if (typeof author === 'string' || typeof author === 'number') return String(author);
  return 'CS';
}

/**
 * Message thread + composer — kit-native (no Astryx Chat). Member↔counselor
 * inbox and AI advisor surfaces. Uses `--wa-*` bubbles so messages read as
 * the same product as the rest of the member portal. Optional contextual drafts
 * are editable; asynchronous send failures preserve the current composer text.
 */
export function ChatThread({ messages, placeholder = 'Type a message…', onSend, initialText = '', multiline = false }: ChatThreadProps) {
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const canSend = Boolean(onSend);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !onSend || sending) return;
    const submitted = text;
    setSending(true);
    try {
      const accepted = await onSend(t);
      if (accepted !== false) setText((current) => current === submitted ? '' : current);
    } catch {
      // The caller owns error presentation; a retry must retain the draft.
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <p className="wa-kit-lede" style={{ margin: 0 }}>
            {canSend ? 'No messages yet. Type below to start this thread.' : 'No messages in this thread yet.'}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => {
              const mine = m.from === 'self';
              return (
                <li
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end',
                    gap: 8,
                  }}
                >
                  {mine ? null : <Avatar initials={authorLabel(m.author).slice(0, 2)} size={28} />}
                  <p
                    style={{
                      margin: 0,
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: mine
                        ? 'var(--wa-radius-sm) var(--wa-radius-sm) 4px var(--wa-radius-sm)'
                        : 'var(--wa-radius-sm) var(--wa-radius-sm) var(--wa-radius-sm) 4px',
                      background: mine ? 'var(--wa-accent-soft)' : 'var(--wa-bg)',
                      border: mine ? 'none' : '1px solid var(--wa-border)',
                      color: 'var(--wa-text)',
                      fontSize: 'var(--wa-type-body)',
                      lineHeight: 1.45,
                    }}
                  >
                    {m.text}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="wa-flex wa-items-center"
        style={{ marginTop: 12, flexShrink: 0, gap: 8 }}
      >
        <label className="wa-sr-only" htmlFor="wa-kit-chat-input">
          {placeholder}
        </label>
        {multiline ? <textarea
          id="wa-kit-chat-input"
          className="wa-kit-focus"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={!canSend}
          rows={8}
          maxLength={8000}
          style={{
            flex: 1, minWidth: 0, padding: 'var(--wa-pad-sm)',
            border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-bg)', color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-body)', lineHeight: 1.5, resize: 'vertical',
          }}
        /> : <input
          id="wa-kit-chat-input"
          className="wa-kit-focus"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={!canSend}
          autoComplete="off"
          maxLength={8000}
          style={{
            flex: 1,
            minHeight: 44,
            minWidth: 0,
            padding: '10px 16px',
            border: '1px solid var(--wa-border)',
            borderRadius: 999,
            background: 'var(--wa-bg)',
            color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-body)',
          }}
        />}
        <button
          type="submit"
          className="wa-kit-focus hover:wa-opacity-90"
          disabled={!canSend || !text.trim() || sending}
          aria-label={sending ? 'Sending message' : 'Send message'}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            border: 'none',
            borderRadius: 999,
            background: 'var(--wa-accent)',
            color: 'var(--wa-on-accent-control)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend && text.trim() ? 'pointer' : 'not-allowed',
            opacity: canSend && text.trim() ? 1 : 0.45,
          }}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
