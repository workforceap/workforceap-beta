'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit';

// ── Types ────────────────────────────────────────────────────────────────────

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
  counselorInitials: string;
  messages: MessageDto[];
  memberUserId: string;
  lastMsgText: string;
  lastMsgTime: string;
  unreadCount: number;
};

// ── Career Tip Card ───────────────────────────────────────────────────────────

function CareerTipCard() {
  return (
    <div className="portal-messages-tip-card portal-messages-tip-card--compact" role="note">
      <span className="material-symbols-outlined portal-messages-tip-card__icon" aria-hidden>
        tips_and_updates
      </span>
      <div className="portal-messages-tip-card__text">
        <strong className="portal-messages-tip-card__title">Career tip</strong>
        <p className="portal-messages-tip-card__body">
          When you reply quickly, your counselor can act on your goals faster — they reply within 2 business days.
        </p>
      </div>
    </div>
  );
}

// ── Main Client ───────────────────────────────────────────────────────────────

export default function MemberMessagesMobileClient({ initial }: { initial: InitialPayload }) {
  const {
    memberUserId,
    counselorName,
    counselorInitials,
    lastMsgText,
    lastMsgTime,
    unreadCount: initialUnread,
  } = initial;

  const [thread, setThread] = useState(initial.thread);
  const [messages, setMessages] = useState<MessageDto[]>(initial.messages);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [view, setView] = useState<'list' | 'thread'>('list');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('empty');
  const [searchQuery, setSearchQuery] = useState('');

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
          setUnreadCount(0);
        }
        try { window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh')); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (view === 'thread') {
      // Nothing to scroll to on an empty thread — and the shell is 100dvh /
      // overflow hidden under the sticky top bar, so scrolling the window would
      // push the empty state's icon and title out of the first viewport.
      if (messages.length > 0) scrollToBottom();
      void markRead();
    }
  }, [view, messages.length, scrollToBottom, markRead]);

  // Realtime subscription
  const threadId = thread.id;
  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`member-thread:${threadId}:mobile`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}`,
        }, (payload) => {
          if (cancelled) return;
          const row = payload.new as Record<string, unknown>;
          const id = String(row.id ?? '');
          const authorId = String(row.author_id ?? '');
          const body = String(row.body ?? '');
          const createdAt = row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString();
          if (!id) return;
          setMessages((prev) => prev.some((m) => m.id === id) ? prev : [...prev, { id, threadId, authorId, body, createdAt }]);
          if (authorId !== memberUserId) setUnreadCount((c) => c + 1);
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'message_threads', filter: `id=eq.${threadId}`,
        }, (payload) => {
          if (cancelled) return;
          const row = payload.new as Record<string, unknown>;
          setThread((t) => ({
            ...t,
            counselorUserId: row.counselor_user_id != null ? String(row.counselor_user_id) : t.counselorUserId,
            memberLastReadAt: row.member_last_read_at != null ? new Date(String(row.member_last_read_at)).toISOString() : t.memberLastReadAt,
            counselorLastReadAt: row.counselor_last_read_at != null ? new Date(String(row.counselor_last_read_at)).toISOString() : t.counselorLastReadAt,
          }));
        })
        .subscribe();
      return () => { cancelled = true; void supabase.removeChannel(channel); };
    } catch (e) {
      console.warn('[MemberMessages] Realtime unavailable', e);
      return undefined;
    }
  }, [threadId, memberUserId]);

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
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      }
      setDraft('');
      try { window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh')); } catch { /* ignore */ }
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  // ── Conversation List View ──────────────────────────────────────────────────
  if (view === 'list') {
    const displayLastMsg = messages.length > 0
      ? (messages[messages.length - 1].body ?? '').slice(0, 60)
      : lastMsgText;
    const displayLastTime = messages.length > 0
      ? new Date(messages[messages.length - 1].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : lastMsgTime;

    const q = searchQuery.trim().toLowerCase();
    const rowMatches = (title: string, preview: string) => {
      if (!q) return true;
      return `${title} ${preview}`.toLowerCase().includes(q);
    };
    const showCounselor = rowMatches(counselorName ?? 'Counselor', displayLastMsg);

    return (
      <div className="portal-messages-shell">
        {/* Header */}
        <header className="portal-messages-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/dashboard" className="portal-messages-header-btn" aria-label="Back to dashboard">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                arrow_back
              </span>
            </Link>
            <h2 className="portal-messages-title">Messages</h2>
          </div>
          <button
            type="button"
            className="portal-messages-header-btn"
            aria-label="Focus search"
            onClick={() => searchInputRef.current?.focus()}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              edit_square
            </span>
          </button>
        </header>

        {/* Search */}
        <div className="portal-messages-search">
          <div className="portal-messages-search-wrap">
            <span className="material-symbols-outlined portal-messages-search-icon">search</span>
            <label htmlFor="portal-messages-search-input" className="sr-only">
              Search conversations
            </label>
            <input
              id="portal-messages-search-input"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="portal-messages-search-input"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Thread list */}
        <main style={{ flex: 1, paddingBottom: '6rem', overflowY: 'auto' }}>
          <div style={{ padding: '4px 8px 0' }}>
            {/* Counselor thread — active/unread */}
            {showCounselor && (
            <div style={{ padding: '2px 8px' }}>
              <button
                type="button"
                onClick={() => setView('thread')}
                className="portal-messages-thread-btn"
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="portal-messages-avatar">{counselorInitials}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-on-surface)', margin: 0 }}>
                      {counselorName ?? 'Your Counselor'}
                    </h3>
                    {displayLastTime && (
                      <span style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                        {displayLastTime}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLastMsg || 'Tap to start chatting'}</p>
                    {unreadCount > 0 && (
                      <span className="portal-messages-badge">{unreadCount}</span>
                    )}
                  </div>
                </div>
              </button>
            </div>
            )}

            <CareerTipCard />
          </div>
        </main>
      </div>
    );
  }

  // ── Thread / Chat View ──────────────────────────────────────────────────────
  return (
    <div className="md:wa-hidden wa-flex wa-flex-col portal-messages-shell portal-messages-shell--thread">
      {/* Header */}
      <header className="wa-flex-shrink-0 wa-flex wa-items-center wa-gap-3 wa-px-4 wa-py-3 portal-messages-header">
        <button
          type="button"
          onClick={() => setView('list')}
          className="portal-messages-header-btn hover:wa-bg-[var(--surface-container)] active:wa-scale-95 wa-transition-transform"
          aria-label="Back to messages"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="portal-messages-avatar wa-w-9 wa-h-9 wa-text-xs">{counselorInitials}</div>
        <div className="wa-flex-1 wa-min-w-0">
          <p className="wa-font-bold wa-text-sm wa-leading-tight wa-truncate" style={{ color: 'var(--color-on-surface)' }}>
            {counselorName ?? 'Your Counselor'}
          </p>
          {thread.counselorUserId && (
            <p className="wa-text-[13px]" style={{ color: 'var(--color-on-surface-variant)' }}>
              Replies within 2 business days
            </p>
          )}
        </div>
      </header>

      {/* Message scroll area */}
      <div
        className="wa-flex-1 wa-overflow-y-auto wa-px-4 wa-py-4 wa-space-y-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          /* Same two situations as the desktop client: first message vs. no
             counselor assigned yet (honest, warn); writing works in both. */
          <div className="wa-flex wa-flex-col wa-justify-center wa-h-full">
          <KitEmptyState
            kind={thread.counselorUserId ? 'first' : 'unavailable'}
            framed
            icon={
              <span className="material-symbols-outlined wa-text-2xl" style={{ color: 'var(--wa-accent-text)' }}>
                chat_bubble_outline
              </span>
            }
            title={thread.counselorUserId ? t('counselorThread.title') : t('counselorUnassigned.title')}
            description={thread.counselorUserId ? t('counselorThread.body') : t('counselorUnassigned.body')}
            primaryAction={{
              label: thread.counselorUserId ? t('counselorThread.action') : t('counselorUnassigned.action'),
              onClick: () => composeRef.current?.focus(),
            }}
          />
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === memberUserId;
            const timeStr = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={m.id}
                className={`wa-flex wa-flex-col ${mine ? 'wa-items-end' : 'wa-items-start'}`}
              >
                <div
                  className={`wa-max-w-[78%] wa-px-4 wa-py-2.5 wa-text-sm wa-leading-snug ${
                    mine ? 'portal-messages-bubble--mine' : 'portal-messages-bubble--them'
                  }`}
                >
                  {m.body}
                </div>
                <time
                  className="wa-text-[13px] wa-mt-1 wa-px-1"
                  style={{ color: 'var(--color-on-surface-variant)', opacity: 0.75 }}
                >
                  {timeStr}
                </time>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div
          className="wa-flex-shrink-0 wa-mx-4 wa-mb-2 wa-px-3 wa-py-2 wa-rounded-lg wa-text-xs wa-text-white"
          style={{ background: 'var(--color-error, #ba1a1a)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Compose input — pinned at bottom */}
      <form
        onSubmit={send}
        className="wa-flex-shrink-0 wa-flex wa-items-end wa-gap-2 wa-px-3 wa-py-3 portal-messages-compose"
      >
        <label htmlFor="portal-messages-compose-input" className="sr-only">
          Message
        </label>
        <textarea
          id="portal-messages-compose-input"
          ref={composeRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Type a message…"
          maxLength={8000}
          rows={1}
          className="wa-flex-1 wa-resize-none wa-px-4 wa-py-3 wa-rounded-2xl wa-text-sm portal-messages-compose-input focus:wa-outline-none focus:wa-ring-2 focus:wa-ring-[var(--color-accent)]/35"
          style={{ maxHeight: '8rem', overflowY: 'auto' }}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="wa-flex-shrink-0 wa-w-11 wa-h-11 wa-rounded-full wa-flex wa-items-center wa-justify-center active:wa-scale-95 wa-transition-all"
          style={{
            background: draft.trim() ? 'var(--color-accent-dark, #6b0c29)' : 'var(--surface-container-high)',
            color: draft.trim() ? '#fff' : 'var(--color-on-surface-variant)',
          }}
          aria-label="Send message"
        >
          <span className="material-symbols-outlined wa-text-[20px]">send</span>
        </button>
      </form>
    </div>
  );
}
