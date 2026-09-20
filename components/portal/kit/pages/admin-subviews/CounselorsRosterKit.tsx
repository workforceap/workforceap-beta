'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  DataTable,
  Avatar,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import {
  DEFAULT_COUNSELOR_SORT_DIRECTION,
  DEFAULT_COUNSELOR_SORT_KEY,
  sortCounselorRows,
  type CounselorSortKey,
} from '@/lib/admin/counselorsRosterSort';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';

/**
 * Counselors roster — staff caseload & performance (dense).
 * Mockup: workforceap-admin-full.html "counselors" view.
 * Target route: /admin/counselors
 *
 * Server-rendered (no interactivity) so this stays a server component-friendly
 * module: all aggregation happens in the page loader and lands here as plain
 * data. Uses DataTable mobile="cards" so the wide caseload table stacks on
 * mobile instead of squishing.
 */
export interface CounselorRow {
  id: string;
  name: string;
  initials: string;
  /** Affiliation / title caption, e.g. "WorkforceAP · Career Coach". */
  caption: string;
  /** Active assignments owned. */
  caseload: number;
  /** Members in this caseload flagged at-risk. */
  atRisk: number;
  /** Members in this caseload with memberStatus = placed. */
  placements: number;
  /** Avg first-response caption (e.g. "2.1h") or "—" when unavailable. */
  avgResponse: string;
  /** Caseload load tone vs the cohort average. */
  load: 'Over' | 'Balanced' | 'Light';
}

export interface CounselorsRosterKitProps {
  counselors: CounselorRow[];
  currentPage?: number;
  pageSize?: number;
  matchingTotal?: number;
  searchQuery?: string;
  /** Total active counselors (KPI + roster header). */
  total: number;
  /** Avg caseload across counselors (rounded). */
  avgCaseload: number;
  /** Total at-risk members owned across all counselors. */
  atRiskOwned: number;
  /** Avg first-response caption (e.g. "3.2h") or "—". */
  avgResponse: string;
}

const LOAD_TOKEN_COLOR: Record<CounselorRow['load'], TokenColor> = {
  Over: 'pink',
  Balanced: 'green',
  Light: 'blue',
};

export function CounselorsRosterKit({
  counselors,
  total,
  avgCaseload,
  atRiskOwned,
  avgResponse,
  currentPage = 1,
  pageSize = 50,
  matchingTotal = total,
  searchQuery = '',
}: CounselorsRosterKitProps) {
  const [query, setQuery] = useState(searchQuery);
  const pageHref = (page: number) => `/admin/counselors?${new URLSearchParams({ search: searchQuery, page: String(page) })}`;
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<CounselorSortKey>(
    DEFAULT_COUNSELOR_SORT_KEY,
    DEFAULT_COUNSELOR_SORT_DIRECTION,
    ['name'],
  );
  const sortedCounselors = useMemo(
    () => sortCounselorRows(counselors, sortKey, sortDirection),
    [counselors, sortKey, sortDirection],
  );

  const kpis: KpiItem[] = [
    { label: 'Counselors', value: total },
    { label: 'Avg Caseload', value: avgCaseload },
    // Only a real state colours a number: at-risk owned > 0 is one.
    { label: 'At-Risk Owned', value: atRiskOwned, tone: typeof atRiskOwned === 'number' && atRiskOwned > 0 ? 'accent' : undefined },
    { label: 'Avg Response', value: avgResponse },
  ];

  const CounselorCell = ({ row }: { row: CounselorRow }) => (
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
        <div
          style={{
            fontSize: 10,
            color: 'var(--wa-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.caption}
        </div>
      </div>
    </div>
  );

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  const columns: Column<CounselorRow>[] = [
    {
      key: 'name',
      header: sortHeader('name', 'Counselor'),
      stickyLeft: true,
      minWidth: 200,
      ariaSort: ariaSortForColumn('name', sortKey, sortDirection),
      render: (row) => <CounselorCell row={row} />,
    },
    {
      key: 'caseload',
      header: sortHeader('caseload', 'Caseload'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSortForColumn('caseload', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700 }}>{row.caseload}</span>
      ),
    },
    {
      key: 'atRisk',
      header: sortHeader('atRisk', 'At-risk'),
      align: 'right',
      minWidth: 80,
      ariaSort: ariaSortForColumn('atRisk', sortKey, sortDirection),
      render: (row) => (
        <span
          style={{
            ...numStyle,
            fontWeight: 700,
            color: row.atRisk > 0 ? 'var(--wa-accent)' : 'var(--wa-muted)',
          }}
        >
          {row.atRisk}
        </span>
      ),
    },
    {
      key: 'placements',
      header: sortHeader('placements', 'Placements'),
      align: 'right',
      minWidth: 96,
      ariaSort: ariaSortForColumn('placements', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-success)', fontWeight: 700 }}>
          {row.placements}
        </span>
      ),
    },
    {
      key: 'avgResponse',
      header: sortHeader('avgResponse', 'Avg response'),
      align: 'right',
      minWidth: 108,
      ariaSort: ariaSortForColumn('avgResponse', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, color: 'var(--wa-muted)', whiteSpace: 'nowrap' }}>
          {row.avgResponse}
        </span>
      ),
    },
    {
      key: 'load',
      header: sortHeader('load', 'Load'),
      minWidth: 96,
      ariaSort: ariaSortForColumn('load', sortKey, sortDirection),
      render: (row) => (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.load} size="sm" color={LOAD_TOKEN_COLOR[row.load]} />
        </span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Counselors"
        kicker="People"
        lede="Staff caseload & performance"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      <form action="/admin/counselors" method="get" className="wa-flex wa-flex-wrap wa-items-end wa-gap-2 wa-mb-5">
        <TextInput label="Search counselors" htmlName="search" value={query} onChange={setQuery} placeholder="Name, partner, or title" hasClear />
        <Button type="submit" label="Search" variant="secondary" />
      </form>
      <p className="wa-mb-3">{matchingTotal} matching counselors. Column sorting applies to this page.</p>

      <DataTable<CounselorRow>
        columns={columns}
        rows={sortedCounselors}
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
                <CounselorCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.load} size="sm" color={LOAD_TOKEN_COLOR[row.load]} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
                color: 'var(--wa-muted)',
                margin: '12px 0 0',
              }}
            >
              <span style={numStyle}>
                Caseload <b style={{ color: 'var(--wa-text)' }}>{row.caseload}</b>
              </span>
              <span style={numStyle}>
                At-risk{' '}
                <b style={{ color: row.atRisk > 0 ? 'var(--wa-accent)' : 'var(--wa-text)' }}>
                  {row.atRisk}
                </b>
              </span>
              <span style={numStyle}>
                Placed <b style={{ color: 'var(--wa-success)' }}>{row.placements}</b>
              </span>
              <span style={numStyle}>Resp {row.avgResponse}</span>
            </div>
          </Card>
        )}
        emptyTitle={searchQuery ? 'No matching counselors' : 'No counselors yet'}
        emptyDescription={searchQuery ? 'Try a different name, partner, or title.' : 'Add a counselor to start tracking caseload and performance.'}
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        Showing {counselors.length ? (currentPage - 1) * pageSize + 1 : 0}–{(currentPage - 1) * pageSize + counselors.length} of {matchingTotal}
      </p>
      <nav aria-label="Counselor pagination" className="wa-flex wa-flex-wrap wa-gap-2">
        {currentPage > 1 && <Link className="wa-kit-cta wa-kit-cta--ghost" href={pageHref(currentPage - 1)}>Previous page</Link>}
        {currentPage * pageSize < matchingTotal && <Link className="wa-kit-cta wa-kit-cta--ghost" href={pageHref(currentPage + 1)}>Next page</Link>}
      </nav>
    </DesignSurface>
  );
}
