'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  InboxEmpty,
  InboxHeader,
  InboxList,
  InboxPane,
  InboxRowButton,
  InboxRowLayout,
  InboxSearch,
  InboxShell,
  InboxUnreadBadge,
} from '@/components/portal/ui/inbox/InboxPrimitives';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type SlaInfo = {
  needsCounselorReply: boolean;
  memberLastMessageAt: string | null;
  breached48h: boolean;
  breached72h: boolean;
};

type ThreadRowMember = {
  id: string;
  kind: 'member';
  memberId: string | null;
  memberName: string;
  memberEmail: string;
  counselorUserId: string | null;
  counselorName: string | null;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  lastMessageAuthorId: string | null;
  sla: SlaInfo;
};

type ThreadRowEmployer = {
  id: string;
  kind: 'employer';
  employerId: string | null;
  employerCompanyName: string;
  employerContactEmail: string;
  needsStaffReply: boolean;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  lastMessageAuthorId: string | null;
};

type ThreadRowPartner = {
  id: string;
  kind: 'partner';
  partnerId: string | null;
  partnerName: string;
  needsStaffReply: boolean;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  lastMessageAuthorId: string | null;
};

type ThreadRow = ThreadRowMember | ThreadRowEmployer | ThreadRowPartner;

type CounselorOpt = {
  userId: string;
  fullName: string;
  partnerName: string;
};

type ThreadDetailMember = {
  kind: 'member';
  thread: { id: string; memberId: string | null; counselorUserId: string | null; updatedAt: string };
  member: { id: string; fullName: string; email: string };
  counselorName: string | null;
  counselors: CounselorOpt[];
  currentCounselorUserId: string | null;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    isFromMember: boolean;
  }>;
  sla: {
    needsCounselorReply: boolean;
    memberLastMessageAt: string | null;
    breached48h: boolean;
    breached72h: boolean;
  } | null;
  readOnlyNote: string;
};

type ThreadDetailEmployer = {
  kind: 'employer';
  thread: {
    id: string;
    employerId: string | null;
    portalUserLastReadAt: string | null;
    staffLastReadAt: string | null;
    staffUserId: string | null;
    updatedAt: string;
  };
  employer: { id: string; companyName: string; contactEmail: string };
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    isFromPortalUser: boolean;
  }>;
  sla: null;
  readOnlyNote: string;
};

type ThreadDetailPartner = {
  kind: 'partner';
  thread: {
    id: string;
    partnerId: string | null;
    portalUserLastReadAt: string | null;
    staffLastReadAt: string | null;
    staffUserId: string | null;
    updatedAt: string;
  };
  partner: { id: string; name: string };
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    isFromPortalUser: boolean;
  }>;
  sla: null;
  readOnlyNote: string;
};

type ThreadDetail = ThreadDetailMember | ThreadDetailEmployer | ThreadDetailPartner;

type InboxFilter = 'member' | 'employer' | 'partner' | 'all';

function threadListTitle(t: ThreadRow): string {
  if (t.kind === 'member') return t.memberName;
  if (t.kind === 'employer') return t.employerCompanyName;
  return t.partnerName;
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function detailTitle(d: ThreadDetail): string {
  if (d.kind === 'member') return d.member.fullName;
  if (d.kind === 'employer') return d.employer.companyName;
  return d.partner.name;
}

function detailSubtitle(d: ThreadDetail): string {
  if (d.kind === 'member') return d.member.email;
  if (d.kind === 'employer') return d.employer.contactEmail;
  return 'Partner organization';
}

function kindLabel(kind: string): string {
  if (kind === 'member') return 'Member';
  if (kind === 'employer') return 'Employer';
  return 'Partner';
}

function isFromPortalUser(d: ThreadDetail, m: ThreadDetail['messages'][number]): boolean {
  if (d.kind === 'member') return (m as ThreadDetailMember['messages'][number]).isFromMember;
  return (m as ThreadDetailEmployer['messages'][number]).isFromPortalUser;
}

export default function AdminSuperMessagesClient() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [inbox, setInbox] = useState<InboxFilter>('member');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<{ threadsWithMessages: number; unansweredMemberThreads?: number; slaBreaches48h: number; slaBreaches72h: number } | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assigningCounselor, setAssigningCounselor] = useState(false);
  const [assignmentMsg, setAssignmentMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [staffDraft, setStaffDraft] = useState('');
  const [staffSending, setStaffSending] = useState(false);
  const [staffErr, setStaffErr] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [isWide, setIsWide] = useState(false);
  const [showAdminControls, setShowAdminControls] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMobileThreadView = mobileView === 'thread' && Boolean(selectedId);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, [detail?.messages.length]);

  const loadThreads = useCallback(
    async (opts: { reset: boolean; appendCursor?: string | null }) => {
      const isReset = opts.reset;
      const pageCursor = isReset ? null : opts.appendCursor ?? null;
      if (isReset) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', '30');
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (alertsOnly) params.set('alertsOnly', '1');
        else params.set('inbox', inbox);
        if (pageCursor) params.set('cursor', pageCursor);

        const res = await fetch(`/api/admin/messages/threads?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load');
        const data = (await res.json()) as { threads: ThreadRow[]; nextCursor: string | null };

        setThreads((prev) => (isReset ? data.threads : [...prev, ...data.threads]));
        setCursor(data.nextCursor);
      } catch {
        if (isReset) setThreads([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [alertsOnly, debouncedSearch, inbox]
  );

  useEffect(() => {
    setCursor(null);
    void loadThreads({ reset: true });
  }, [debouncedSearch, alertsOnly, inbox, loadThreads]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/admin/messages/stats', { credentials: 'include' });
        if (r.ok) setStats(await r.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Deep-link: when arriving from the kit inbox (/admin/messages?ui=legacy&thread=<id>),
  // open that thread directly. Reads window.location (no useSearchParams Suspense
  // boundary needed); runs once on mount. The detail effect below fetches by id.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const threadId = new URLSearchParams(window.location.search).get('thread');
    if (threadId) {
      setSelectedId(threadId);
      setMobileView('thread');
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setStaffDraft('');
      setStaffErr(null);
      setShowAdminControls(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/admin/messages/thread/${selectedId}`, { credentials: 'include' });
        if (!r.ok) throw new Error('load');
        const d = (await r.json()) as ThreadDetail;
        if (!cancelled) {
          setDetail(d);
          void fetch(`/api/admin/messages/thread/${selectedId}/staff`, {
            method: 'PATCH',
            credentials: 'include',
          }).catch(() => {});
        }
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const refreshList = () => {
    setCursor(null);
    void loadThreads({ reset: true });
    try {
      window.dispatchEvent(new Event('wa-nav-badges-refresh'));
    } catch {
      /* ignore */
    }
  };

  const selectThread = (id: string) => {
    setSelectedId(id);
    setMobileView('thread');
  };

  const assignCounselor = async (counselorUserId: string) => {
    if (!detail || detail.kind !== 'member') return;
    setAssigningCounselor(true);
    setAssignmentMsg(null);
    try {
      const r = await fetch(`/api/admin/members/${detail.member.id}/counselor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselorUserId }),
        credentials: 'include',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAssignmentMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Assignment failed' });
        return;
      }
      setAssignmentMsg({ type: 'ok', text: 'Counselor assigned.' });
      setTimeout(() => setAssignmentMsg(null), 5000);
      if (selectedId) {
        const detailRes = await fetch(`/api/admin/messages/thread/${selectedId}`, { credentials: 'include' });
        if (detailRes.ok) {
          const updated = (await detailRes.json()) as ThreadDetail;
          setDetail(updated);
        }
      }
      refreshList();
    } catch {
      setAssignmentMsg({ type: 'err', text: 'Network error' });
    } finally {
      setAssigningCounselor(false);
    }
  };

  const sendStaffReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !staffDraft.trim() || staffSending) return;
    setStaffSending(true);
    setStaffErr(null);
    try {
      const r = await fetch(`/api/admin/messages/thread/${selectedId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: staffDraft.trim() }),
        credentials: 'include',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStaffErr(typeof data.error === 'string' ? data.error : 'Send failed');
        return;
      }
      setStaffDraft('');
      const detailRes = await fetch(`/api/admin/messages/thread/${selectedId}`, { credentials: 'include' });
      if (detailRes.ok) {
        setDetail((await detailRes.json()) as ThreadDetail);
      }
      refreshList();
    } catch {
      setStaffErr('Network error');
    } finally {
      setStaffSending(false);
    }
  };

  return (
    <div className="admin-main-content admin-super-messages">
      <InboxShell
        style={{
          maxWidth: '100%',
          height: 'auto',
          minHeight: '70vh',
          flexDirection: isWide ? 'row' : 'column',
        }}
      >
        <InboxPane
          variant="list"
          style={{
            display: isWide || !isMobileThreadView ? 'flex' : 'none',
            width: '100%',
            maxWidth: isWide ? 360 : '100%',
            flexShrink: 0,
            borderRight: isWide ? '1px solid color-mix(in srgb, var(--outline-variant, #e8e0dd) 70%, transparent)' : 'none',
            borderBottom: !isWide ? '1px solid color-mix(in srgb, var(--outline-variant, #e8e0dd) 70%, transparent)' : 'none',
            overflowY: 'auto',
          }}
        >
          <InboxHeader
            title="Threads"
            subtitle="Filter + search, then open a thread."
            right={
              stats ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="portal-inbox-unread" title="Threads with messages">
                    {stats.threadsWithMessages} threads
                  </span>
                  <span className="portal-inbox-unread" title="Member messages with no staff reply yet">
                    {stats.unansweredMemberThreads ?? 0} unanswered
                  </span>
                  <span className="portal-inbox-unread" title="Member SLA >48h">
                    {stats.slaBreaches48h} &gt;48h
                  </span>
                  <span className="portal-inbox-unread" title="Member SLA >72h">
                    {stats.slaBreaches72h} &gt;72h
                  </span>
                </div>
              ) : null
            }
          />

          <div className="portal-inbox__search" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(['member', 'employer', 'partner', 'all'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`btn btn-sm ${inbox === tab && !alertsOnly ? 'btn-primary' : 'btn-outline'}`}
                  disabled={alertsOnly && tab !== 'member'}
                  onClick={() => {
                    setAlertsOnly(false);
                    setInbox(tab);
                  }}
                >
                  {tab === 'all' ? 'All' : tab === 'member' ? 'Members' : tab === 'employer' ? 'Employers' : 'Partners'}
                </button>
              ))}
            </div>

            <InboxSearch value={search} onChange={setSearch} placeholder="Search name, email, or message…" />

            <label className="admin-form-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={alertsOnly}
                onChange={(e) => {
                  setAlertsOnly(e.target.checked);
                  if (e.target.checked) setInbox('member');
                }}
              />
              Only member SLA alerts (&gt;48h no counselor reply)
            </label>

            <button type="button" className="btn btn-outline btn-sm" onClick={refreshList} style={{ alignSelf: 'flex-start' }}>
              Refresh list
            </button>
          </div>

          <InboxList>
            {loading ? (
              <InboxEmpty title="Loading threads…" />
            ) : threads.length === 0 ? (
              <InboxEmpty title="No threads found" description="Try adjusting filters or search." />
            ) : (
              threads.map((t) => {
                const kindLabel =
                  t.kind === 'member' ? 'Member' : t.kind === 'employer' ? 'Employer' : 'Partner';
                const alertBadge =
                  t.kind === 'member'
                    ? t.sla.breached72h
                      ? '>72h'
                      : t.sla.breached48h
                        ? '>48h'
                        : null
                    : t.needsStaffReply
                      ? 'Needs reply'
                      : null;
                return (
                  <InboxRowButton
                    key={t.id}
                    active={selectedId === t.id}
                    unread={Boolean(alertBadge)}
                    onClick={() => selectThread(t.id)}
                  >
                    <InboxRowLayout
                      title={threadListTitle(t)}
                      meta={kindLabel}
                      preview={t.lastMessagePreview}
                      badge={
                        alertBadge ? (
                          <span className="portal-inbox-unread">{alertBadge}</span>
                        ) : undefined
                      }
                    />
                  </InboxRowButton>
                );
              })
            )}
          </InboxList>

          {cursor ? (
            <div style={{ padding: '0.75rem 1rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%' }}
                disabled={loadingMore}
                onClick={() => void loadThreads({ reset: false, appendCursor: cursor })}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </InboxPane>

        <InboxPane
          variant="thread"
          style={{
            display: isWide || isMobileThreadView ? 'flex' : 'none',
            flex: 1,
            overflow: 'auto',
            padding: '1rem',
            minWidth: 0,
          }}
        >
          <div style={{ display: isWide ? 'none' : 'flex', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setMobileView('list')}
            >
              ← Back to threads
            </button>
          </div>
          {!selectedId ? (
            <InboxEmpty title="Select a thread" description="Pick a conversation from the left to view the full history." />
          ) : detailLoading ? (
            <InboxEmpty title="Loading conversation…" />
          ) : detail && detail.kind === 'member' ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{detail.member.fullName}</h2>
                <p className="admin-muted-text" style={{ fontSize: '0.9rem' }}>
                  {detail.member.email} · Counselor: {detail.counselorName ?? 'Not assigned'}
                </p>
                {detail.sla?.breached48h ? (
                  <p className="admin-error-banner" style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                    SLA: Member message awaiting counselor reply
                    {detail.sla.breached72h ? ' (over 72 hours)' : ' (over 48 hours)'}.
                  </p>
                ) : null}

                {assignmentMsg ? (
                  <p
                    style={{
                      marginTop: '0.75rem',
                      fontSize: '0.9rem',
                      color: assignmentMsg.type === 'ok' ? '#166534' : '#b91c1c',
                    }}
                    role="status"
                  >
                    {assignmentMsg.text}
                  </p>
                ) : null}

                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label
                        htmlFor="assign-counselor"
                        className="admin-form-hint"
                        style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem' }}
                      >
                        Assign counselor
                      </label>
                      <select
                        id="assign-counselor"
                        className="admin-form-input"
                        defaultValue={detail.currentCounselorUserId ?? ''}
                        onChange={(e) => {
                          if (e.target.value) void assignCounselor(e.target.value);
                        }}
                        disabled={assigningCounselor || detail.counselors.length === 0}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select counselor…</option>
                        {detail.counselors.map((c) => (
                          <option key={c.userId} value={c.userId}>
                            {c.fullName} ({c.partnerName})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Link
                    href={`/admin/members/${detail.member.id}`}
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignSelf: 'flex-start' }}
                  >
                    Open member detail page
                  </Link>
                </div>

                <p className="admin-muted-text" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                  {detail.readOnlyNote}
                </p>
              </div>
              <ul className="admin-super-messages-bubbles">
                {detail.messages.map((m) => (
                  <li key={m.id} className={`admin-super-messages-bubble${m.isFromMember ? ' is-member' : ' is-staff'}`}>
                    <div className="admin-super-messages-bubble-meta">
                      <strong>{m.isFromMember ? 'Member' : m.authorName}</strong>
                      <span className="admin-muted-text">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={sendStaffReply} style={{ marginTop: '1.25rem' }}>
                {staffErr ? (
                  <p className="admin-error-banner" role="alert" style={{ marginBottom: '0.5rem' }}>
                    {staffErr}
                  </p>
                ) : null}
                <label htmlFor="staff-reply-member" className="admin-form-hint" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  Reply as WorkforceAP
                </label>
                <textarea
                  id="staff-reply-member"
                  className="admin-form-input"
                  rows={3}
                  value={staffDraft}
                  onChange={(e) => setStaffDraft(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={staffSending || !staffDraft.trim()}>
                  {staffSending ? 'Sending…' : 'Send reply'}
                </button>
              </form>
            </>
          ) : detail && detail.kind === 'employer' ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{detail.employer.companyName}</h2>
                <p className="admin-muted-text" style={{ fontSize: '0.9rem' }}>
                  {detail.employer.contactEmail}
                </p>
                <p className="admin-muted-text" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                  {detail.readOnlyNote}
                </p>
              </div>
              <ul className="admin-super-messages-bubbles">
                {detail.messages.map((m) => (
                  <li key={m.id} className={`admin-super-messages-bubble${m.isFromPortalUser ? ' is-member' : ' is-staff'}`}>
                    <div className="admin-super-messages-bubble-meta">
                      <strong>{m.isFromPortalUser ? 'Employer' : m.authorName}</strong>
                      <span className="admin-muted-text">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={sendStaffReply} style={{ marginTop: '1.25rem' }}>
                {staffErr ? (
                  <p className="admin-error-banner" role="alert" style={{ marginBottom: '0.5rem' }}>
                    {staffErr}
                  </p>
                ) : null}
                <label htmlFor="staff-reply-employer" className="admin-form-hint" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  Reply as WorkforceAP
                </label>
                <textarea
                  id="staff-reply-employer"
                  className="admin-form-input"
                  rows={3}
                  value={staffDraft}
                  onChange={(e) => setStaffDraft(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={staffSending || !staffDraft.trim()}>
                  {staffSending ? 'Sending…' : 'Send reply'}
                </button>
              </form>
            </>
          ) : detail && detail.kind === 'partner' ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{detail.partner.name}</h2>
                <p className="admin-muted-text" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                  {detail.readOnlyNote}
                </p>
              </div>
              <ul className="admin-super-messages-bubbles">
                {detail.messages.map((m) => (
                  <li key={m.id} className={`admin-super-messages-bubble${m.isFromPortalUser ? ' is-member' : ' is-staff'}`}>
                    <div className="admin-super-messages-bubble-meta">
                      <strong>{m.isFromPortalUser ? 'Partner' : m.authorName}</strong>
                      <span className="admin-muted-text">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={sendStaffReply} style={{ marginTop: '1.25rem' }}>
                {staffErr ? (
                  <p className="admin-error-banner" role="alert" style={{ marginBottom: '0.5rem' }}>
                    {staffErr}
                  </p>
                ) : null}
                <label htmlFor="staff-reply-partner" className="admin-form-hint" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  Reply as WorkforceAP
                </label>
                <textarea
                  id="staff-reply-partner"
                  className="admin-form-input"
                  rows={3}
                  value={staffDraft}
                  onChange={(e) => setStaffDraft(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={staffSending || !staffDraft.trim()}>
                  {staffSending ? 'Sending…' : 'Send reply'}
                </button>
              </form>
            </>
          ) : (
            <InboxEmpty title="Could not load this thread" description="Try selecting it again from the list." />
          )}
        </InboxPane>
      </InboxShell>
    </div>
  );
}
