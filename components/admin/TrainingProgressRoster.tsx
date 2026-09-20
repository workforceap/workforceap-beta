'use client';

import { useMemo, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { FormField } from '@/components/portal/kit';
import {
  TrainingProgressKit,
  type TrainingRow,
} from '@/components/portal/kit/pages/admin-subviews/TrainingProgressKit';
import {
  DEFAULT_ROSTER_FILTERS,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  LINK_FILTERS,
  PACE_FILTERS,
  SORT_KEYS,
  filterTrainingRows,
  isLinkFilter,
  isPaceFilter,
  isSortKey,
  rosterProgramOptions,
  sortTrainingRows,
  summarizeTrainingRows,
  type LinkFilter,
  type PaceFilter,
  type RosterFilters,
  type SortDirection,
  type SortKey,
} from '@/lib/admin/trainingProgressRoster';

/**
 * Interactive wrapper around `TrainingProgressKit`.
 *
 * The page stays a server component and hands over the whole roster; filtering
 * and sorting happen here so an admin can answer "who is stalled in IT Support,
 * worst first" without a round trip. The KPI strip recomputes from the visible
 * rows, because a filtered table above unfiltered totals invites reading the
 * totals as the filter's result.
 *
 * Sorting is available from the toolbar selects and from clickable column
 * headers on desktop; mobile keeps cards without headers, so the toolbar
 * remains the primary sort control on narrow viewports.
 */

const SORT_LABELS: Record<SortKey, string> = {
  student: 'Student name',
  program: 'Program',
  modules: 'Modules completed',
  percentComplete: '% complete',
  courseraGrade: 'Coursera grade',
  pace: 'Pace',
  lastActive: 'Last active',
};

const LINK_LABELS: Record<LinkFilter, string> = {
  all: 'Everyone',
  linked: 'WAP members',
  unmatched: 'Unmatched Coursera',
  'no-program': 'Members with no program',
};

const PACE_LABELS: Record<PaceFilter, string> = {
  all: 'Any pace',
  Ahead: 'Ahead',
  'On track': 'On track',
  Behind: 'Behind',
  Stalled: 'Stalled',
};

const SELECT_STYLE = {
  marginTop: 4,
  width: '100%',
  minHeight: 44,
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
} as const;

export interface TrainingProgressRosterProps {
  rows: TrainingRow[];
  /** Cap disclosure from the loader, shown under the table. */
  showingLabel?: string;
  /**
   * What population the roster covers. The page title says "all members" but
   * only learners with a program or Coursera activity produce a row, so the
   * gap is stated rather than left for someone to infer from the KPI totals.
   */
  coverageLabel?: string;
}

export default function TrainingProgressRoster({
  rows,
  showingLabel,
  coverageLabel,
}: TrainingProgressRosterProps) {
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_ROSTER_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);

  const programOptions = useMemo(() => rosterProgramOptions(rows), [rows]);

  const visibleRows = useMemo(
    () => sortTrainingRows(filterTrainingRows(rows, filters), sortKey, sortDirection),
    [rows, filters, sortKey, sortDirection],
  );

  const summary = useMemo(() => summarizeTrainingRows(visibleRows), [visibleRows]);

  const isFiltered =
    filters.search.trim() !== '' ||
    filters.pace !== 'all' ||
    filters.program !== 'all' ||
    filters.link !== 'all';

  function update<K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function onSortColumn(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Match toolbar defaults: text columns A→Z, metrics high→low.
    if (key === 'student' || key === 'program') {
      setSortDirection('asc');
      return;
    }
    setSortDirection('desc');
  }

  const toolbar = (
    <div data-testid="training-roster-toolbar">
      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-3">
        <FormField
          label="Search learners"
          type="search"
          placeholder="Name or program"
          value={filters.search}
          onChange={(event) => update('search', event.target.value)}
        />

        <FormField label="Pace">
          <select
            value={filters.pace}
            onChange={(event) => {
              const next = event.target.value;
              if (isPaceFilter(next)) update('pace', next);
            }}
            style={SELECT_STYLE}
          >
            {PACE_FILTERS.map((pace) => (
              <option key={pace} value={pace}>
                {PACE_LABELS[pace]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Program">
          <select
            value={filters.program}
            onChange={(event) => update('program', event.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All programs</option>
            {programOptions.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Roster">
          <select
            value={filters.link}
            onChange={(event) => {
              const next = event.target.value;
              if (isLinkFilter(next)) update('link', next);
            }}
            style={SELECT_STYLE}
          >
            {LINK_FILTERS.map((link) => (
              <option key={link} value={link}>
                {LINK_LABELS[link]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Sort by">
          <select
            value={sortKey}
            onChange={(event) => {
              const next = event.target.value;
              if (isSortKey(next)) setSortKey(next);
            }}
            style={SELECT_STYLE}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Order">
          <select
            value={sortDirection}
            onChange={(event) =>
              setSortDirection(event.target.value === 'asc' ? 'asc' : 'desc')
            }
            style={SELECT_STYLE}
          >
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </FormField>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 12,
        }}
      >
        <p
          aria-live="polite"
          data-testid="training-roster-count"
          style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}
        >
          {isFiltered
            ? `Showing ${visibleRows.length} of ${rows.length} learner${rows.length === 1 ? '' : 's'} · KPIs reflect this filter`
            : `Showing all ${rows.length} learner${rows.length === 1 ? '' : 's'}`}
        </p>
        {isFiltered ? (
          <Button
            label="Clear filters"
            variant="secondary"
            size="sm"
            onClick={() => setFilters(DEFAULT_ROSTER_FILTERS)}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <TrainingProgressKit
      rows={visibleRows}
      onTrack={summary.onTrack}
      behind={summary.behind}
      stalled={summary.stalled}
      avgPercent={summary.avgPercent}
      toolbar={toolbar}
      showingLabel={[coverageLabel, showingLabel].filter(Boolean).join(' · ') || undefined}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortColumn={onSortColumn}
    />
  );
}
