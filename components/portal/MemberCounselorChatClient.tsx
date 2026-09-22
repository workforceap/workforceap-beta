'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit';
import { memberMessagingSurface } from '@/lib/portal/messagingSurfaces';
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
};

type InitialPayload = {
  thread: ThreadDto;
  counselorName: string | null;
  messages: MessageDto[];
  memberUserId: string;
};

function dispatchBadgeRefresh() {
  try {
    window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh'));
  } catch {
    /* ignore */
  }
}

export default function MemberCounselorChatClient({
  initial,
}: {
  initial: InitialPayload;
}) {
  const { memberUserId } = initial;
  const [thread, setThread] = useState(initial.thread);
  const [messages, setMessages] = useState<MessageDto[]>(initial.messages);
  const [counselorName] = useState(initial.counselorName);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const realtimeInstanceRef = useRef(0);
  const t = useTranslations('empty');

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, []);

  const markRead = useCallback(async () => {
    try {
      const r = await fetch('/api/member/messages', { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        const d = (await r.json()) as { memberLastReadAt?: string };
        if (d.memberLastReadAt) {
          setThread((t) => ({ ...t, memberLastReadAt: d.memberLastReadAt! }));
        }
        dispatchBadgeRefresh();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
    void markRead();
  }, [messages.length, scrollToBottom, markRead]);

  useEffect(() => {
    const onFocus = () => void markRead();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [markRead]);

  const threadId = thread.id;

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      realtimeInstanceRef.current += 1;
      const channel = supabase
        .channel(`member-thread:${threadId}:desktop`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? '');
            const authorId = String(row.author_id ?? '');
            const body = String(row.body ?? '');
            const createdAt = row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString();
            if (!id) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === id)) return prev;
              return [...prev, { id, threadId, authorId, body, createdAt }];
            });
            if (authorId !== memberUserId) void markRead();
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
      console.warn('[MemberCounselorChat] Realtime unavailable', e);
      return undefined;
    }
  }, [threadId, memberUserId, markRead]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch('/api/member/messages', {
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
      const msg = data.message as MessageDto | undefined;
      if (msg) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setDraft('');
      dispatchBadgeRefresh();
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  const subtitle = useMemo(() => {
    /* Always include "your counselor" so the line reads correctly even when
       the member and the counselor share a name (audit #11). */
    if (counselorName) return `Chat with your counselor, ${counselorName} — replies within 2 business days`;
    if (thread.counselorUserId) return 'Your counselor replies within 2 business days.';
    return 'A counselor will be assigned to you — leave a message anytime, replies within 2 business days.';
  }, [counselorName, thread.counselorUserId]);

  return (
    <VoiceAgentSurface {...memberMessagingSurface} subtext={subtitle}>
      <div className="member-counselor-chat">
      {error ? (
        <p className="member-counselor-chat__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="member-counselor-chat__scroll" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          /* A thread with no messages is the first step (`first`); with no
             counselor assigned yet it is honest about who reads it
             (`unavailable`, warn) — the member can still write either way. */
          <KitEmptyState
            kind={thread.counselorUserId ? 'first' : 'unavailable'}
            framed
            icon={
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>
                chat_bubble_outline
              </span>
            }
            title={thread.counselorUserId ? t('counselorThread.title') : t('counselorUnassigned.title')}
            description={thread.counselorUserId ? t('counselorThread.body') : t('counselorUnassigned.body')}
            primaryAction={{
              label: thread.counselorUserId ? t('counselorThread.action') : t('counselorUnassigned.action'),
              onClick: () => inputRef.current?.focus(),
            }}
          />
        ) : (
          messages.map((m) => {
            const mine = m.authorId === memberUserId;
            return (
              <div
                key={m.id}
                className={`member-counselor-chat__bubble${mine ? ' member-counselor-chat__bubble--mine' : ''}`}
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
      <form className="member-counselor-chat__form" onSubmit={send}>
        <label htmlFor="member-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="member-chat-input"
          ref={inputRef}
          className="member-counselor-chat__input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={8000}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      </div>
    </VoiceAgentSurface>
  );
}
