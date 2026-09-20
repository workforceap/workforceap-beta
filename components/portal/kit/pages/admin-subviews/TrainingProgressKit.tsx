'use client';

import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  SectionHeader,
  KpiStrip,
  DataTable,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';
import { KitSortHeader } from '@/components/portal/kit/KitSortHeader';
import { ariaSortForColumn } from '@/components/portal/kit/kitTableSort';
import type { SortDirection, SortKey } from '@/lib/admin/trainingProgressRoster';

/**
 * Training progress — live B4B + LMS progress across all members (dense).
 * Mockup: workforceap-admin-full.html "training-progress" view.
 * Target route: /admin/training-progress
 *
 * Desktop: wide roster table with sticky Student column, horizontal scroll, and
 * clickable sort headers (Student, Program, Modules, % Complete, Coursera
 * grade, Pace, Last active). Mobile: stacked cards (headers not on screen).
 * Last active uses existing login / LMS / progress timestamps — never a new table.
 */

/** Pace classification derived from progress + recent activity. */
export type Pace = 'On track' | 'Ahead' | 'Behind' | 'Stalled';

export interface TrainingRow {
  id: string;
  /** Learner full name. */
  student: string;
  /** Program title (e.g. "AWS Practitioner"). */
  program: string;
  /** Canonical modules completed in the program. */
  modulesDone: number;
  /** Total canonical modules in the program. */
  modulesTotal: number;
  /** Overall percent complete across the program's modules (0–100, rounded). */
  percentComplete: number;
  /** Pace classification. */
  pace: Pace;
  /** Latest Coursera course grade 0–100; null when unknown. */
  courseraGrade?: number | null;
  /** False when the row is a Coursera identity with no WAP member. */
  inWap?: boolean;
  /** Linked WAP member has Coursera progress but no assigned program. */
  noProgram?: boolean;
  /** Last-active caption, e.g. "2h ago". */
  lastActive?: string;
  /** Sortable last-activity instant (epoch ms). Caption alone is not ordered. */
  lastActiveAt?: number | null;
}

export interface TrainingProgressKitProps {
  rows: TrainingRow[];
  /** Learners classified On track (or Ahead). */
  onTrack: number;
  /** Learners classified Behind. */
  behind: number;
  /** Learners classified Stalled. */
  stalled: number;
  /** Average percent complete across all rows (0–100, rounded). */
  avgPercent: number;
  /** Override the footer when the loader capped the learner scan. */
  showingLabel?: string;
  /**
   * Optional controls rendered between the KPI strip and the table. The page
   * stays a server component; `TrainingProgressRoster` passes its filter and
   * sort controls through here.
   */
  toolbar?: ReactNode;
  /** Active sort column — drives header `aria-sort` and row order upstream. */
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortColumn: (key: SortKey) => void;
}

const PACE_TOKEN_COLOR: Record<Pace, TokenColor> = {
  'On track': 'green',
  Ahead: 'green',
  Stalled: 'pink',
  Behind: 'yellow',
};

const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'student', label: 'Student' },
  { key: 'program', label: 'Program' },
  { key: 'modules', label: 'Modules' },
  { key: 'percentComplete', label: '% Complete' },
  { key: 'courseraGrade', label: 'Coursera grade' },
  { key: 'pace', label: 'Pace' },
  { key: 'lastActive', label: 'Last active' },
];

export function TrainingProgressKit({
  rows,
  onTrack,
  behind,
  stalled,
  avgPercent,
  showingLabel,
  toolbar,
  sortKey,
  sortDirection,
  onSortColumn,
}: TrainingProgressKitProps) {
  const kpis: KpiItem[] = [
    { label: 'On Track', value: onTrack, color: 'success' },
    { label: 'Behind', value: behind, color: 'gold' },
    { label: 'Stalled', value: stalled, color: 'accent' },
    { label: 'Avg %', value: `${avgPercent}%`, color: 'info' },
  ];

  const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

  function sortHeader(key: SortKey, label: string) {
    return (
      <KitSortHeader
        label={label}
        columnKey={key}
        active={sortKey === key}
        direction={sortDirection}
        onSort={(columnKey) => onSortColumn(columnKey as SortKey)}
      />
    );
  }

  const columns: Column<TrainingRow>[] = [
    {
      key: 'student',
      header: sortHeader('student', 'Student'),
      stickyLeft: true,
      minWidth: 168,
      ariaSort: ariaSortForColumn('student', sortKey, sortDirection),
      render: (row) => (
        <div style={{ minWidth: 140 }}>
          <div
            style={{
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={row.student}
          >
            {row.student}
          </div>
          {row.inWap === false || row.noProgram ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                marginTop: 4,
              }}
            >
              {row.inWap === false ? <Token label="Unmatched" size="sm" color="pink" /> : null}
              {row.inWap !== false && row.noProgram ? (
                <Token label="No program" size="sm" color="yellow" />
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'program',
      header: sortHeader('program', 'Program'),
      minWidth: 200,
      ariaSort: ariaSortForColumn('program', sortKey, sortDirection),
      render: (row) => (
        <span
          style={{
            color: 'var(--wa-muted)',
            display: 'block',
            minWidth: 180,
          }}
          title={row.program}
        >
          {row.program}
          {row.inWap !== false && row.noProgram ? ' (inferred)' : ''}
        </span>
      ),
    },
    {
      key: 'modules',
      header: sortHeader('modules', 'Modules'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSortForColumn('modules', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, whiteSpace: 'nowrap' }}>
          {row.modulesDone} / {row.modulesTotal}
        </span>
      ),
    },
    {
      key: 'percentComplete',
      header: sortHeader('percentComplete', '% Complete'),
      align: 'right',
      minWidth: 96,
      ariaSort: ariaSortForColumn('percentComplete', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {row.percentComplete}%
        </span>
      ),
    },
    {
      key: 'courseraGrade',
      header: sortHeader('courseraGrade', 'Coursera grade'),
      align: 'right',
      minWidth: 112,
      ariaSort: ariaSortForColumn('courseraGrade', sortKey, sortDirection),
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {row.courseraGrade != null && Number.isFinite(row.courseraGrade)
            ? `${Math.round(row.courseraGrade * 100) / 100}%`
            : '—'}
        </span>
      ),
    },
    {
      key: 'pace',
      header: sortHeader('pace', 'Pace'),
      minWidth: 108,
      ariaSort: ariaSortForColumn('pace', sortKey, sortDirection),
      render: (row) => (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.pace} size="sm" color={PACE_TOKEN_COLOR[row.pace]} />
        </span>
      ),
    },
    {
      key: 'lastActive',
      header: sortHeader('lastActive', 'Last active'),
      align: 'right',
      minWidth: 96,
      ariaSort: ariaSortForColumn('lastActive', sortKey, sortDirection),
      render: (row) => (
        <span
          style={{
            color: 'var(--wa-muted)',
            fontSize: 'var(--wa-type-meta)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {row.lastActive ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Training progress"
        kicker="Programs"
        goal="Live B4B + LMS progress across all members"
        action={
          <AstryxLink href="/admin/training-progress?ui=legacy" as={NextLink as never} isStandalone>
            <Button label="Detailed view" variant="secondary" size="sm" />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {toolbar ? <div className="wa-mb-5">{toolbar}</div> : null}

      <DataTable<TrainingRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={1080}
        mobile="cards"
        cardRender={(row) => (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
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
                {row.inWap === false ? (
                  <div style={{ marginTop: 4 }}>
                    <Token label="Unmatched" size="sm" color="pink" />
                  </div>
                ) : row.noProgram ? (
                  <div style={{ marginTop: 4 }}>
                    <Token label="No program" size="sm" color="yellow" />
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 4,
                  }}
                >
                  {row.program}
                  {row.inWap !== false && row.noProgram ? ' (inferred)' : ''}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.pace} size="sm" color={PACE_TOKEN_COLOR[row.pace]} />
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
              <span style={numStyle}>
                Modules{' '}
                <b style={{ color: 'var(--wa-text)' }}>
                  {row.modulesDone} / {row.modulesTotal}
                </b>
              </span>
              <span style={numStyle}>
                Complete <b style={{ color: 'var(--wa-text)' }}>{row.percentComplete}%</b>
              </span>
              <span style={numStyle}>
                Grade{' '}
                <b style={{ color: 'var(--wa-text)' }}>
                  {row.courseraGrade != null && Number.isFinite(row.courseraGrade)
                    ? `${Math.round(row.courseraGrade * 100) / 100}%`
                    : '—'}
                </b>
              </span>
              <span>
                Last active{' '}
                <b style={{ color: 'var(--wa-text)' }}>{row.lastActive ?? '—'}</b>
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No training progress yet"
        emptyDescription="Members in a program and Coursera learners not yet in WAP show up here once activity exists."
      />

      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--wa-muted)',
          marginTop: 16,
        }}
      >
        {showingLabel ?? `Showing ${rows.length} learner${rows.length === 1 ? '' : 's'}`}
      </p>
    </DesignSurface>
  );
}

/** Column keys exposed for tests and toolbar labels. */
export const TRAINING_PROGRESS_SORT_COLUMNS = SORTABLE_COLUMNS;
