'use client';

import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  type Column,
} from '@/components/portal/kit';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import { ProgramChangeReviewActions } from '@/components/admin/ProgramChangeReviewActions';

/**
 * Program change requests — admin review queue rendered as a dense table.
 * Mockup: workforceap-admin-full.html "program-requests" view.
 * Target route: /admin/program-change-requests
 *
 * Columns: Student · Current · Requested · Reason · Status.
 * Status is an Astryx Token (Pending=yellow, Approved=green, Rejected=pink, …).
 * Wide table collapses to stacked cards on mobile via DataTable mobile="cards".
 *
 * The page resolves program slugs → friendly titles and the raw status enum →
 * display status server-side, then hands rows down. With `reviewable`, pending
 * rows get Approve / Deny controls (WAP-193); otherwise it is a pure presenter.
 */

/** Display status mapped from the underlying ProgramChangeRequestStatus enum. */
export type ProgramChangeDisplayStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

export interface ProgramChangeRow {
  id: string;
  /** Student full name (falls back to email/id at the page layer). */
  student: string;
  /** Friendly current-program label, e.g. "Manufacturing" or "—". */
  current: string;
  /** Friendly requested-program label, e.g. "Cloud & IT". */
  requested: string;
  reason: string;
  status: ProgramChangeDisplayStatus;
}

export interface ProgramChangeRequestsKitProps {
  requests?: ProgramChangeRow[];
  /** Count of requests still awaiting review (for the subtitle). */
  pendingCount?: number;
  /** Show Approve / Deny (with an optional admin note) on pending rows. */
  reviewable?: boolean;
}

const DEFAULT_REQUESTS: ProgramChangeRow[] = [
  {
    id: 'devon-hill',
    student: 'Devon Hill',
    current: 'Manufacturing',
    requested: 'Cloud & IT',
    reason: 'Found cloud more relevant',
    status: 'Pending',
  },
  {
    id: 'lena-ortiz',
    student: 'Lena Ortiz',
    current: 'Data & AI',
    requested: 'Healthcare',
    reason: 'Family in nursing',
    status: 'Pending',
  },
  {
    id: 'sam-cole',
    student: 'Sam Cole',
    current: 'Skilled Trades',
    requested: 'Manufacturing',
    reason: 'Schedule conflict',
    status: 'Pending',
  },
];

const STATUS_TOKEN_COLOR: Record<ProgramChangeDisplayStatus, TokenColor> = {
  Pending: 'yellow',
  Approved: 'green',
  Rejected: 'pink',
  Cancelled: 'gray',
};

export function ProgramChangeRequestsKit({
  requests = DEFAULT_REQUESTS,
  pendingCount = 3,
  reviewable = false,
}: ProgramChangeRequestsKitProps) {
  const decision = (row: ProgramChangeRow) =>
    reviewable && row.status === 'Pending' ? (
      <ProgramChangeReviewActions id={row.id} student={row.student} requested={row.requested} />
    ) : null;
  const subtitle = `${pendingCount.toLocaleString()} pending approval`;

  const columns: Column<ProgramChangeRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.student}</span>,
    },
    {
      key: 'current',
      header: 'Current',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.current}</span>,
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (row) => <span style={{ fontWeight: 600 }}>{row.requested}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />,
    },
  ];
  if (reviewable) {
    columns.push({ key: 'decision', header: 'Decision', render: decision });
  }

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Program change requests"
        kicker="Enrollment"
        lede={subtitle}
        action={
          <KitLinkButton
            href="/admin/program-change-requests?ui=legacy"
            label={reviewable ? 'History & notes' : 'Review & decide'}
            variant="secondary"
            size="sm"
          />
        }
      />

      <DataTable<ProgramChangeRow>
        columns={columns}
        rows={requests}
        rowKey={(row) => row.id}
        minWidth={reviewable ? 1000 : 760}
        mobile="cards"
        cardRender={(row) => (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.student}
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
                  {row.current} → {row.requested}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              {row.reason}
            </div>
            {decision(row) ? <div style={{ marginTop: 12 }}>{decision(row)}</div> : null}
          </Card>
        )}
        emptyTitle="No program change requests"
        emptyDescription="When members request to switch programs, they'll appear here for review."
      />
    </DesignSurface>
  );
}
