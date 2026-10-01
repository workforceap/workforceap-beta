'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AdminMemberCounselorChatClient from '@/components/admin/AdminMemberCounselorChatClient';
import type { CounselorInboxRow } from '@/lib/messages/counselorInbox';
import {
  COUNSELOR_MESSAGES_FILTER_EMPTY,
  COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY,
} from '@/lib/counselor/inboxEmptyState';
import { KitEmptyState } from '@/components/portal/kit';
import styles from './CounselorMessagesInboxClient.module.css';
import {
  InboxHeader,
  InboxList,
  InboxPane,
  InboxRowButton,
  InboxRowLayout,
  InboxSearch,
  InboxShell,
  InboxUnreadBadge,
} from '@/components/portal/ui/inbox/InboxPrimitives';

type ChatPayload = {
  member: { id: string; fullName: string };
  thread: {
    id: string;
    memberId: string | null;
    counselorUserId: string | null;
    memberLastReadAt: string | null;
    counselorLastReadAt: string | null;
  };
  messages: Array<{
    id: string;
    threadId: string;
    authorId: string;
    body: string;
    createdAt: string;
    authorName: string;
  }>;
};

type Props = {
  staffUserId: string;
  rows: CounselorInboxRow[];
  /** Server-authorized member selected from a contextual deep link. */
  initialMemberId?: string | null;
};

type InboxFilter = 'all' | 'needs_reply' | 'unread';


function pickInitialSelection(rs: CounselorInboxRow[], initialMemberId?: string | null): string | null {
  if (rs.length === 0) return null;
  if (initialMemberId && rs.some((row) => row.memberId === initialMemberId)) return initialMemberId;
  const needs = rs.find((r) => r.needsReply);
  if (needs) return needs.memberId;
  const unread = rs.find((r) => r.unreadCount > 0);
  if (unread) return unread.memberId;
  return rs[0].memberId;
}

function InboxFilters({
  filter,
  onFilter,
  allCount,
  needsCount,
  unreadCount,
}: {
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  allCount: number;
  needsCount: number;
  unreadCount: number;
}) {
  const tab = (id: InboxFilter, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => onFilter(id)}
      aria-pressed={filter === id}
      className={`${styles.filter} wa-kit-focus`}
    >
      <span>{label}</span>{' '}
      <span className={styles.filterCount}>{count}</span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Filter conversations"
      className={styles.filters}
    >
      {tab('all', 'All', allCount)}
      {tab('needs_reply', 'Needs reply', needsCount)}
      {tab('unread', 'Unread', unreadCount)}
    </div>
  );
}

function MemberContextAside({ row }: { row: CounselorInboxRow }) {
  return (
    <aside className={styles.context} aria-label="Member details">
      <h3>Member details</h3>
      <dl>
        <dt>Enrollment</dt>
        <dd>{row.enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Not enrolled'}</dd>
        <dt>Last activity</dt>
        <dd>{row.lastActivityLabel?.replace(/^Last activity\s+/i, '') || 'No recent activity'}</dd>
      </dl>
      {row.needsReply ? <p className={styles.replyStatus}>Awaiting your reply</p> : null}
      <p className={styles.contextHint}>Open the profile for notes, training, and placements.</p>
    </aside>
  );
}

export default function CounselorMessagesInboxClient({ staffUserId, rows, initialMemberId }: Props) {
  const tEmpty = useTranslations('empty');
  const hasInitialSelection = Boolean(
    initialMemberId && rows.some((row) => row.memberId === initialMemberId),
  );
  const [search, setSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(() => pickInitialSelection(rows, initialMemberId));
  const [mobileList, setMobileList] = useState(() => !hasInitialSelection);
  const [loadedChat, setChat] = useState<ChatPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ memberId: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const hasAuthorizedSelection = rows.some((row) => row.memberId === selectedId);
  // Never show or mount a composer for a previous selection, even before the
  // effect runs or when requests resolve out of order.
  const chat = hasAuthorizedSelection && loadedChat?.member.id === selectedId ? loadedChat : null;

  const clearListFilters = () => {
    setSearch('');
    setInboxFilter('all');
  };

  useEffect(() => {
    setSelectedId((prev) => {
      if (rows.length === 0) return null;
      if (initialMemberId && rows.some((r) => r.memberId === initialMemberId)) return initialMemberId;
      if (prev && rows.some((r) => r.memberId === prev)) return prev;
      return pickInitialSelection(rows, initialMemberId);
    });
  }, [rows, initialMemberId]);

  useEffect(() => {
    if (initialMemberId && rows.some((row) => row.memberId === initialMemberId)) {
      setMobileList(false);
    }
  }, [rows, initialMemberId]);

  useEffect(() => {
    if (!selectedId || !hasAuthorizedSelection) {
      setChat(null);
      return;
    }
    const memberId = selectedId;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    async function loadChat() {
      try {
        const response = await fetch(`/api/counselor/members/${encodeURIComponent(memberId)}/messages`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Could not load this conversation. Try again.');
        const data: ChatPayload = await response.json();
        if (controller.signal.aborted) return;
        if (data.member?.id !== memberId || data.thread?.memberId !== memberId || !data.thread?.id || !Array.isArray(data.messages)) {
          throw new Error('Could not load this conversation. Try again.');
        }
        setChat(data);
      } catch {
        if (!controller.signal.aborted) {
          setChat(null);
          setLoadError({ memberId, message: 'Could not load this conversation. Try again.' });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadChat();
    return () => controller.abort();
  }, [selectedId, hasAuthorizedSelection, retry]);

  const needsReplyCount = useMemo(() => rows.filter((r) => r.needsReply).length, [rows]);
  const unreadThreadCount = useMemo(() => rows.filter((r) => r.unreadCount > 0).length, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = search.trim().toLowerCase();
        if (q && !r.memberName.toLowerCase().includes(q) && !r.preview.toLowerCase().includes(q)) {
          return false;
        }
        if (inboxFilter === 'needs_reply' && !r.needsReply) return false;
        if (inboxFilter === 'unread' && r.unreadCount <= 0) return false;
        return true;
      }),
    [rows, search, inboxFilter],
  );

  useEffect(() => {
    if (filtered.length === 0) return;
    if (!selectedId || !filtered.some((r) => r.memberId === selectedId)) {
      setSelectedId(filtered[0].memberId);
    }
  }, [filtered, selectedId]);

  const selectedRow = selectedId ? rows.find((x) => x.memberId === selectedId) : undefined;

  const selectMember = (memberId: string, isMobile: boolean) => {
    setSelectedId(memberId);
    if (isMobile) setMobileList(false);
  };

  // `rows` is one row per active assignment (lib/messages/counselorInbox), so
  // an empty list means no assigned members — `unavailable` (an admin assigns),
  // not a first step the counselor can take. A search / filter that matched
  // none of the rows is `filtered` with a clear action (KIT_GUIDE §6).
  const noMembersEmpty = (
    <div className={styles.emptyPad}>
      <KitEmptyState
        kind={COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.kind}
        tone={COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.tone}
        data-testid="counselor-inbox-empty"
        title={tEmpty('counselor.inbox.title')}
        description={tEmpty('counselor.inbox.body')}
        primaryAction={{ label: tEmpty('counselor.inbox.action'), href: COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.primaryHref }}
        secondaryAction={{ label: tEmpty('counselor.inbox.secondary'), href: COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY.secondaryHref }}
      />
    </div>
  );

  const filterEmpty = (
    <div className={styles.emptyPad}>
      <KitEmptyState
        kind={COUNSELOR_MESSAGES_FILTER_EMPTY.kind}
        data-testid="counselor-inbox-filtered"
        title={tEmpty('counselor.inboxFiltered.title')}
        description={tEmpty('counselor.inboxFiltered.body')}
        primaryAction={{ label: tEmpty('counselor.inboxFiltered.action'), onClick: clearListFilters }}
      />
    </div>
  );

  const listPane = (opts: { mobile: boolean }) => (
    <InboxPane variant="list" className={styles.listPane}>
      <InboxHeader
        title="Conversations"
        right={<MessageSquare size={20} aria-hidden="true" />}
        subtitle={rows.length > 0 ? 'Needs reply and unread sort to the top.' : undefined}
      />
      <InboxSearch value={search} onChange={setSearch} placeholder="Search by name or message…" />
      {rows.length > 0 ? (
        <InboxFilters
          filter={inboxFilter}
          onFilter={setInboxFilter}
          allCount={rows.length}
          needsCount={needsReplyCount}
          unreadCount={unreadThreadCount}
        />
      ) : null}
      <InboxList>
        {filtered.length === 0 ? (
          search.trim() || inboxFilter !== 'all' ? filterEmpty : noMembersEmpty
        ) : (
          filtered.map((r) => (
            <InboxRowButton
              key={r.memberId}
              active={selectedId === r.memberId}
              unread={r.unreadCount > 0}
              needsReply={r.needsReply}
              onClick={() => selectMember(r.memberId, opts.mobile)}
            >
              <InboxRowLayout
                title={
                  <span className={styles.rowTitle}>
                    {r.memberName}
                    {r.needsReply ? (
                      <span className="portal-inbox-row__reply-pill">Reply</span>
                    ) : null}
                  </span>
                }
                subtitle={r.programSubtitle}
                meta={r.timeLabel}
                preview={r.preview}
                badge={<InboxUnreadBadge count={r.unreadCount} />}
              />
            </InboxRowButton>
          ))
        )}
      </InboxList>
    </InboxPane>
  );

  const chatHeader = chat ? (
    <div className={styles.chatHeader}>
      <div className={styles.recipient}>
        <div className={styles.avatar} aria-hidden="true">
          {chat.member.fullName
            ?.split(' ')
            .filter(Boolean)
            .map((word) => word[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() ?? '—'}
        </div>
        <div className={styles.recipientText}>
          <h2>{chat.member.fullName}</h2>
          <p>{selectedRow?.programSubtitle ?? 'Program not recorded'}</p>
          <p className={styles.mobileContext}>
            {selectedRow?.enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Not enrolled'}
            {selectedRow?.lastActivityLabel ? ` · ${selectedRow.lastActivityLabel}` : ''}
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Link href={`/counselor/students/${chat.member.id}`} className="btn btn-outline wa-kit-focus">
          Profile
        </Link>
        <Link href={`/counselor/sessions/${chat.member.id}/run`} className="btn btn-outline wa-kit-focus">
          Session
        </Link>
      </div>
    </div>
  ) : null;

  const chatBody =
    rows.length === 0 ? (
      noMembersEmpty
    ) : loadError?.memberId === selectedId && !loading ? (
      <div className={styles.messageState}>
        <p role="alert">{loadError.message}</p>
        <button type="button" className="btn btn-outline" onClick={() => setRetry((value) => value + 1)}>
          Try again
        </button>
      </div>
    ) : loading || !chat ? (
      <div role="status" className={styles.messageState}>Loading conversation…</div>
    ) : (
      <div className={styles.chatBody}>
        <AdminMemberCounselorChatClient
          key={`${chat.member.id}:${chat.thread.id}`}
          compact
          readCursorMode
          messagesApiBase={`/api/counselor/members/${chat.member.id}/messages`}
          initial={{
            staffUserId,
            member: chat.member,
            thread: chat.thread,
            messages: chat.messages,
          }}
        />
      </div>
    );

  return (
    <section className={styles.workspace} aria-label="Member conversations">
      <div className={styles.mobile}>
        {mobileList ? listPane({ mobile: true }) : (
          <div className={styles.mobileThread}>
            <div className={styles.backBar}>
              <button
                type="button"
                onClick={() => setMobileList(true)}
                className={`${styles.backButton} wa-kit-focus`}
              >
                <ArrowLeft size={18} aria-hidden="true" />
                All conversations
              </button>
            </div>
            {chatHeader}
            {chatBody}
          </div>
        )}
      </div>
      <div className={styles.desktop}>
        <InboxShell style={{ maxWidth: 'none', margin: 0, height: '100%', border: 'none', borderRadius: 0 }}>
          {listPane({ mobile: false })}
          <InboxPane variant="thread" className={styles.threadPane}>
            {chatHeader}
            {chatBody}
          </InboxPane>
          {selectedRow ? <MemberContextAside row={selectedRow} /> : null}
        </InboxShell>
      </div>
    </section>
  );
}
