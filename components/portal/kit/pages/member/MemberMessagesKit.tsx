'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { DesignSurface, Avatar, ChatThread, KitEmptyState, PageOpener, type ChatMessage } from '@/components/portal/kit';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Member Portal — MESSAGES view (counselor / support inbox + thread).
 * Faithful port of `data-view-panel="messages"` in
 * docs/mockups/workforceap-member-suite.html.
 *
 * Interactive (message composer) → 'use client'.
 *
 * Target route: app/(portal)/dashboard/messages
 * Surface: warm (member-facing).
 *
 * Real wiring: when `memberUserId` is supplied, the composer POSTs to the
 * existing legacy member↔counselor endpoint (`/api/member/messages`), the
 * same mechanism `MemberCounselorChatClient` uses. No new backend.
 */

interface Conversation {
  id: string;
  name: string;
  role: string;
  preview: string;
  unread?: boolean;
  active?: boolean;
}

export interface MemberMessagesKitProps {
  conversations?: Conversation[];
  /** Header for the open thread. */
  activeName?: string;
  activeRole?: string;
  activeInitials?: string;
  activeOnline?: boolean;
  messages?: ChatMessage[];
  /**
   * Optional explicit send handler. When omitted but `memberUserId` is set,
   * the composer falls back to the real `/api/member/messages` endpoint.
   * Backward compatible: callers that pass `onSend` keep their behavior.
   */
  onSend?: (text: string) => void | boolean | Promise<void | boolean>;
  /**
   * Current member user id. When provided, the Kit becomes a real, sending
   * inbox backed by the existing counselor-thread API. Initials shown on the
   * member's own bubbles are not needed (right-aligned), so this is only used
   * to enable the live send path.
   */
  memberUserId?: string;
  /** Initials for the "other" party (counselor) on incoming bubbles. */
  otherInitials?: string;
  /**
   * Counselor thread id. When provided alongside `memberUserId`, the Kit
   * subscribes to Supabase realtime inserts on this thread so counselor
   * replies arrive live (no refresh). Mirrors `MemberCounselorChatClient`.
   */
  threadId?: string;
  /** Server-validated assigned course context; never contains private notes. */
  feedbackDraft?: { key: string; text: string };
  feedbackNotice?: string;
}

/**
 * The messages page shell — PageOpener over the warm surface — shared by the
 * inbox and by the page-level empty states in app/(portal)/dashboard/messages
 * (no member row yet, no thread in a read-only audit), so a provisioning
 * inbox reads as the same product as a live one.
 */
export function MemberMessagesFrame({ children }: { children: ReactNode }) {
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Inbox"
          title="Messages"
          lede="Counselor and support in one inbox."
          icon={<MessageCircle size={13} aria-hidden="true" />}
        />
        {children}
      </div>
    </DesignSurface>
  );
}

const DEFAULT_CONVERSATIONS: Conversation[] = [];

const DEFAULT_MESSAGES: ChatMessage[] = [];

export function MemberMessagesKit({
  conversations = DEFAULT_CONVERSATIONS,
  activeName = 'Counselor',
  activeRole = 'Support',
  activeInitials = 'CS',
  activeOnline = false,
  messages: messagesProp = DEFAULT_MESSAGES,
  onSend,
  memberUserId,
  otherInitials = activeInitials,
  threadId,
  feedbackDraft,
  feedbackNotice,
}: MemberMessagesKitProps) {
  const t = useTranslations('empty');
  const [messages, setMessages] = useState<ChatMessage[]>(messagesProp);
  const [error, setError] = useState<string | null>(null);
  // Mobile single-pane navigation: on phones the list and thread cannot sit
  // side-by-side, so we show one pane at a time with a back button. Desktop
  // (md+) ignores this and keeps the two-pane layout via CSS. Default to the
  // open thread so members land on the active conversation.
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('thread');
  // Keep latest "other" initials available to the realtime callback without
  // re-subscribing when they change.
  const otherInitialsRef = useRef(otherInitials);
  otherInitialsRef.current = otherInitials;

  // Read marker: opening the thread (and receiving a counselor reply while it
  // is open) marks it read, the same way the legacy clients do. Without this
  // the badge the nav turns on for a never-opened thread could never clear.
  const markRead = useCallback(async () => {
    if (!memberUserId || !threadId) return;
    try {
      const r = await fetch('/api/member/messages', { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        try {
          window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh'));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, [memberUserId, threadId]);
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  useEffect(() => {
    if (!memberUserId || !threadId) return;
    void markRead();
  }, [memberUserId, threadId, markRead]);

  // Live send path: reuse the existing legacy endpoint that
  // MemberCounselorChatClient posts to. Only active when a real member id is
  // present and no explicit onSend override was passed.
  const sendLive = useCallback(
    async (text: string) => {
      setError(null);
      // Optimistic append so the thread feels responsive; reconcile on response.
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, from: 'self', text }]);
      try {
        const r = await fetch('/api/member/messages', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: { id: string; body: string };
        };
        if (!r.ok || !data.message) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setError(typeof data.error === 'string' ? data.error : 'Send failed');
          return false;
        }
        const saved = data.message;
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { id: saved.id, from: 'self', text: saved.body } : m)),
        );
        try {
          window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh'));
        } catch {
          /* ignore */
        }
        if (feedbackDraft) {
          const url = new URL(window.location.href);
          for (const key of ['program', 'course', 'curriculum']) url.searchParams.delete(key);
          window.history.replaceState(null, '', url);
        }
        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError('Network error');
        return false;
      }
    },
    [feedbackDraft],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (onSend) {
        return onSend(text);
      }
      if (memberUserId) {
        return sendLive(text);
      }
    },
    [onSend, memberUserId, sendLive],
  );

  // Live RECEIVE path: mirror MemberCounselorChatClient's realtime subscription
  // so counselor replies appear without a refresh. Gated on a real member id +
  // thread id; fails soft (current behavior preserved) if realtime is
  // unavailable or the env client cannot be created.
  useEffect(() => {
    if (!memberUserId || !threadId) return undefined;
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`member-thread:${threadId}:kit`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? '');
            const authorId = String(row.author_id ?? '');
            const body = String(row.body ?? '');
            if (!id) return;
            const mine = authorId === memberUserId;
            setMessages((prev) => {
              // Dedupe against optimistic/sent (and already-received) messages by id.
              if (prev.some((m) => m.id === id)) return prev;
              const incoming: ChatMessage = mine
                ? { id, from: 'self', text: body }
                : { id, from: 'other', text: body, author: otherInitialsRef.current };
              return [...prev, incoming];
            });
            // Counselor reply arrived while the thread is open: mark it read
            // (which also refreshes the nav unread badge).
            if (!mine) void markReadRef.current();
          },
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('[MemberMessagesKit] Realtime unavailable', e);
      return undefined;
    }
  }, [memberUserId, threadId]);

  const canSend = Boolean(onSend) || Boolean(memberUserId);

  return (
    <MemberMessagesFrame>
        <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3"
            style={{ overflow: 'hidden', minHeight: 520 }}
          >
          {/* Conversation list — single pane on mobile (hidden when a thread is
              open), always visible alongside the thread on md+. */}
          <div
            className={`${mobileView === 'list' ? 'wa-block' : 'wa-hidden'} md:wa-block`}
            style={{ borderRight: '1px solid var(--wa-border)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--wa-border)' }}>
              <h2 style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}>Conversations</h2>
            </div>
            <div>
              {conversations.length === 0 ? (
                <div style={{ padding: '20px' }}>
                  <KitEmptyState kind="first" title={t('conversations.title')} description={t('conversations.body')} />
                </div>
              ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setMobileView('thread')}
                  className={`wa-kit-focus wa-transition-colors wa-duration-150 motion-reduce:wa-transition-none${c.active ? '' : ' hover:wa-bg-[var(--wa-surface-2)]'}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '16px 20px',
                    border: 'none',
                    borderBottom: '1px solid var(--wa-border)',
                    borderLeft: '2px solid transparent',
                    background: c.active ? 'var(--wa-accent-soft)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="wa-flex wa-items-center wa-justify-between">
                    <span style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)' }}>{c.name}</span>
                    {c.unread ? (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: 'var(--wa-accent)',
                          flexShrink: 0,
                        }}
                        aria-label="Unread message"
                      />
                    ) : null}
                  </div>
                  <div className="wa-kit-meta" style={{ marginTop: 2 }}>{c.role}</div>
                  <p
                    className={c.active ? undefined : 'wa-kit-meta'}
                    style={{
                      fontSize: c.active ? 'var(--wa-type-body)' : undefined,
                      color: c.active ? 'var(--wa-text)' : undefined,
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.preview}
                  </p>
                </button>
              ))
              )}
            </div>
          </div>

          {/* Active thread — single pane on mobile (hidden when the list is
              open), always visible beside the list on md+. Display is driven by
              classes (not inline) so the mobile hide/show can win over flex. */}
          <div
            className={`${mobileView === 'thread' ? 'wa-flex' : 'wa-hidden'} md:wa-flex md:wa-col-span-2`}
            style={{ flexDirection: 'column' }}
          >
            <div className="wa-flex wa-items-center wa-gap-3" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wa-border)' }}>
              {/* Mobile-only back button → return to the conversation list. */}
              <span className="md:wa-hidden" style={{ marginLeft: -4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="wa-kit-focus"
                  aria-label="Back to messages"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--wa-text)',
                    cursor: 'pointer',
                    borderRadius: 'var(--wa-radius-sm)',
                  }}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
              </span>
              <Avatar initials={activeInitials} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)' }}>{activeName}</div>
                <div className="wa-flex wa-items-center wa-gap-1" style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}>
                  {activeOnline ? (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: 'var(--wa-success)',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span style={{ color: activeOnline ? 'var(--wa-success)' : undefined }}>
                    {activeOnline ? 'Online · ' : ''}{activeRole}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
              {feedbackDraft ? <p className="wa-kit-lede">
                Review your course details and any saved project link before sending. Your private notes are not shared.
              </p> : feedbackNotice ? <p role="status" className="wa-kit-lede">{feedbackNotice}</p> : null}
              {error ? (
                <p role="alert" className="wa-kit-lede" style={{ margin: '0 0 12px', color: 'var(--wa-danger)' }}>
                  {error}
                </p>
              ) : null}
              <ChatThread
                key={feedbackDraft?.key ?? 'general'}
                messages={messages}
                placeholder={`Message ${activeName.split(' ')[0]}…`}
                onSend={canSend ? handleSend : undefined}
                initialText={feedbackDraft?.text}
                multiline={Boolean(feedbackDraft)}
                empty={{ title: t('thread.title'), description: t('thread.body'), action: t('thread.action') }}
              />
            </div>
          </div>
          </div>
        </div>
    </MemberMessagesFrame>
  );
}
