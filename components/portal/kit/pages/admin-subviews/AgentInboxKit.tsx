import NextLink from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  StatusTag,
  type Column,
  type KpiItem,
  type KitTone,
} from '@/components/portal/kit';

/**
 * Agent Inbox — admin review queue for drafts and incomplete deliveries (dense, read-only).
 * Target route: /admin/agent-inbox  (interactive approve/dismiss UI lives behind ?ui=legacy)
 *
 * The live page is an interactive inbox: a counselor reviews AI-drafted
 * celebration / next-step emails and approves or dismisses each cascade. This
 * kit treatment is the at-a-glance summary that renders by default — a KPI
 * strip of pipeline totals plus a dense table of everything awaiting review,
 * oldest first. Approve/Send still happens in the legacy UI.
 *
 * Server-rendered (no interactivity): all data lands as plain serialized rows
 * from the page loader (`listAwaitingApprovalCascades` + `getCascadeMetrics`),
 * so this stays server-component friendly. DataTable mobile="cards" stacks the
 * wide queue on phones instead of squishing it.
 */

/** One cascade awaiting review, pre-formatted for display. */
export interface AgentInboxRow {
  id: string;
  /** Learner full name, or email when name is missing. */
  from: string;
  /** Secondary caption under the learner (email / milestone ref). */
  caption: string;
  /** Humanized milestone type, e.g. "course completed". */
  type: string;
  /** Number of actionable drafts queued for this cascade. */
  drafts: number;
  /** Detected-at caption, e.g. "Jun 18, 2026". */
  when: string;
  /** Expiry urgency caption, e.g. "expires in 6h" / "expires in 2d". */
  expires: string;
  /** Urgency tone derived from time-to-expiry. */
  urgency: KitTone;
}

export interface AgentInboxKitProps {
  rows: AgentInboxRow[];
  /** Total drafts or incomplete deliveries needing staff review (matches the queue). */
  awaitingReview: number;
  /** Cascades still waiting on the LLM to draft. */
  pendingDraft: number;
  /** All-time approved & sent. */
  sent: number;
  /** All-time dismissed + expired. */
  resolved: number;
}

export function AgentInboxKit({
  rows,
  awaitingReview,
  pendingDraft,
  sent,
  resolved,
}: AgentInboxKitProps) {
  const goal =
    awaitingReview === 0
      ? 'No cascades awaiting review right now.'
      : `${awaitingReview.toLocaleString()} cascade${
          awaitingReview === 1 ? '' : 's'
        } awaiting your review`;

  const kpis: KpiItem[] = [
    { label: 'Needs review', value: awaitingReview, color: 'accent' },
    { label: 'Pending Draft', value: pendingDraft, color: 'info' },
    { label: 'Sent', value: sent, color: 'success' },
    { label: 'Resolved', value: resolved, color: 'muted' },
  ];

  const FromCell = ({ row }: { row: AgentInboxRow }) => (
    <div style={{ minWidth: 0 }}>
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
        {row.caption}
      </div>
    </div>
  );

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const columns: Column<AgentInboxRow>[] = [
    { key: 'from', header: 'Learner', render: (row) => <FromCell row={row} /> },
    {
      key: 'type',
      header: 'Milestone',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.type}</span>,
    },
    {
      key: 'drafts',
      header: 'Drafts',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700 }}>{row.drafts}</span>
      ),
    },
    {
      key: 'when',
      header: 'Detected',
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)' }}>{row.when}</span>
      ),
    },
    {
      key: 'expires',
      header: 'Status',
      render: (row) => <StatusTag tone={row.urgency}>{row.expires}</StatusTag>,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Agent Inbox"
        kicker="Agentforce"
        lede={goal}
        action={
          <AstryxLink href="/admin/agent-inbox?ui=legacy" as={NextLink as never} isStandalone>
            <Button label="Review & Send" variant="primary" size="sm" />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<AgentInboxRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={680}
        mobile="cards"
        cardRender={(row) => (
          <div className="wa-kit-card wa-kit-card--sm">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <FromCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatusTag tone={row.urgency}>{row.expires}</StatusTag>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span>{row.type}</span>
              <span style={numStyle}>
                <b style={{ color: 'var(--wa-text)' }}>{row.drafts}</b>{' '}
                {row.drafts === 1 ? 'draft' : 'drafts'} · {row.when}
              </span>
            </div>
          </div>
        )}
        emptyTitle="The queue is empty"
        emptyDescription="Cascades appear here when learners hit milestones and the drafting cron produces a counselor-reviewable draft."
      />

      {rows.length > 0 ? (
        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--wa-muted)',
            marginTop: 16,
          }}
        >
          Showing {rows.length} awaiting review · approve or dismiss in the{' '}
          <a
            href="/admin/agent-inbox?ui=legacy"
            className="wa-kit-focus"
            style={{ color: 'var(--wa-accent)' }}
          >
            review queue
          </a>
        </p>
      ) : null}
    </DesignSurface>
  );
}
