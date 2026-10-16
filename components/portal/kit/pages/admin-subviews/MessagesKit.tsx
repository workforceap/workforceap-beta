'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Mail, Smartphone } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  Avatar,
  FormField,
  type Column,
} from '@/components/portal/kit';

/**
 * Messages — member ↔ staff threads (dense).
 * Mockup: workforceap-admin-suite chrome; "Message a student" surface.
 * Target route: /admin/messages
 *
 * Rows/cards are clickable: selecting a thread opens it in the interactive
 * inbox (?ui=legacy&thread=<id>) where staff can read and reply.
 *
 * Filter pills cover Unanswered vs All plus name/email/subject search (UI-10).
 * Channel pills (SMS / Portal) stay omitted while every loaded thread is
 * hard-coded In-app — cosmetic channel filters would mislead.
 */
export type MessageChannel = 'In-app' | 'Email' | 'SMS';

export interface MessageThread {
  id: string;
  /** Member the thread is with. */
  from: string;
  /** Member email when known — used for search and muted From disambiguation. */
  email?: string;
  /** Initials for the avatar (defaults to derived initials). */
  initials?: string;
  subject: string;
  channel: MessageChannel;
  /** Optional unread flag — surfaces a subtle tag. */
  unread?: boolean;
  /** Last activity caption, e.g. "2h ago". */
  lastActive?: string;
}

export interface MessagesKitProps {
  threads?: MessageThread[];
  /**
   * Member threads whose latest message has no staff reply yet, across the
   * whole inbox (not only the rows rendered). Shown in the opener so staff
   * see the queue size before scanning the table (WAP-168).
   */
  unansweredCount?: number;
}

type MessageFilter = 'unanswered' | 'all';

const DEFAULT_THREADS: MessageThread[] = [
  {
    id: 'mb',
    from: 'Mike Brown',
    email: 'michael.brown@workforceap.org',
    initials: 'MB',
    subject: 'Question about exam voucher',
    channel: 'In-app',
    unread: true,
    lastActive: '2h ago',
  },
  {
    id: 'tr',
    from: 'Tanya Reed',
    email: 'tanya.reed@example.com',
    initials: 'TR',
    subject: 'Schedule change request',
    channel: 'Email',
    lastActive: '5h ago',
  },
  {
    id: 'ct',
    from: 'Carlos Torres',
    email: 'carlos.torres@example.com',
    initials: 'CT',
    subject: 'Re: outreach check-in',
    channel: 'SMS',
    lastActive: '1d ago',
  },
];

const CHANNEL_META: Record<MessageChannel, { icon: ReactNode; color: TokenColor }> = {
  'In-app': { icon: <MessageSquare size={13} />, color: 'blue' },
  Email: { icon: <Mail size={13} />, color: 'gray' },
  SMS: { icon: <Smartphone size={13} />, color: 'yellow' },
};

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ChannelTag({ channel }: { channel: MessageChannel }) {
  const meta = CHANNEL_META[channel];
  return <Token label={channel} icon={meta.icon} size="sm" color={meta.color} />;
}

/** Case-insensitive match on display name, member email, or subject. */
export function matchesMessageSearch(row: MessageThread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.from.toLowerCase().includes(q) || row.subject.toLowerCase().includes(q)) return true;
  const email = row.email?.trim().toLowerCase();
  return Boolean(email && email.includes(q));
}

/** Show muted email under the name when it adds information (not already the From label). */
function emailCaption(row: MessageThread): string | null {
  const email = row.email?.trim();
  if (!email) return null;
  if (email.toLowerCase() === row.from.trim().toLowerCase()) return null;
  return email;
}

export function MessagesKit({ threads = DEFAULT_THREADS, unansweredCount }: MessagesKitProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<MessageFilter>('unanswered');
  const [search, setSearch] = useState('');

  const unansweredInView = useMemo(
    () => threads.filter((t) => t.unread).length,
    [threads],
  );

  const visibleThreads = useMemo(() => {
    return threads.filter((row) => {
      if (filter === 'unanswered' && !row.unread) return false;
      return matchesMessageSearch(row, search);
    });
  }, [threads, filter, search]);

  const openThread = (row: MessageThread) =>
    router.push(`/admin/messages?ui=legacy&thread=${encodeURIComponent(row.id)}`);

  const columns: Column<MessageThread>[] = [
    {
      key: 'from',
      header: 'From',
      render: (row) => {
        const email = emailCaption(row);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initials={row.initials ?? initialsFor(row.from)} size={32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{row.from}</div>
              {email ? (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email}
                </div>
              ) : null}
              {row.unread ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)' }}>Unread</div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span style={{ fontWeight: row.unread ? 700 : 500 }}>{row.subject}</span>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (row) => <ChannelTag channel={row.channel} />,
    },
    {
      key: 'lastActive',
      header: 'Last active',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.lastActive ?? '—'}</span>
      ),
    },
  ];

  const unansweredLabelCount = unansweredCount ?? unansweredInView;

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Messages"
        kicker="Inbox"
        lede={
          unansweredCount === undefined
            ? 'Member ↔ staff threads.'
            : unansweredCount === 0
              ? 'Member ↔ staff threads. Every member message has a staff reply.'
              : `Member ↔ staff threads. ${unansweredCount} member ${unansweredCount === 1 ? 'message is' : 'messages are'} waiting for a staff reply.`
        }
        action={
          unansweredCount !== undefined ? (
            <Token
              label={`${unansweredCount} unanswered`}
              size="sm"
              color={unansweredCount > 0 ? 'red' : 'green'}
            />
          ) : undefined
        }
      />

      <div
        className="wa-mb-5 wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-3"
        style={{ alignItems: 'end' }}
        data-testid="messages-kit-filters"
      >
        <FormField
          label="Search messages"
          type="search"
          placeholder="Name, email, or subject"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="lg:wa-col-span-2 wa-kit-view-chips">
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as MessageFilter)}
            label="Message filters"
            size="sm"
            layout="hug"
          >
            <SegmentedControlItem
              value="unanswered"
              label={`Unanswered · ${unansweredLabelCount}`}
            />
            <SegmentedControlItem value="all" label={`All messages · ${threads.length}`} />
          </SegmentedControl>
        </div>
      </div>

      <DataTable<MessageThread>
        columns={columns}
        rows={visibleThreads}
        rowKey={(row) => row.id}
        onRowClick={openThread}
        mobile="cards"
        cardRender={(row) => {
          const email = emailCaption(row);
          return (
          <Card padding={3}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar initials={row.initials ?? initialsFor(row.from)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.from}
                </div>
                {email ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--wa-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {email}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.subject}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 10,
              }}
            >
              <ChannelTag channel={row.channel} />
              <span style={{ fontSize: 13, color: 'var(--wa-muted)', whiteSpace: 'nowrap' }}>
                {row.lastActive ?? '—'}
              </span>
            </div>
          </Card>
          );
        }}
        emptyTitle={
          search.trim() || filter === 'unanswered'
            ? 'No matching messages'
            : 'No messages yet'
        }
        emptyDescription={
          search.trim()
            ? 'Try a different name, email, or subject, or clear the search.'
            : filter === 'unanswered'
              ? 'Every loaded thread has a staff reply. Switch to All messages to browse the inbox.'
              : 'Member ↔ staff threads will show up here.'
        }
      />
    </DesignSurface>
  );
}
