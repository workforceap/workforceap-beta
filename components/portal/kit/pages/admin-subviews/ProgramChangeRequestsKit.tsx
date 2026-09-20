'use client';

import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  type Column,
} from '@/components/portal/kit';

/**
 * Program change requests — admin review queue rendered as a dense table.
 * Mockup: workforceap-admin-full.html "program-requests" view.
 * Target route: /admin/program-change-requests
 *
 * Columns: Student · Current · Requested · Reason · Status.
 * Status is an Astryx Token (Pending=yellow, Approved=green, Rejected=pink, …).
 * Wide table collapses to stacked cards on mobile via DataTable mobile="cards".
 *
 * This is a pure presenter: the page resolves program slugs → friendly titles
 * and the raw status enum → display status server-side, then hands rows down.
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
}: ProgramChangeRequestsKitProps) {
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

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Program change requests"
        kicker="Enrollment"
        goal={subtitle}
        action={
          <AstryxLink href="/admin/program-change-requests?ui=legacy" as={Link as never} isStandalone>
            <Button label="Review & decide" variant="secondary" size="sm" />
          </AstryxLink>
        }
      />

      <DataTable<ProgramChangeRow>
        columns={columns}
        rows={requests}
        rowKey={(row) => row.id}
        minWidth={760}
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
          </Card>
        )}
        emptyTitle="No program change requests"
        emptyDescription="When members request to switch programs, they'll appear here for review."
      />
    </DesignSurface>
  );
}
