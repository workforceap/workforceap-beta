'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  Avatar,
  FormField,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import { WIOA_QUEUE_AGE_ALERT_DAYS } from '@/lib/wioa/wioaQueueAge';
import {
  INTAKE_STATUS_WORDS,
  intakeStatusLabel,
  intakeStatusTone,
  type IntakeStatusKey,
} from '@/lib/status/applicationStatusVocabulary';
import {
  DEFAULT_WIOA_SCREENING_SORT_DIRECTION,
  DEFAULT_WIOA_SCREENING_SORT_KEY,
  matchesWioaScreeningSearch,
  sortWioaScreeningRows,
  type WioaScreeningSortKey,
} from '@/lib/admin/wioaScreeningSort';
import { toneToTokenColor } from '../../astryxMap';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

/**
 * WIOA funding eligibility — screening & compliance (dense).
 * Mockup: workforceap-admin-full.html "wioa" view.
 * Target route: /admin/wioa-screening
 *
 * Interactive search + sortable Student / Docs / Days waiting columns (UI-08).
 * Rows arrive already ordered by `lib/wioa/wioaQueueAge.ts`
 * (`sortWioaQueueOldestFirst`); client sort overrides that default.
 * DataTable mobile="cards" so the wide compliance table stacks on phones.
 * Bulk reviewer assignment is omitted until a staff-assign API exists.
 */

/**
 * The staff review column speaks the shared intake vocabulary
 * (lib/status/applicationStatusVocabulary.ts): "Intake verified", never
 * "Eligible" — staff verification is not a legal WIOA eligibility
 * determination (lib/wioa/wioaReview.ts). Token colour follows the tone
 * (KIT_GUIDE §4: not eligible = red, needs more information = brand pink).
 */
function wioaReviewToken(key: IntakeStatusKey): { label: string; color: TokenColor } {
  return { label: intakeStatusLabel(key, 'staff'), color: toneToTokenColor(intakeStatusTone(key)) };
}

export interface WioaScreeningRow {
  id: string;
  /** Student / member full name. */
  name: string;
  initials: string;
  /** WIOA category caption, e.g. "Adult", "Dislocated Worker", "Youth". */
  category: string;
  /** Actual saved source; application answers do not imply questionnaire fields. */
  source?: string;
  /** Document status caption, e.g. "Complete" or "Missing W-2". */
  docs: string;
  /** Whether docs are outstanding (drives the docs cell color). */
  docsComplete: boolean;
  /** Staff intake review status (vocabulary key) → word + Token color via `wioaReviewToken`. */
  reviewStatus: IntakeStatusKey;
  /** Reviewing staff name or "—". */
  reviewer: string;
  /** Still waiting on a staff decision (`pending` / `in_review`). */
  awaitingReview: boolean;
  /**
   * Whole days since the member submitted the screening, for rows still
   * awaiting review (WAP-166 item 2); null for reviewed rows or an unusable
   * timestamp. Drives the default oldest-first order.
   */
  daysWaiting: number | null;
  /** Staff decision time (orders reviewed rows); null while awaiting review. */
  reviewedAt?: Date | null;
}

export interface WioaScreeningKitProps {
  rows: WioaScreeningRow[];
  /** Total screenings submitted (table footer). */
  total: number;
  /** KPI: intake verified by staff. */
  verified: number;
  /** KPI: pending + in-review. */
  pendingReview: number;
  /** KPI: needs more information / outstanding docs. */
  needDocs: number;
  /** KPI: staff recorded not eligible. */
  notEligible: number;
  filterBar?: ReactNode;
  publicScreenings?: ReactNode;
}

/** "117" for a waiting row; "—" once staff have decided or when no timestamp is usable. */
function daysWaitingLabel(row: Pick<WioaScreeningRow, 'awaitingReview' | 'daysWaiting'>): string {
  if (!row.awaitingReview || row.daysWaiting === null) return '—';
  return String(row.daysWaiting);
}

export function WioaScreeningKit({
  rows,
  total,
  verified,
  pendingReview,
  needDocs,
  notEligible,
  filterBar,
  publicScreenings,
}: WioaScreeningKitProps) {
  const [search, setSearch] = useState('');
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<WioaScreeningSortKey>(
    DEFAULT_WIOA_SCREENING_SORT_KEY,
    DEFAULT_WIOA_SCREENING_SORT_DIRECTION,
    ['name', 'docs'],
  );

  const visibleRows = useMemo(() => {
    const kept = rows.filter((row) => matchesWioaScreeningSearch(row, search));
    return sortWioaScreeningRows(kept, sortKey, sortDirection);
  }, [rows, search, sortKey, sortDirection]);

  const kpis: KpiItem[] = [
    { label: INTAKE_STATUS_WORDS.staff.verified, value: verified },
    { label: INTAKE_STATUS_WORDS.staff.pending, value: pendingReview, tone: pendingReview > 0 ? 'warn' : undefined },
    { label: INTAKE_STATUS_WORDS.staff.needs_info, value: needDocs, tone: needDocs > 0 ? 'alert' : undefined },
    { label: INTAKE_STATUS_WORDS.staff.not_eligible, value: notEligible },
  ];

  const StudentCell = ({ row }: { row: WioaScreeningRow }) => (
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
          {row.name}
        </div>
      </div>
    </div>
  );

  const columns: Column<WioaScreeningRow>[] = [
    {
      key: 'name',
      header: sortHeader('name', 'Student'),
      ariaSort: ariaSortForColumn('name', sortKey, sortDirection),
      render: (row) => <StudentCell row={row} />,
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <span>{row.source ?? '—'}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)' }}>{row.category}</span>
      ),
    },
    {
      key: 'docs',
      header: sortHeader('docs', 'Docs'),
      ariaSort: ariaSortForColumn('docs', sortKey, sortDirection),
      render: (row) => (
        <span
          style={{ color: row.docsComplete ? 'var(--wa-text)' : 'var(--wa-accent)', fontWeight: row.docsComplete ? 400 : 700 }}
        >
          {row.docs}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'Staff review',
      render: (row) => <Token {...wioaReviewToken(row.reviewStatus)} size="sm" />,
    },
    {
      key: 'daysWaiting',
      header: sortHeader('daysWaiting', 'Days waiting'),
      align: 'right',
      ariaSort: ariaSortForColumn('daysWaiting', sortKey, sortDirection),
      render: (row) => (
        <span
          className="wa-kit-table-cell--num"
          style={{
            color: row.daysWaiting !== null && row.daysWaiting >= WIOA_QUEUE_AGE_ALERT_DAYS ? 'var(--wa-accent)' : 'var(--wa-muted)',
            fontWeight: row.daysWaiting !== null && row.daysWaiting >= WIOA_QUEUE_AGE_ALERT_DAYS ? 700 : 400,
          }}
        >
          {daysWaitingLabel(row)}
        </span>
      ),
    },
    {
      key: 'reviewer',
      header: 'Reviewer',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.reviewer}</span>,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <KitLinkButton href={`/admin/members/${row.id}?tab=eligibility`} label="Open" variant="secondary" size="sm" />
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Funding eligibility"
        kicker="Compliance"
        lede="WIOA screening & compliance"
        action={
          <KitLinkButton href="/admin/wioa-screening?ui=legacy" label="Review queue" variant="secondary" size="sm" />
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {filterBar}

      <div className="wa-mb-4" style={{ maxWidth: 28 * 16 }}>
        <FormField
          label="Search students"
          type="search"
          placeholder="Name, source, category, docs, or reviewer"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <DataTable<WioaScreeningRow>
        columns={columns}
        rows={visibleRows}
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
                <StudentCell row={row} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <Token {...wioaReviewToken(row.reviewStatus)} size="sm" />
                <KitLinkButton href={`/admin/members/${row.id}?tab=eligibility`} label="Open" variant="secondary" size="sm" />
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
                margin: '12px 0 0',
              }}
            >
              <span>Source <b style={{ color: 'var(--wa-text)' }}>{row.source ?? '—'}</b></span>
              <span>
                Category <b style={{ color: 'var(--wa-text)' }}>{row.category}</b>
              </span>
              <span>
                Docs{' '}
                <b style={{ color: row.docsComplete ? 'var(--wa-text)' : 'var(--wa-accent)' }}>
                  {row.docs}
                </b>
              </span>
              <span>
                Reviewer <b style={{ color: 'var(--wa-text)' }}>{row.reviewer}</b>
              </span>
              {row.awaitingReview ? (
                <span>
                  Waiting{' '}
                  <b style={{ color: row.daysWaiting !== null && row.daysWaiting >= WIOA_QUEUE_AGE_ALERT_DAYS ? 'var(--wa-accent)' : 'var(--wa-text)' }}>
                    {row.daysWaiting === null ? '—' : `${row.daysWaiting} day${row.daysWaiting === 1 ? '' : 's'}`}
                  </b>
                </span>
              ) : null}
            </div>
          </Card>
        )}
        emptyTitle={search.trim() ? 'No matching screenings' : 'No screenings yet'}
        emptyDescription={
          search.trim()
            ? 'Try a different name or clear the search.'
            : 'Members with application screening or a portal questionnaire appear here for intake review.'
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
        Showing {visibleRows.length} of {total}
        {search.trim() && visibleRows.length !== rows.length ? ` (filtered from ${rows.length})` : ''}
      </p>
      {publicScreenings}
    </DesignSurface>
  );
}
