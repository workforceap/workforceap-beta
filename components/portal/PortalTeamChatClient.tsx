'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import {
  employerMessagingSurface,
  partnerMessagingSurface,
} from '@/lib/portal/messagingSurfaces';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { KitEmptyState } from '@/components/portal/kit';

type MessageDto = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

type ThreadDto = {
  id: string;
  portalUserLastReadAt: string | null;
};

type InitialPayload = {
  thread: ThreadDto;
  messages: MessageDto[];
  portalUserId: string;
};

function dispatchBadgeRefresh() {
  try {
    window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh'));
  } catch {
    /* ignore */
  }
}

type PortalTeamChatClientProps = {
  apiPath: string;
  initial: InitialPayload;
  subtitle: string;
  /** Empty-thread copy (KIT_GUIDE §6 `first`, from the surface's `empty.*`); the action focuses the composer. */
  empty: { title: string; description: string; action: string };
  /** Matches voice-agent surfaces — partner vs employer gradient. */
  surfaceVariant: 'partner' | 'employer';
  /** Render without the outer voice-agent shell when embedded in another inbox shell. */
  decorated?: boolean;
  /** Server-validated subject for a shared team conversation. */
  contextLabel?: string;
  /** Optional contextual text placed in the composer, still requiring send. */
  initialDraft?: string;
  /** Acknowledge the last rendered message; legacy employer API stays unchanged. */
  readCursorMode?: boolean;
};

export default function PortalTeamChatClient({
  apiPath,
  initial,
  subtitle,
  empty,
  surfaceVariant,
  decorated = true,
  contextLabel,
  initialDraft = '',
  readCursorMode = false,
}: PortalTeamChatClientProps) {
  const { portalUserId } = initial;
  const [thread, setThread] = useState(initial.thread);
  const [messages, setMessages] = useState(initial.messages);
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const lastRenderedMessageId = messages[messages.length - 1]?.id ?? null;
  const renderedReadCursor = useRef<string | null>(null);
  useEffect(() => {
    renderedReadCursor.current = lastRenderedMessageId;
  }, [lastRenderedMessageId]);

  const scrollToBottom = useCallback(() => {
    const log = scrollRef.current;
    // Keep the conversation at its newest reply without scrolling the outer
    // portal page past the conversation and into its footer on mobile.
    log?.scrollTo({ top: log.scrollHeight, behavior: scrollBehavior() });
  }, []);

  const markRead = useCallback(async () => {
    try {
      const lastReadMessageId = renderedReadCursor.current;
      if (readCursorMode && !lastReadMessageId) return;
      const r = await fetch(apiPath, {
        method: 'PATCH', credentials: 'include',
        ...(readCursorMode ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadMessageId }),
        } : {}),
      });
      if (r.ok) {
        const d = (await r.json()) as { portalUserLastReadAt?: string };
        if (d.portalUserLastReadAt) {
          setThread((t) => ({ ...t, portalUserLastReadAt: d.portalUserLastReadAt! }));
        }
        dispatchBadgeRefresh();
      }
    } catch {
      /* ignore */
    }
  }, [apiPath, readCursorMode]);

  useEffect(() => {
    scrollToBottom();
    void markRead();
  }, [messages.length, lastRenderedMessageId, scrollToBottom, markRead]);

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
      const channel = supabase
        .channel(`portal-thread:${threadId}`)
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
            // Cursor mode acknowledges in the post-render effect above. The
            // realtime callback must not acknowledge an unseen payload.
            if (!readCursorMode && authorId !== portalUserId) void markRead();
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('[PortalTeamChat] Realtime unavailable', e);
      return undefined;
    }
  }, [threadId, portalUserId, markRead, readCursorMode]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const submittedDraft = draft;
    const text = draft.trim();
    if (!text || text === initialDraft.trim() || sendingRef.current) return;
    sendingRef.current = true;
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
      const msg = data.message as MessageDto | undefined;
      if (msg) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setDraft((current) => current === submittedDraft ? '' : current);
      dispatchBadgeRefresh();
    } catch {
      setError('Network error');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const hint = useMemo(() => subtitle, [subtitle]);
  const surface =
    surfaceVariant === 'employer' ? employerMessagingSurface : partnerMessagingSurface;

  const inner = (
    <div className="member-counselor-chat">
      {contextLabel ? (
        <div
          role="status"
          style={{
            marginBottom: '0.75rem',
            padding: '0.7rem 0.85rem',
            borderRadius: '0.65rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.85rem',
          }}
        >
          Message context: <strong style={{ color: 'var(--color-on-surface)' }}>{contextLabel}</strong>
        </div>
      ) : null}
      {error ? (
        <p className="member-counselor-chat__error" role="alert">
          {error}
        </p>
      ) : null}
      <div ref={scrollRef} className="member-counselor-chat__scroll" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <KitEmptyState
            kind="first"
            title={empty.title}
            description={empty.description}
            primaryAction={{ label: empty.action, onClick: () => inputRef.current?.focus() }}
          />
        ) : (
          messages.map((m) => {
            const mine = m.authorId === portalUserId;
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
      </div>
      <form className="member-counselor-chat__form" onSubmit={send}>
        <label htmlFor="portal-team-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="portal-team-chat-input"
          ref={inputRef}
          className="member-counselor-chat__input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={8000}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending || !draft.trim() || draft.trim() === initialDraft.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );

  if (!decorated) return inner;

  return (
    <VoiceAgentSurface {...surface} subtext={hint}>
      {inner}
    </VoiceAgentSurface>
  );
}
