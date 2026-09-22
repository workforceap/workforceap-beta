'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import {
  DEFAULT_PLACEMENT_SORT_DIRECTION,
  DEFAULT_PLACEMENT_SORT_KEY,
  sortPlacementRows,
  type PlacementSortKey,
} from '@/lib/admin/placementsRosterSort';

/**
 * Placements — confirmed hires & wage data (dense).
 * Mockup: workforceap-admin-full.html "placements" view.
 * Target route: /admin/placements
 *
 * Server-rendered (no interactivity): all aggregation happens in the page
 * loader from lean Prisma queries and lands here as plain data. The wide
 * table collapses to stacked cards on mobile via DataTable mobile="cards".
 *
 * Columns: Student · Employer · Role · Wage · Survey · Status.
 *  - Survey: Done (a follow-up survey was completed) = ok, else Pending = muted.
 *  - Status: Confirmed (startDateVerified) = ok; Member-reported, unverified
 *    (the member confirmed an offer themselves, no staff verification yet) =
 *    warning; else Pending = muted.
 */

/** Follow-up survey progress for a placement. */
export type SurveyStatus = 'Pending' | 'Done';
/**
 * Hire confirmation state (mockup: "Confirmed" vs "Pending"). 'Member-reported'
 * is a pending row the member created by confirming an offer on their own
 * dashboard (lib/placement/recordPlacementFromApplication.ts); staff must be
 * able to tell it from a row a counselor or employer stood up.
 */
export type ConfirmStatus = 'Pending' | 'Confirmed' | 'Member-reported';

export interface PlacementRow {
  id: string;
  /**
   * Member (User) id for this placement — used to drill into the member's
   * detail page on row click (parity with the legacy table's "Member" link).
   * Null when the placement has no linked user.
   */
  memberId?: string | null;
  /** Student / member display name. */
  student: string;
  employer: string;
  /** Job title / role. */
  role: string;
  /** Pre-formatted wage, e.g. "$52k" or "—". */
  wage: string;
  /** Follow-up survey progress. */
  survey: SurveyStatus;
  /** Hire confirmation state. */
  status: ConfirmStatus;
}

export interface PlacementsKitProps {
  placements: PlacementRow[];
  /** Placements recorded year-to-date (KPI: YTD). */
  ytd: number;
  /** Pre-formatted average wage, e.g. "$58k" or "—" (KPI: Avg Wage). */
  avgWage: string;
  /** Pre-formatted 90-day retention rate, e.g. "84%" or "—" (KPI: Retention 90d). */
  retention90d: string;
  /** Hires still awaiting confirmation (KPI: To Confirm). */
  toConfirm: number;
  /** Total placements in this view (footer). */
  total: number;
  /** Query failed — show a next-step error, do not pretend the roster is empty. */
  loadError?: string | null;
}

const SURVEY_TONE: Record<SurveyStatus, TokenColor> = {
  Pending: 'gray',
  Done: 'green',
};

const STATUS_TONE: Record<ConfirmStatus, TokenColor> = {
  Pending: 'gray',
  Confirmed: 'green',
  'Member-reported': 'yellow',
};

/** What the Status token says; the member-reported state spells out that it is unverified. */
export const STATUS_LABEL: Record<ConfirmStatus, string> = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  'Member-reported': 'Member-reported, unverified',
};

export function PlacementsKit({
  placements,
  ytd,
  avgWage,
  retention90d,
  toConfirm,
  total,
  loadError = null,
}: PlacementsKitProps) {
  const router = useRouter();
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<PlacementSortKey>(
    DEFAULT_PLACEMENT_SORT_KEY,
    DEFAULT_PLACEMENT_SORT_DIRECTION,
    ['student', 'employer', 'role'],
  );
  const sortedPlacements = useMemo(
    () => sortPlacementRows(placements, sortKey, sortDirection),
    [placements, sortKey, sortDirection],
  );

  const kpis: KpiItem[] = [
    { label: 'YTD', value: ytd },
    { label: 'Avg Wage', value: avgWage },
    { label: 'Retention 90d', value: retention90d },
    { label: 'To Confirm', value: toConfirm, tone: toConfirm > 0 ? 'alert' : undefined },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const columns: Column<PlacementRow>[] = [
    {
      key: 'student',
      header: sortHeader('student', 'Student'),
      stickyLeft: true,
      minWidth: 160,
      ariaSort: ariaSortForColumn('student', sortKey, sortDirection),
      render: (row) => (
        <span
          style={{
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
          title={row.student}
        >
          {row.student}
        </span>
      ),
    },
    {
      key: 'employer',
      header: sortHeader('employer', 'Employer'),
      minWidth: 140,
      ariaSort: ariaSortForColumn('employer', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.employer}</span>,
    },
    {
      key: 'role',
      header: sortHeader('role', 'Role'),
      minWidth: 140,
      ariaSort: ariaSortForColumn('role', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.role}</span>,
    },
    {
      key: 'wage',
      header: sortHeader('wage', 'Wage'),
      align: 'right',
      minWidth: 72,
      ariaSort: ariaSortForColumn('wage', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.wage}</span>
      ),
    },
    {
      key: 'survey',
      header: sortHeader('survey', 'Survey'),
      minWidth: 96,
      ariaSort: ariaSortForColumn('survey', sortKey, sortDirection),
      render: (row) => (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.survey} size="sm" color={SURVEY_TONE[row.survey]} />
        </span>
      ),
    },
    {
      key: 'status',
      header: sortHeader('status', 'Status'),
      minWidth: 108,
      ariaSort: ariaSortForColumn('status', sortKey, sortDirection),
      render: (row) => (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={STATUS_LABEL[row.status]} size="sm" color={STATUS_TONE[row.status]} />
        </span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Placements"
        kicker="Outcomes"
        lede="Confirmed hires & wage data"
        action={
          // Wraps like UsersKit's action row: three nowrap buttons in a single
          // flex line pushed the shell to 415px at a 390px viewport.
          <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
            <AstryxLink href="/admin/placements/new" as={NextLink as never} isStandalone>
              <Button label="Record placement" variant="primary" size="sm" />
            </AstryxLink>
            <AstryxLink href="/admin/placements/retention" as={NextLink as never} isStandalone>
              <Button label="Retention decisions due" variant="secondary" size="sm" />
            </AstryxLink>
            <AstryxLink href="/admin/placements?ui=legacy" as={NextLink as never} isStandalone>
              <Button label="Open table view" variant="secondary" size="sm" />
            </AstryxLink>
          </div>
        }
      />

      {loadError ? (
        <p
          role="alert"
          style={{
            margin: '0 0 16px',
            padding: '12px 14px',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1px solid color-mix(in srgb, var(--wa-danger) 35%, var(--wa-border))',
            background: 'color-mix(in srgb, var(--wa-danger) 10%, var(--wa-surface))',
            color: 'var(--wa-text)',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {loadError}{' '}
          <AstryxLink href="/admin/placements/new" as={NextLink as never}>
            Record a placement
          </AstryxLink>
          {' · '}
          <AstryxLink href="/admin/placements?ui=legacy" as={NextLink as never}>
            Open table view
          </AstryxLink>
        </p>
      ) : null}

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <DataTable<PlacementRow>
        columns={columns}
        rows={sortedPlacements}
        rowKey={(row) => row.id}
        minWidth={800}
        onRowClick={(row) => {
          if (row.memberId) router.push(`/admin/members/${row.memberId}`);
        }}
        mobile="cards"
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
                  {row.role} · {row.employer}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={STATUS_LABEL[row.status]} size="sm" color={STATUS_TONE[row.status]} />
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
              <span style={{ ...numStyle, fontWeight: 700, color: 'var(--wa-text)' }}>
                {row.wage}
              </span>
              <span>
                Survey <Token label={row.survey} size="sm" color={SURVEY_TONE[row.survey]} />
              </span>
            </div>
          </Card>
        )}
        emptyTitle={loadError ? 'Placements unavailable' : 'No placements yet'}
        emptyDescription={
          loadError
            ? 'The roster did not load. Use Record placement if you already have the hire details, or retry this page.'
            : 'When a member lands a job, use Record placement so outcomes reporting stays accurate.'
        }
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {placements.length} of {total}
      </p>
    </DesignSurface>
  );
}
