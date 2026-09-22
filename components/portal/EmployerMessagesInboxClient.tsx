'use client';

import { useCallback, useMemo, useState } from 'react';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import PortalTeamChatClient from '@/components/portal/PortalTeamChatClient';
import EmployerApplicationChatClient from '@/components/portal/EmployerApplicationChatClient';
import type { EmployerInboxCandidateRow, EmployerInboxTeamRow } from '@/lib/messages/employerInbox';
import { employerMessagingSurface } from '@/lib/portal/messagingSurfaces';
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

type TeamMsg = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

type Props = {
  portalUserId: string;
  teamRow: EmployerInboxTeamRow;
  candidateRows: EmployerInboxCandidateRow[];
  teamInitial: {
    thread: { id: string; portalUserLastReadAt: string | null };
    messages: TeamMsg[];
  };
};

type Selection = { kind: 'team' } | { kind: 'candidate'; applicationId: string };

export default function EmployerMessagesInboxClient({
  portalUserId,
  teamRow,
  candidateRows,
  teamInitial,
}: Props) {
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Selection>({ kind: 'team' });
  const [mobileList, setMobileList] = useState(true);
  const [appPayload, setAppPayload] = useState<{
    applicationId: string;
    studentName: string;
    jobTitle: string;
    messages: Array<{
      id: string;
      body: string;
      createdAt: string;
      authorName: string;
      isFromEmployer: boolean;
    }>;
  } | null>(null);
  const [appLoading, setAppLoading] = useState(false);

  const loadApplication = useCallback(async (applicationId: string) => {
    setAppLoading(true);
    try {
      const r = await fetch(`/api/employer/applications/${applicationId}/messages`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) {
        setAppPayload(null);
        return;
      }
      setAppPayload({
        applicationId,
        studentName: d.application.studentName,
        jobTitle: d.application.jobTitle,
        messages: d.messages,
      });
    } finally {
      setAppLoading(false);
    }
  }, []);

  const onSelect = useCallback(
    async (next: Selection, fromMobile: boolean) => {
      setSel(next);
      if (fromMobile) setMobileList(false);
      if (next.kind === 'candidate') {
        await loadApplication(next.applicationId);
      } else {
        setAppPayload(null);
      }
    },
    [loadApplication]
  );

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateRows;
    return candidateRows.filter(
      (c) =>
        c.studentName.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
    );
  }, [candidateRows, search]);

  const showTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      'workforceap'.includes(q) ||
      teamRow.title.toLowerCase().includes(q) ||
      teamRow.preview.toLowerCase().includes(q)
    );
  }, [search, teamRow]);

  const listPane = (opts: { mobile: boolean }) => (
    <InboxPane
      variant="list"
      style={
        opts.mobile
          ? { overflowY: 'auto', flex: 1 }
          : {
              width: 320,
              flexShrink: 0,
              borderRight: '1px solid color-mix(in srgb, var(--outline-variant, #e8e0dd) 70%, transparent)',
              overflowY: 'auto',
            }
      }
    >
      <InboxHeader title="Inbox" subtitle="Team + candidates" />
      <InboxSearch value={search} onChange={setSearch} placeholder="Search conversations…" />
      <InboxList>
        {showTeam ? (
          <InboxRowButton
            active={sel.kind === 'team'}
            unread={teamRow.unreadCount > 0}
            onClick={() => void onSelect({ kind: 'team' }, opts.mobile)}
          >
            <InboxRowLayout
              title={teamRow.title}
              preview={teamRow.preview}
              badge={<InboxUnreadBadge count={teamRow.unreadCount} />}
            />
          </InboxRowButton>
        ) : null}

        {filteredCandidates.map((c) => (
          <InboxRowButton
            key={c.applicationId}
            active={sel.kind === 'candidate' && sel.applicationId === c.applicationId}
            unread={c.unreadCount > 0}
            onClick={() => void onSelect({ kind: 'candidate', applicationId: c.applicationId }, opts.mobile)}
          >
            <InboxRowLayout title={c.studentName} meta={c.jobTitle} preview={c.preview} badge={<InboxUnreadBadge count={c.unreadCount} />} />
          </InboxRowButton>
        ))}

        {!showTeam && filteredCandidates.length === 0 ? (
          <InboxEmpty title="No conversations found" description="Try a different search." />
        ) : null}
      </InboxList>
    </InboxPane>
  );

  const teamChat = (
    <PortalTeamChatClient
      surfaceVariant="employer"
      decorated={false}
      apiPath="/api/employer/messages"
      initial={{
        thread: teamInitial.thread,
        messages: teamInitial.messages,
        portalUserId,
      }}
      subtitle="Our team reads every message and replies here."
      emptyHint="No messages yet. Ask a question about job postings, applications, or candidate matches."
    />
  );

  const threadPane = sel.kind === 'team' ? (
    <div style={{ padding: '1rem', overflow: 'auto', flex: 1, minHeight: 0 }}>{teamChat}</div>
  ) : appLoading || !appPayload ? (
    <div style={{ padding: '2rem', color: 'var(--color-on-surface-variant)' }}>Loading…</div>
  ) : (
    <EmployerApplicationChatClient
      applicationId={appPayload.applicationId}
      studentName={appPayload.studentName}
      jobTitle={appPayload.jobTitle}
      initialMessages={appPayload.messages}
    />
  );

  return (
    <VoiceAgentSurface {...employerMessagingSurface} headline="Employer messages" subtext="Same portal feel, tuned for employers.">
    <>
      {/* Mobile master–detail */}
      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ flex: 1, minHeight: 0 }}>
        {mobileList ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{listPane({ mobile: true })}</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid color-mix(in srgb, var(--outline-variant, #e8e0dd) 70%, transparent)',
              }}
            >
              <button
                type="button"
                onClick={() => setMobileList(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--wa-accent-text)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
                  arrow_back
                </span>
                All conversations
              </button>
            </div>
          <InboxPane variant="thread" style={{ flex: 1 }}>
            {threadPane}
          </InboxPane>
          </div>
        )}
      </div>

      {/* Desktop split */}
      <div className="wa-hidden md:wa-block">
        <InboxShell>
          {listPane({ mobile: false })}
          <InboxPane variant="thread">{threadPane}</InboxPane>
        </InboxShell>
      </div>
    </>
    </VoiceAgentSurface>
  );
}
