'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { Avatar } from './Avatar';
import { KitEmptyState } from './KitEmptyState';
import { formatPortalDate, formatPortalDateTime, formatPortalTime } from '@/lib/formatDate';

export interface ChatMessage {
  id: string;
  from: 'self' | 'other';
  text: string;
  /** Label/avatar content for "other" messages (e.g. initials). */
  author?: ReactNode;
  /** Persisted server timestamp. Omit for optimistic/undated messages. */
  createdAt?: string;
  pending?: boolean;
}

interface ChatThreadProps {
  messages: ChatMessage[];
  placeholder?: string;
  onSend?: (text: string) => void | boolean | Promise<void | boolean>;
  /** Initial, editable context. Never sends until the member submits. */
  initialText?: string;
  multiline?: boolean;
  /**
   * Empty-thread copy (KIT_GUIDE §6 `first`): the composer is the first
   * action, so the action focuses it. Surfaces with a translator pass their
   * `empty.*` strings (MemberMessagesKit does); the defaults are kit English.
   */
  empty?: { title: string; description?: string; action?: string };
  /** Surface-owned translations; kit previews retain English defaults. */
  labels?: { newMessage: string; pending: string; send: string; sending: string; history: string };
  /** Reserve room above the fixed member tabs on narrow inbox layouts. */
  composerClassName?: string;
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
 * Persisted timestamps use the portal timezone; pending sends have no invented
 * timestamp. Follow the inner log only while near its end or after an explicit
 * send. Incoming messages never move a reader away from older history.
 */
export function ChatThread({ messages, placeholder = 'Type a message…', onSend, initialText = '', multiline = false, empty, labels, composerClassName }: ChatThreadProps) {
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const sendingRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const canSend = Boolean(onSend);

  useEffect(() => {
    const log = logRef.current;
    const hasAddedMessages = messages.some((message) => !previousIdsRef.current.has(message.id));
    previousIdsRef.current = new Set(messages.map((message) => message.id));
    if (!log) return;
    if (followLatestRef.current) {
      // Assign only the inner scroller, with no smooth animation or ancestor
      // scroll. This also respects reduced motion without a second code path.
      log.scrollTop = log.scrollHeight;
      setHasNewMessages(false);
    } else if (hasAddedMessages) {
      setHasNewMessages(true);
    }
  }, [messages]);

  const showLatest = () => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    followLatestRef.current = true;
    setHasNewMessages(false);
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !onSend || sendingRef.current) return;
    const submittedRevision = draftRevisionRef.current;
    sendingRef.current = true;
    // Choosing Send is an explicit request to follow this new contribution.
    // Subsequent manual scrolling can turn following off again while pending.
    showLatest();
    setSending(true);
    try {
      const accepted = await onSend(t);
      if (accepted !== false && draftRevisionRef.current === submittedRevision) setText('');
    } catch {
      // The caller owns error presentation; a retry must retain the draft.
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        ref={logRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}
        className="wa-kit-focus"
        role="log"
        tabIndex={0}
        aria-label={labels?.history ?? 'Message history'}
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(event) => {
          const log = event.currentTarget;
          followLatestRef.current = log.scrollHeight - log.scrollTop - log.clientHeight <= 48;
          if (followLatestRef.current) setHasNewMessages(false);
        }}
      >
        {messages.length === 0 ? (
          <KitEmptyState
            kind="first"
            title={empty?.title ?? 'No messages yet'}
            description={empty?.description ?? (canSend ? 'Write your first message and the conversation appears here.' : 'Nothing has been sent in this thread yet.')}
            primaryAction={canSend ? { label: empty?.action ?? 'Write a message', onClick: () => inputRef.current?.focus() } : undefined}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, index) => {
              const mine = m.from === 'self';
              const day = m.createdAt && !m.pending ? formatPortalDate(m.createdAt) : '';
              const previousDate = messages[index - 1]?.createdAt;
              const previousDay = previousDate ? formatPortalDate(previousDate) : '';
              const time = m.createdAt && !m.pending ? formatPortalTime(m.createdAt) : '';
              return (
                <li
                  key={m.id}
                  data-message-id={m.id}
                >
                  {day && day !== previousDay ? <p className="wa-kit-meta" style={{ textAlign: 'center', margin: 'var(--wa-pad-sm) 0' }}>{day}</p> : null}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-end',
                      gap: 8,
                    }}
                  >
                    {mine ? null : <Avatar initials={authorLabel(m.author).slice(0, 2)} size={28} />}
                    <div style={{ maxWidth: '80%', minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          padding: '10px 14px',
                          borderRadius: mine
                            ? 'var(--wa-radius-sm) var(--wa-radius-sm) 4px var(--wa-radius-sm)'
                            : 'var(--wa-radius-sm) var(--wa-radius-sm) var(--wa-radius-sm) 4px',
                          background: mine ? 'var(--wa-accent-soft)' : 'var(--wa-bg)',
                          border: mine ? 'none' : '1px solid var(--wa-border)',
                          color: 'var(--wa-text)',
                          fontSize: 'var(--wa-type-body)',
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {m.text}
                      </p>
                      {m.pending ? <span className="wa-kit-meta">{labels?.pending ?? 'Sending…'}</span> : time ? (
                        <time className="wa-kit-meta" dateTime={m.createdAt} title={formatPortalDateTime(m.createdAt!)} style={{ display: 'block', textAlign: mine ? 'right' : 'left' }}>
                          {time}
                        </time>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {hasNewMessages ? (
        <button type="button" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" onClick={() => { showLatest(); logRef.current?.focus({ preventScroll: true }); }} style={{ alignSelf: 'center', flexShrink: 0 }}>
          {labels?.newMessage ?? 'New message — show latest'}
        </button>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className={`wa-flex wa-items-center${composerClassName ? ` ${composerClassName}` : ''}`}
        style={{ marginTop: 12, flexShrink: 0, gap: 8 }}
      >
        <label className="wa-sr-only" htmlFor="wa-kit-chat-input">
          {placeholder}
        </label>
        {multiline ? <textarea
          id="wa-kit-chat-input"
          ref={(el) => { inputRef.current = el; }}
          className="wa-kit-focus"
          value={text}
          onChange={(e) => { draftRevisionRef.current += 1; setText(e.target.value); }}
          placeholder={placeholder}
          disabled={!canSend}
          rows={8}
          maxLength={8000}
          style={{
            flex: 1, minWidth: 0, padding: 'var(--wa-pad-sm)',
            border: '1px solid var(--wa-border)', borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-bg)', color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-body)', lineHeight: 1.5, resize: 'vertical', maxHeight: 'min(16rem, 24dvh)',
          }}
        /> : <input
          id="wa-kit-chat-input"
          ref={(el) => { inputRef.current = el; }}
          className="wa-kit-focus"
          value={text}
          onChange={(e) => { draftRevisionRef.current += 1; setText(e.target.value); }}
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
          aria-label={sending ? labels?.sending ?? 'Sending message' : labels?.send ?? 'Send message'}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            border: 'none',
            borderRadius: 999,
            background: 'var(--wa-accent-fill)',
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
