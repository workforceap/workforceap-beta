'use client';

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
 * In-office sessions — admin view rendered as a dense roster table.
 * Mockup: workforceap-admin-full.html "sessions" view.
 * Target route: /admin/sessions
 *
 * Columns: Member · Counselor · Type · When · Status.
 * Status is a Token derived from the session's recency:
 *   - "In session" (ok)   → activity within the live window
 *   - "Completed" (muted) → past sessions
 * The wide table collapses to stacked cards on mobile via DataTable mobile="cards".
 *
 * Data is real: each row is a session grouped from `ai_tool_run_completed`
 * MemberEvent rows (see SessionsIndexBody). The mockup's "Scheduled" tone is
 * kept available for future scheduled-session support but is not synthesized
 * from data — we only label what the events actually tell us.
 */

export type SessionDisplayStatus = 'Scheduled' | 'In session' | 'Completed';

export interface SessionKitRow {
  id: string;
  /** Member full name (or email fallback). */
  member: string;
  memberEmail: string;
  initials: string;
  /** Counselor / actor who ran the session. */
  counselor: string;
  /** Session type label (e.g. "Session · 3 tools"). */
  type: string;
  /** Human "when" label, e.g. "Now", "2h ago", "Thu 6 PM". */
  when: string;
  status: SessionDisplayStatus;
  href: string;
}

export interface SessionsKitProps {
  sessions?: SessionKitRow[];
  /** Total sessions in scope (for the subtitle count). */
  total?: number;
}

const DEFAULT_SESSIONS: SessionKitRow[] = [
  {
    id: 'demo-1',
    member: 'Mike Brown',
    memberEmail: 'mike.brown@email.com',
    initials: 'MB',
    counselor: 'S. Chen',
    type: 'Mock interview',
    when: 'Thu 6 PM',
    status: 'Scheduled',
    href: '/admin/sessions/demo-1',
  },
  {
    id: 'demo-2',
    member: 'Lena Ortiz',
    memberEmail: 'lena.ortiz@email.com',
    initials: 'LO',
    counselor: 'R. Patel',
    type: 'Walk-in',
    when: 'Now',
    status: 'In session',
    href: '/admin/sessions/demo-2',
  },
];

const STATUS_TONE: Record<SessionDisplayStatus, TokenColor> = {
  Scheduled: 'blue',
  'In session': 'green',
  Completed: 'gray',
};

export function SessionsKit({ sessions = DEFAULT_SESSIONS, total }: SessionsKitProps) {
  const count = total ?? sessions.length;
  const subtitle = `${count.toLocaleString()} ${
    count === 1 ? 'session' : 'sessions'
  } across counselors`;

  const columns: Column<SessionKitRow>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar initials={row.initials} size={32} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.member}
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
              {row.memberEmail}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'counselor',
      header: 'Counselor',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.counselor}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.type}</span>,
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-muted)' }}>
          {row.when}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Token label={row.status} size="sm" color={STATUS_TONE[row.status]} />,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="In-office sessions"
        kicker="Counselors"
        lede="Walk-in & scheduled counselor sessions"
      />

      <DataTable<SessionKitRow>
        columns={columns}
        rows={sessions}
        rowKey={(row) => row.id}
        minWidth={720}
        mobile="cards"
        onRowClick={
          sessions === DEFAULT_SESSIONS
            ? undefined
            : (row) => {
                if (row.href) window.location.href = row.href;
              }
        }
        cardRender={(row) => (
          <Card padding={3}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <Avatar initials={row.initials} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.member}
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
                    {row.counselor} · {row.type}
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.status} size="sm" color={STATUS_TONE[row.status]} />
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.when}
            </div>
          </Card>
        )}
        emptyTitle="No sessions yet"
        emptyDescription="Once any counselor or admin runs a session, it lands here."
      />
    </DesignSurface>
  );
}
