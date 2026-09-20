'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Mail, Smartphone } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  Avatar,
  type Column,
} from '@/components/portal/kit';

/**
 * Messages — member ↔ staff threads (dense).
 * Mockup: workforceap-admin-suite chrome; "Message a student" surface.
 * Target route: /admin/messages
 *
 * Rows/cards are clickable: selecting a thread opens it in the interactive
 * inbox (?ui=legacy&thread=<id>) where staff can read and reply.
 */
export type MessageChannel = 'In-app' | 'Email' | 'SMS';

export interface MessageThread {
  id: string;
  /** Member the thread is with. */
  from: string;
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
}

const DEFAULT_THREADS: MessageThread[] = [
  {
    id: 'mb',
    from: 'Mike Brown',
    initials: 'MB',
    subject: 'Question about exam voucher',
    channel: 'In-app',
    unread: true,
    lastActive: '2h ago',
  },
  {
    id: 'tr',
    from: 'Tanya Reed',
    initials: 'TR',
    subject: 'Schedule change request',
    channel: 'Email',
    lastActive: '5h ago',
  },
  {
    id: 'ct',
    from: 'Carlos Torres',
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

export function MessagesKit({ threads = DEFAULT_THREADS }: MessagesKitProps) {
  const router = useRouter();
  const openThread = (row: MessageThread) =>
    router.push(`/admin/messages?ui=legacy&thread=${encodeURIComponent(row.id)}`);

  const columns: Column<MessageThread>[] = [
    {
      key: 'from',
      header: 'From',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar initials={row.initials ?? initialsFor(row.from)} size={32} />
          <div>
            <div style={{ fontWeight: 700 }}>{row.from}</div>
            {row.unread ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)' }}>Unread</div>
            ) : null}
          </div>
        </div>
      ),
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

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Messages"
        kicker="Inbox"
        lede="Member ↔ staff threads."
      />

      <DataTable<MessageThread>
        columns={columns}
        rows={threads}
        rowKey={(row) => row.id}
        onRowClick={openThread}
        mobile="cards"
        cardRender={(row) => (
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
        )}
        emptyTitle="No messages yet"
        emptyDescription="Member ↔ staff threads will show up here."
      />
    </DesignSurface>
  );
}
