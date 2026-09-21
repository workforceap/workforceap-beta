'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import {
  adminMessagingSurface,
  counselorStaffMessagingSurface,
} from '@/lib/portal/messagingSurfaces';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type ThreadDto = {
  id: string;
  memberId: string | null;
  counselorUserId: string | null;
  memberLastReadAt: string | null;
  counselorLastReadAt: string | null;
};

type MessageDto = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
  authorName: string;
};

type InitialPayload = {
  member: { id: string; fullName: string };
  thread: ThreadDto;
  messages: MessageDto[];
  staffUserId: string;
};

/** Base path for GET/POST/PATCH (e.g. /api/admin/members/:id/messages or /api/counselor/members/:id/messages) */
function MemberCounselorConversation({
  initial,
  messagesApiBase,
  compact,
  messagingSurface = 'counselor',
  readCursorMode = false,
}: {
  initial: InitialPayload;
  messagesApiBase?: string;
  /** Hide sync / read-receipt helper (e.g. inbox split layout). */
  compact?: boolean;
  /** Gradient shell like voice agents; `none` for plain layout. */
  messagingSurface?: 'counselor' | 'admin' | 'none';
  /** Opt in only for routes that acknowledge a loaded message cursor. */
  readCursorMode?: boolean;
}) {
  const { staffUserId, member } = initial;
  const apiBase = messagesApiBase ?? `/api/admin/members/${member.id}/messages`;
  const [thread, setThread] = useState(initial.thread);
  const [messages, setMessages] = useState<MessageDto[]>(initial.messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const draftRevision = useRef(0);
  const sendingRef = useRef(false);
  const inputId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const realtimeInstanceRef = useRef(0);
  // Skip the auto-scroll on initial mount so the surrounding member detail
  // page loads scrolled to the top instead of jumping down to the chat thread.
  const hasMountedRef = useRef(false);

  const markRead = useCallback(async (messageId?: string) => {
    if (readCursorMode && !messageId) return;
    try {
      await fetch(apiBase, {
        method: 'PATCH', credentials: 'include',
        ...(readCursorMode ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadMessageId: messageId }),
        } : {}),
      });
    } catch {
      /* ignore */
    }
  }, [apiBase, readCursorMode]);

  const lastRenderedMessageId = messages.at(-1)?.id;

  useEffect(() => {
    if (hasMountedRef.current) {
      // Only auto-scroll the chat into view for messages that arrive after the
      // initial render (e.g. realtime/sent messages), never on first mount.
      bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    } else {
      hasMountedRef.current = true;
    }
    void markRead(lastRenderedMessageId);
  }, [messages.length, lastRenderedMessageId, markRead]);

  const threadId = thread.id;

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      realtimeInstanceRef.current += 1;
      const channel = supabase
        .channel(`staff-thread:${threadId}:${realtimeInstanceRef.current}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
          async (payload) => {
            if (cancelled) return;
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? '');
            const authorId = String(row.author_id ?? '');
            const body = String(row.body ?? '');
            const createdAt = row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString();
            if (!id) return;
            const authorName =
              authorId === member.id
                ? member.fullName
                : authorId === staffUserId
                  ? 'You'
                  : 'Counselor';
            setMessages((prev) => {
              if (prev.some((m) => m.id === id)) return prev;
              return [...prev, { id, threadId, authorId, body, createdAt, authorName }];
            });
            if (authorId === member.id && !readCursorMode) void markRead();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'message_threads', filter: `id=eq.${threadId}` },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Record<string, unknown>;
            setThread((t) => ({
              ...t,
              counselorUserId: row.counselor_user_id != null ? String(row.counselor_user_id) : t.counselorUserId,
              memberLastReadAt:
                row.member_last_read_at != null
                  ? new Date(String(row.member_last_read_at)).toISOString()
                  : t.memberLastReadAt,
              counselorLastReadAt:
                row.counselor_last_read_at != null
                  ? new Date(String(row.counselor_last_read_at)).toISOString()
                  : t.counselorLastReadAt,
            }));
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('[AdminMemberCounselorChat] Realtime unavailable', e);
      return undefined;
    }
  }, [threadId, member.id, member.fullName, staffUserId, markRead, apiBase, readCursorMode]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    const submittedRevision = draftRevision.current;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setSendStatus(null);
    try {
      const r = await fetch(apiBase, {
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
      const msg = data.message as Omit<MessageDto, 'authorName'> | undefined;
      if (!msg || typeof msg.id !== 'string' || !msg.id || msg.threadId !== threadId || msg.authorId !== staffUserId || msg.body !== text || typeof msg.createdAt !== 'string' || !Number.isFinite(Date.parse(msg.createdAt))) {
        setError('Your message could not be confirmed. Your draft is still here. Check the conversation before trying again.');
        return;
      }
      {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, authorName: 'You' }]
        );
      }
      if (draftRevision.current === submittedRevision) {
        setDraft('');
        setSendStatus('Message sent.');
      } else {
        setSendStatus('Message sent. Your newer text is still unsent.');
      }
    } catch {
      setError('Network error');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const readLine = !compact
    ? `Messages sync in real time. Member last read: ${
        thread.memberLastReadAt ? new Date(thread.memberLastReadAt).toLocaleString() : '—'
      }`
    : '';

  const surfacePreset =
    messagingSurface === 'admin' ? adminMessagingSurface : counselorStaffMessagingSurface;
  const useSurface = !compact && messagingSurface !== 'none';

  const inner = (
    <div className="admin-member-counselor-chat">
      {!compact && !useSurface ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
          {readLine}
        </p>
      ) : null}
      {error ? (
        <p className="member-counselor-chat__error" role="alert">
          {error}
        </p>
      ) : null}
      {messages.length === 0 ? (
        // An empty thread renders a line, not the bordered log box: with no bubbles
        // the box collapsed to a stray empty pill above the composer.
        <p className="member-counselor-chat__empty" role="status">
          No messages in this thread yet. The first reply below starts the conversation.
        </p>
      ) : (
      <div className="member-counselor-chat__scroll admin-member-counselor-chat__scroll" role="log" aria-live="polite">
        {messages.map((m) => {
          const fromMember = m.authorId === member.id;
          return (
            <div
              key={m.id}
              className={`member-counselor-chat__bubble${fromMember ? '' : ' member-counselor-chat__bubble--mine'}`}
            >
              <div className="member-counselor-chat__bubble-meta">{m.authorName}</div>
              <div className="member-counselor-chat__bubble-body">{m.body}</div>
              <time className="member-counselor-chat__bubble-time" dateTime={m.createdAt}>
                {new Date(m.createdAt).toLocaleString()}
              </time>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      )}
      {sendStatus && <p role="status" style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}>{sendStatus}</p>}
      <form className="member-counselor-chat__form" onSubmit={send}>
        <label htmlFor={inputId} className="wa-sr-only">
          Reply
        </label>
        <textarea
          id={inputId}
          className="member-counselor-chat__input"
          rows={3}
          value={draft}
          onChange={(e) => { draftRevision.current += 1; setDraft(e.target.value); setSendStatus(null); }}
          placeholder={`Reply to ${member.fullName}…`}
          maxLength={8000}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send reply'}
        </button>
      </form>
    </div>
  );

  if (useSurface) {
    return (
      <VoiceAgentSurface
        {...surfacePreset}
        subtext={readLine || surfacePreset.subtext}
      >
        {inner}
      </VoiceAgentSurface>
    );
  }

  return inner;
}

/** A recipient change starts a separate conversation state, including draft and
 * in-flight response handling; an old response cannot populate the new thread. */
export default function AdminMemberCounselorChatClient(props: Parameters<typeof MemberCounselorConversation>[0]) {
  return <MemberCounselorConversation key={`${props.initial.member.id}:${props.initial.thread.id}:${props.messagesApiBase ?? 'admin'}`} {...props} />;
}
