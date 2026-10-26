'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { DesignSurface, Avatar, ChatThread, KitEmptyState, PageOpener, type ChatMessage } from '@/components/portal/kit';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import styles from './memberPages.module.css';

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
 * Saved server/realtime timestamps remain intact. Optimistic rows are marked
 * pending, and a realtime echo is reconciled with its POST response by saved ID.
 */

interface Conversation {
  id: string;
  name: string;
  role: string;
  preview: string;
  initials?: string;
  unread?: boolean;
  active?: boolean;
  /** Synthetic preview content; only read when previewOnly is enabled. */
  messages?: ChatMessage[];
}

export interface MemberMessagesKitProps {
  conversations?: Conversation[];
  /** Enables local conversation switching only for an explicitly synthetic inbox. */
  previewOnly?: boolean;
  /** Header for the open thread. */
  activeName?: string;
  activeRole?: string;
  activeInitials?: string;
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
export function MemberMessagesFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const tm = useTranslations('messages');
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title={tm('messagesTitle')}
          meta={tm('kitLede')}
          aside={aside}
        />
        {children}
      </div>
    </DesignSurface>
  );
}

const DEFAULT_CONVERSATIONS: Conversation[] = [];

const DEFAULT_MESSAGES: ChatMessage[] = [];

function chronological(messages: ChatMessage[]): ChatMessage[] {
  const time = (message: ChatMessage) => {
    const value = message.createdAt && !message.pending ? Date.parse(message.createdAt) : NaN;
    return Number.isFinite(value) ? value : Infinity;
  };
  // A delayed realtime insert belongs at its persisted time. Undated kit
  // fixtures and optimistic sends retain their input order after saved rows.
  return [...messages].sort((left, right) => time(left) === time(right) ? 0 : time(left) - time(right));
}

export function MemberMessagesKit({
  conversations = DEFAULT_CONVERSATIONS,
  activeName = 'Counselor',
  activeRole = 'Support',
  activeInitials = 'CS',
  messages: messagesProp = DEFAULT_MESSAGES,
  onSend,
  memberUserId,
  otherInitials = activeInitials,
  threadId,
  feedbackDraft,
  feedbackNotice,
  previewOnly = false,
}: MemberMessagesKitProps) {
  const t = useTranslations('empty');
  const tm = useTranslations('messages');
  const canSelectPreviewConversation = previewOnly;
  const initialConversation = conversations.find((conversation) => conversation.active) ?? conversations[0];
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversation?.id ?? null);
  const selectedConversation = canSelectPreviewConversation ? conversations.find((conversation) => conversation.id === selectedConversationId) : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>(() => chronological(canSelectPreviewConversation ? initialConversation?.messages ?? messagesProp : messagesProp));
  const [error, setError] = useState<string | null>(null);
  // Mobile single-pane navigation: on phones the list and thread cannot sit
  // side-by-side, so we show one pane at a time with a back button. Desktop
  // (md+) ignores this and keeps the two-pane layout via CSS. Default to the
  // open thread so members land on the active conversation.
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('thread');
  const conversationButtonRef = useRef<HTMLButtonElement>(null);
  const restoreConversationFocusRef = useRef(false);
  useEffect(() => {
    if (mobileView === 'list' && restoreConversationFocusRef.current) {
      restoreConversationFocusRef.current = false;
      conversationButtonRef.current?.focus();
    }
  }, [mobileView, selectedConversationId]);
  // Keep latest "other" initials available to the realtime callback without
  // re-subscribing when they change.
  const otherInitialsRef = useRef(otherInitials);
  otherInitialsRef.current = otherInitials;
  // Conversations the member has read in this view. `conversations` is a
  // server prop computed before the thread was opened, so its `unread` flag is
  // stale once the read marker is written; without this the dot stays on the
  // thread just read (visible on a phone after "Back to messages").
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Read marker: opening the thread (and receiving a counselor reply while it
  // is open) marks it read, the same way the legacy clients do. Without this
  // the badge the nav turns on for a never-opened thread could never clear.
  const markRead = useCallback(async () => {
    if (previewOnly || !memberUserId || !threadId) return;
    try {
      const r = await fetch('/api/member/messages', { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        // Only a confirmed write clears the open conversation's dot; a failed
        // PATCH leaves it, so the list never claims a read that did not land.
        const openIds = conversationsRef.current.filter((c) => c.active).map((c) => c.id);
        if (openIds.length > 0) {
          setReadIds((prev) => (openIds.every((id) => prev.has(id)) ? prev : new Set([...prev, ...openIds])));
        }
        try {
          window.dispatchEvent(new CustomEvent('wa-nav-badges-refresh'));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, [memberUserId, previewOnly, threadId]);
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  useEffect(() => {
    if (previewOnly || !memberUserId || !threadId) return;
    void markRead();
  }, [memberUserId, previewOnly, threadId, markRead]);

  // Live send path: reuse the existing legacy endpoint that
  // MemberCounselorChatClient posts to. Only active when a real member id is
  // present and no explicit onSend override was passed.
  const sendLive = useCallback(
    async (text: string) => {
      if (previewOnly) return false;
      setError(null);
      // Optimistic append so the thread feels responsive; reconcile on response.
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, from: 'self', text, pending: true }]);
      try {
        const r = await fetch('/api/member/messages', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: { id: string; body: string; createdAt?: string };
        };
        if (!r.ok || !data.message) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setError(typeof data.error === 'string' ? data.error : tm('sendFailed'));
          return false;
        }
        const saved = data.message;
        setMessages((prev) => {
          const received = prev.find((message) => message.id === saved.id);
          // Realtime may beat the HTTP response. Keep one persisted row and
          // retain its real timestamp if an older response omits that field.
          const persisted: ChatMessage = {
            id: saved.id, from: 'self', text: saved.body,
            createdAt: saved.createdAt ?? received?.createdAt,
          };
          return chronological([...prev.filter((message) => message.id !== tempId && message.id !== saved.id), persisted]);
        });
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
        setError(tm('networkError'));
        return false;
      }
    },
    [feedbackDraft, previewOnly, tm],
  );

  const handleSend = useCallback(
    (text: string) => {
        if (previewOnly) return false;
      if (onSend) {
        return onSend(text);
      }
      if (memberUserId) {
        return sendLive(text);
      }
    },
    [onSend, memberUserId, previewOnly, sendLive],
  );

  // Live RECEIVE path: mirror MemberCounselorChatClient's realtime subscription
  // so counselor replies appear without a refresh. Gated on a real member id +
  // thread id; fails soft (current behavior preserved) if realtime is
  // unavailable or the env client cannot be created.
  useEffect(() => {
    if (previewOnly || !memberUserId || !threadId) return undefined;
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
            const createdAt = typeof row.created_at === 'string' ? row.created_at : undefined;
            if (!id) return;
            const mine = authorId === memberUserId;
            setMessages((prev) => {
              // Dedupe against optimistic/sent (and already-received) messages by id.
              if (prev.some((m) => m.id === id)) return prev;
              const incoming: ChatMessage = mine
                ? { id, from: 'self', text: body, createdAt }
                : { id, from: 'other', text: body, author: otherInitialsRef.current, createdAt };
              return chronological([...prev, incoming]);
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
  }, [memberUserId, previewOnly, threadId]);

  const canSend = !previewOnly && (Boolean(onSend) || Boolean(memberUserId));
  const unreadCount = conversations.filter((c) => c.unread && !readIds.has(c.id)).length;

  return (
    <MemberMessagesFrame
      aside={unreadCount > 0 ? <span className="wa-kit-chip wa-kit-chip--crimson">{unreadCount} unread</span> : undefined}
    >
      <div className="wa-kit-card wa-kit-card--flush">
        <div className={styles.inbox}>
          {/* Conversation list: single pane on mobile (hidden when a thread is
              open), always visible alongside the thread on md+. People-card
              rows: avatar, name and role, latest preview. */}
          <div
            className={`${mobileView === 'list' ? 'wa-block' : 'wa-hidden'} md:wa-block ${styles.inboxList}`}
          >
            <div className={styles.inboxHead}>
              <h2 className="wa-kit-card-title">{tm('conversations')}</h2>
            </div>
            <div>
              {conversations.length === 0 ? (
                <div style={{ padding: '20px' }}>
                  <KitEmptyState kind="first" title={t('conversations.title')} description={t('conversations.body')} />
                </div>
              ) : (
              conversations.map((c) => {
                const selected = canSelectPreviewConversation ? c.id === selectedConversationId : Boolean(c.active);
                return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (canSelectPreviewConversation) {
                      setSelectedConversationId(c.id);
                      setMessages(chronological(c.messages ?? messagesProp));
                    }
                    setMobileView('thread');
                  }}
                  ref={selected ? conversationButtonRef : undefined}
                  className={`wa-kit-focus wa-transition-colors wa-duration-150 motion-reduce:wa-transition-none ${styles.person}${selected ? ` ${styles.personActive}` : ''}`}
                >
                  <span className={styles.personAvatar}><Avatar initials={c.initials ?? initialsOf(c.name)} size={44} /></span>
                  <span className={styles.personName}>
                    {c.name}
                    <span className={styles.personRole}>{c.role}</span>
                  </span>
                  {c.unread && !readIds.has(c.id) ? (
                    <span className={styles.unreadDot} aria-label={tm('unreadMessage')} />
                  ) : <span />}
                  <p className={`${styles.personPreview}${selected ? ` ${styles.personPreviewActive}` : ''}`}>
                    {c.preview}
                  </p>
                </button>
                );
              })
              )}
            </div>
          </div>

          {/* Active thread: single pane on mobile (hidden when the list is
              open), always visible beside the list on md+. Display is driven by
              classes (not inline) so the mobile hide/show can win over flex. */}
          <div
            className={`${mobileView === 'thread' ? 'wa-flex' : 'wa-hidden'} md:wa-flex`}
            style={{ flexDirection: 'column', minHeight: 0, minWidth: 0 }}
          >
            <div className={styles.threadHead}>
              {/* Mobile-only back button: return to the conversation list. */}
              <span className="md:wa-hidden" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => { restoreConversationFocusRef.current = true; setMobileView('list'); }}
                  className={`wa-kit-focus ${styles.backButton}`}
                  aria-label={tm('backToMessages')}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
              </span>
              <Avatar initials={selectedConversation?.initials ?? initialsOf(selectedConversation?.name ?? activeName)} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)' }}>{selectedConversation?.name ?? activeName}</div>
                {/* Role only: an assigned counselor is not a presence signal, so
                    the header makes no "Online" claim (WAP-262). */}
                <div className="wa-flex wa-items-center wa-gap-1" style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}>
                  <span>{selectedConversation?.role ?? activeRole}</span>
                </div>
              </div>
            </div>
            <div className={styles.threadBody}>
              {feedbackDraft ? <p className="wa-kit-lede">{tm('feedbackDraftNotice')}</p> : feedbackNotice ? <p role="status" className="wa-kit-lede">{feedbackNotice}</p> : null}
              {error ? (
                <p role="alert" className="wa-kit-lede" style={{ margin: '0 0 12px', color: 'var(--wa-danger)' }}>
                  {error}
                </p>
              ) : null}
              <ChatThread
                key={feedbackDraft?.key ?? 'general'}
                messages={messages}
                placeholder={tm('composerPlaceholder', { name: (selectedConversation?.name ?? activeName).split(' ')[0] })}
                onSend={canSend ? handleSend : undefined}
                initialText={feedbackDraft?.text}
                multiline={Boolean(feedbackDraft)}
                composerClassName={styles.messageComposer}
                empty={{ title: t('thread.title'), description: t('thread.body'), action: t('thread.action') }}
                labels={{ newMessage: tm('showLatestMessage'), pending: tm('sending'), send: tm('sendMessageLabel'), sending: tm('sendingMessage'), history: tm('messageHistory') }}
              />
            </div>
          </div>
        </div>
      </div>
    </MemberMessagesFrame>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}
