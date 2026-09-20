'use client';

import { useMemo, useState } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  Avatar,
  FormField,
  KpiStrip,
  colorVar,
  type Column,
  type KitColor,
  type KpiItem,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import {
  DEFAULT_STUDENT_SORT_DIRECTION,
  DEFAULT_STUDENT_SORT_KEY,
  sortStudentRows,
  type StudentSortKey,
} from '@/lib/admin/studentsRosterSort';
import {
  DEFAULT_SORT_DIRECTION as DEFAULT_TRAINING_SORT_DIRECTION,
  DEFAULT_SORT_KEY as DEFAULT_TRAINING_SORT_KEY,
  sortTrainingRows,
  summarizeTrainingRows,
  type SortKey as TrainingSortKey,
} from '@/lib/admin/trainingProgressRoster';
import type { TrainingPace } from '@/lib/admin/trainingProgressPrograms';
import {
  MEMBERS_MANAGEMENT_HREF,
  STUDENTS_ROSTER_VIEW_COPY,
  STUDENTS_ROSTER_VIEW_HREFS,
  TRAINING_PROGRESS_LEGACY_HREF,
  chipsForView,
  matchesRosterChip,
  matchesRosterSearch,
  toTrainingRosterRow,
  type StudentsRosterChip,
  type StudentsRosterView,
} from '@/lib/admin/studentsRosterView';

/**
 * Students roster — the one admin roster, rendered with a view preset
 * (dense). Mockups: workforceap-admin-suite.html "Students" view and
 * workforceap-admin-full.html "training-progress" view.
 *
 *   view="roster"   → /admin/students (default)
 *   view="training" → /admin/students?view=training and /admin/training-progress
 *
 * Interactive (search, filter chips and sortable headers) → needs 'use client'.
 * Uses DataTable mobile="cards" so the wide roster stacks cleanly on mobile
 * (the mockup calls out "wide table → stacked cards on mobile, no squish").
 * Names always include the full account email to distinguish same-name accounts
 * in both table rows and mobile cards; email text wraps instead of truncating.
 * Last-active captions expose the learner-action source in their accessible
 * label and tooltip; import and database-update timestamps are not activity.
 * Unavailable program progress is a dash, not an observed zero percent.
 */
export type StudentStatus = 'Job-Ready' | 'At Risk' | 'In Training' | 'Interviewing' | 'Placed';

export interface StudentTrainingFacts {
  /** Canonical modules completed in the program. */
  modulesDone: number;
  /** Total canonical modules in the program. */
  modulesTotal: number;
  /** Pace classification derived from progress + recent activity. */
  pace: TrainingPace;
}

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  initials?: string;
  /** City/state; roster view only. */
  location?: string;
  program: string;
  /** 0–100 course progress. */
  progress: number;
  /** False when no assigned-program denominator or progress read is available. */
  progressKnown?: boolean;
  /** Readiness score, 0–100; roster view only. */
  readiness?: number;
  /** Active counselor display name; roster view only. */
  counselor?: string;
  /** Roster status; roster view only. */
  status?: StudentStatus;
  /** Module counts + pace; training view only. */
  training?: StudentTrainingFacts;
  /** Last-active caption, e.g. "2h ago". */
  lastActive: string;
  /** Sortable last-activity instant (epoch ms). Caption alone is not ordered. */
  lastActiveAt?: number | null;
  /** Source of the displayed learner activity, also exposed on mobile. */
  lastActiveSource?: string;
  /** Latest Coursera course grade 0–100; null when unknown. */
  courseraGrade?: number | null;
  /** False when the row is a Coursera identity with no WAP member. */
  inWap?: boolean;
  /** Linked member with Coursera progress but no assigned WAP program. */
  noProgram?: boolean;
  /** Override the default `/admin/members/:id` row click. */
  href?: string;
}

/** Filter chips. "All" is special-cased to show everything. */
export type StudentFilter = StudentsRosterChip;

export interface StudentsRosterKitProps {
  /** Column preset. Defaults to the Students roster. */
  view?: StudentsRosterView;
  /** Where each preset lives from this mount; defaults to the /admin/students URLs. */
  viewHrefs?: Partial<Record<StudentsRosterView, string>>;
  /** Shown under the header when a secondary roster source (activity, Coursera evidence) failed soft. */
  notice?: string;
  students?: StudentRow[];
  /** Total roster size for the "Showing N of TOTAL" footer + All chip count. */
  total?: number;
  /** Override the footer, e.g. with the loader's cap and coverage disclosure. */
  showingLabel?: string;
}

const DEFAULT_STUDENTS: StudentRow[] = [
  {
    id: 'mb',
    name: 'Mike Brown',
    email: 'mike.brown@example.test',
    initials: 'MB',
    location: 'Austin, TX',
    program: 'Cloud & IT',
    progress: 78,
    readiness: 84,
    counselor: 'S. Chen',
    status: 'Job-Ready',
    lastActive: '2h ago',
  },
  {
    id: 'jd',
    name: 'Jasmine Davis',
    email: 'jasmine.davis@example.test',
    initials: 'JD',
    location: 'Austin, TX',
    program: 'Healthcare',
    progress: 92,
    readiness: 91,
    counselor: 'R. Patel',
    status: 'Placed',
    lastActive: '1d ago',
  },
  {
    id: 'ct',
    name: 'Carlos Torres',
    email: 'carlos.torres@example.test',
    initials: 'CT',
    location: 'Round Rock, TX',
    program: 'Skilled Trades',
    progress: 34,
    readiness: 41,
    counselor: 'S. Chen',
    status: 'At Risk',
    lastActive: '16d ago',
  },
  {
    id: 'aw',
    name: 'Aisha Williams',
    email: 'aisha.williams@example.test',
    initials: 'AW',
    location: 'Austin, TX',
    program: 'Data & AI',
    progress: 88,
    readiness: 79,
    counselor: 'R. Patel',
    status: 'Interviewing',
    lastActive: '5h ago',
  },
];

/** Maps the kit's semantic tone vocabulary to a real Token color. */
const STATUS_TOKEN_COLOR: Record<StudentStatus, TokenColor> = {
  'Job-Ready': 'orange',
  Placed: 'green',
  'At Risk': 'pink',
  Interviewing: 'blue',
  'In Training': 'gray',
};

const PACE_TOKEN_COLOR: Record<TrainingPace, TokenColor> = {
  'On track': 'green',
  Ahead: 'green',
  Stalled: 'pink',
  Behind: 'yellow',
};

const TEXT_SORT_KEYS: readonly (StudentSortKey | TrainingSortKey)[] = ['name', 'program', 'counselor', 'student'];

function formatRosterGrade(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const rounded = Math.round(pct * 100) / 100;
  return `${String(rounded)}%`;
}

function readinessColor(score: number): KitColor {
  if (score >= 70) return 'success';
  if (score >= 50) return 'gold';
  return 'accent';
}

/** Readiness score as a CSS var string (success ≥70, gold ≥50, else crimson). */
function readinessVar(score: number): string {
  return colorVar(readinessColor(score));
}

function NavButton({ href, label }: { href: string; label: string }) {
  return (
    <AstryxLink href={href} as={NextLink as never} isStandalone>
      <Button label={label} variant="secondary" size="sm" />
    </AstryxLink>
  );
}

export function StudentsRosterKit({
  view = 'roster',
  viewHrefs,
  notice,
  students = DEFAULT_STUDENTS,
  total = 847,
  showingLabel,
}: StudentsRosterKitProps) {
  const router = useRouter();
  const copy = STUDENTS_ROSTER_VIEW_COPY[view];
  const chips = chipsForView(view);
  const hrefs = { ...STUDENTS_ROSTER_VIEW_HREFS, ...viewHrefs };
  const isTraining = view === 'training';

  const [active, setActive] = useState<StudentFilter>('All');
  const [search, setSearch] = useState('');
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<StudentSortKey | TrainingSortKey>(
    isTraining ? DEFAULT_TRAINING_SORT_KEY : DEFAULT_STUDENT_SORT_KEY,
    isTraining ? DEFAULT_TRAINING_SORT_DIRECTION : DEFAULT_STUDENT_SORT_DIRECTION,
    TEXT_SORT_KEYS,
  );

  const counts = Object.fromEntries(
    chips.map((chip) => [
      chip,
      chip === 'All' ? total : students.filter((s) => matchesRosterChip(s, chip, view)).length,
    ]),
  ) as Record<StudentFilter, number>;

  const visible = useMemo(() => {
    const kept = students.filter(
      (s) => matchesRosterChip(s, active, view) && matchesRosterSearch(s, search),
    );
    if (!isTraining) return sortStudentRows(kept, sortKey as StudentSortKey, sortDirection);
    // The training preset reuses the tested pace ordering and module
    // tie-break from the training-roster helpers via a row projection.
    const byId = new Map(kept.map((row) => [row.id, row]));
    return sortTrainingRows(kept.map(toTrainingRosterRow), sortKey as TrainingSortKey, sortDirection)
      .map((row) => byId.get(row.id))
      .filter((row): row is StudentRow => row != null);
  }, [students, active, search, view, isTraining, sortKey, sortDirection]);

  const summary = useMemo(
    () => (isTraining ? summarizeTrainingRows(visible.map(toTrainingRosterRow)) : null),
    [isTraining, visible],
  );

  const StudentCell = ({ row }: { row: StudentRow }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Avatar initials={row.initials ?? row.name.slice(0, 2).toUpperCase()} size={32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={row.name}
        >
          {row.name}
        </div>
        {row.inWap === false || row.noProgram ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {row.inWap === false ? <Token label="Unmatched" size="sm" color="pink" /> : null}
            {row.inWap !== false && row.noProgram ? (
              <Token label="No program" size="sm" color="yellow" />
            ) : null}
          </div>
        ) : null}
        <p style={{ margin: '4px 0 0', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
          {row.email}
        </p>
        {row.location ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--wa-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.location}
          </div>
        ) : null}
      </div>
    </div>
  );

  const ProgressCell = ({ row }: { row: StudentRow }) => row.progressKnown === false
    ? <span title="Program progress unavailable">—</span>
    : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 72 }}>
        <ProgressBar
          value={row.progress}
          label={`${row.name} progress`}
          isLabelHidden
          variant={row.status === 'At Risk' ? 'accent' : 'success'}
        />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--wa-muted)' }}>
        {row.progress}%
      </span>
    </div>
  );

  /** Program title; the training view marks a program inferred from activity rather than assigned. */
  const programLabel = (row: StudentRow) =>
    `${row.program}${isTraining && row.inWap !== false && row.noProgram ? ' (inferred)' : ''}`;

  const LastActiveCell = ({ row }: { row: StudentRow }) => (
    <span
      title={row.lastActiveSource}
      aria-label={row.lastActiveSource ? `${row.lastActive} · ${row.lastActiveSource}` : undefined}
      style={{
        color: row.status === 'At Risk' ? 'var(--wa-accent)' : 'var(--wa-muted)',
        fontWeight: row.status === 'At Risk' ? 700 : 400,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {row.lastActive}
    </span>
  );

  const ariaSort = (key: StudentSortKey | TrainingSortKey) => ariaSortForColumn(key, sortKey, sortDirection);

  const nameColumn: Column<StudentRow> = {
    key: 'name',
    header: sortHeader(isTraining ? 'student' : 'name', 'Student'),
    stickyLeft: true,
    minWidth: 220,
    ariaSort: ariaSort(isTraining ? 'student' : 'name'),
    render: (row) => <StudentCell row={row} />,
  };
  const programColumn: Column<StudentRow> = {
    key: 'program',
    header: sortHeader('program', 'Program'),
    minWidth: isTraining ? 200 : 160,
    ariaSort: ariaSort('program'),
    render: (row) => <span style={{ color: 'var(--wa-muted)' }} title={row.program}>{programLabel(row)}</span>,
  };
  const gradeColumn: Column<StudentRow> = {
    key: 'courseraGrade',
    header: sortHeader('courseraGrade', 'Coursera grade'),
    align: 'right',
    minWidth: 112,
    ariaSort: ariaSort('courseraGrade'),
    render: (row) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {formatRosterGrade(row.courseraGrade)}
      </span>
    ),
  };
  const lastActiveColumn: Column<StudentRow> = {
    key: 'lastActive',
    header: sortHeader('lastActive', 'Last active'),
    align: 'right',
    minWidth: 96,
    ariaSort: ariaSort('lastActive'),
    render: (row) => <LastActiveCell row={row} />,
  };

  const rosterColumns: Column<StudentRow>[] = [
    nameColumn,
    programColumn,
    {
      key: 'progress',
      header: sortHeader('progress', 'Progress'),
      minWidth: 120,
      ariaSort: ariaSort('progress'),
      render: (row) => <ProgressCell row={row} />,
    },
    gradeColumn,
    {
      key: 'readiness',
      header: sortHeader('readiness', 'Readiness'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSort('readiness'),
      render: (row) => row.readiness == null ? <span>—</span> : (
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            color: readinessVar(row.readiness),
            whiteSpace: 'nowrap',
          }}
        >
          {row.readiness}
        </span>
      ),
    },
    {
      key: 'counselor',
      header: sortHeader('counselor', 'Counselor'),
      minWidth: 120,
      ariaSort: ariaSort('counselor'),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.counselor ?? 'Unassigned'}</span>,
    },
    {
      key: 'status',
      header: sortHeader('status', 'Status'),
      minWidth: 108,
      ariaSort: ariaSort('status'),
      render: (row) => row.status ? (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
        </span>
      ) : <span>—</span>,
    },
    lastActiveColumn,
  ];

  const trainingColumns: Column<StudentRow>[] = [
    nameColumn,
    programColumn,
    {
      key: 'modules',
      header: sortHeader('modules', 'Modules'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSort('modules'),
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {row.training ? `${row.training.modulesDone} / ${row.training.modulesTotal}` : '—'}
        </span>
      ),
    },
    {
      key: 'percentComplete',
      header: sortHeader('percentComplete', '% Complete'),
      minWidth: 120,
      ariaSort: ariaSort('percentComplete'),
      render: (row) => <ProgressCell row={row} />,
    },
    gradeColumn,
    {
      key: 'pace',
      header: sortHeader('pace', 'Pace'),
      minWidth: 108,
      ariaSort: ariaSort('pace'),
      render: (row) => row.training ? (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.training.pace} size="sm" color={PACE_TOKEN_COLOR[row.training.pace]} />
        </span>
      ) : <span>—</span>,
    },
    lastActiveColumn,
  ];

  const kpis: KpiItem[] | null = summary
    ? [
        { label: 'On Track', value: summary.onTrack, tone: 'success' },
        { label: 'Behind', value: summary.behind, tone: 'gold' },
        { label: 'Stalled', value: summary.stalled, tone: 'accent' },
        { label: 'Avg %', value: `${summary.avgPercent}%`, tone: 'info' },
      ]
    : null;

  const rowBadge = (row: StudentRow) =>
    isTraining
      ? row.training
        ? <Token label={row.training.pace} size="sm" color={PACE_TOKEN_COLOR[row.training.pace]} />
        : null
      : row.status
        ? <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
        : null;

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener
        className="wa-mb-5"
        title={copy.title}
        kicker={copy.kicker}
        lede={copy.lede}
        action={
          <nav aria-label="Roster views" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isTraining ? (
              <>
                <NavButton href={hrefs.roster} label="Roster" />
                <NavButton href={TRAINING_PROGRESS_LEGACY_HREF} label="Detailed view" />
              </>
            ) : (
              <>
                <NavButton href={hrefs.training} label="Training progress" />
                <NavButton href={MEMBERS_MANAGEMENT_HREF} label="Management hub" />
              </>
            )}
          </nav>
        }
      />

      {notice ? (
        <p role="status" className="wa-kit-training-notice" data-testid="students-roster-notice">
          {notice}
        </p>
      ) : null}

      {kpis ? (
        <div className="wa-mb-5" data-testid="students-roster-kpis">
          <KpiStrip items={kpis} />
        </div>
      ) : null}

      {/* Search + saved-view filter chips */}
      <div className="wa-mb-5 wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-3" style={{ alignItems: 'end' }}>
        <FormField
          label={copy.searchLabel}
          type="search"
          placeholder="Name, email or program"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="lg:wa-col-span-2">
          <SegmentedControl
            value={active}
            onChange={(v) => setActive(v as StudentFilter)}
            label="Roster filters"
            size="sm"
            layout="hug"
          >
            {chips.map((f) => (
              <SegmentedControlItem key={f} value={f} label={`${f} · ${counts[f]}`} />
            ))}
          </SegmentedControl>
        </div>
      </div>

      <DataTable<StudentRow>
        columns={isTraining ? trainingColumns : rosterColumns}
        rows={visible}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(row.href ?? `/admin/members/${row.id}`)}
        minWidth={isTraining ? 1080 : 1040}
        mobile="cards"
        cardRender={(row) => (
          <Card padding={3}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <StudentCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>{rowBadge(row)}</div>
            </div>
            {isTraining ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--wa-muted)', margin: '12px 0 4px' }}>
                <span style={{ minWidth: 0 }}>{programLabel(row)}</span>
                <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  Modules{' '}
                  <b style={{ color: 'var(--wa-text)' }}>
                    {row.training ? `${row.training.modulesDone} / ${row.training.modulesTotal}` : '—'}
                  </b>
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--wa-muted)', margin: '12px 0 4px' }}>
                <span style={{ minWidth: 0 }}>{row.program} · {row.counselor ?? 'Unassigned'}</span>
                {row.readiness != null ? (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    Readiness{' '}
                    <b
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: readinessVar(row.readiness),
                      }}
                    >
                      {row.readiness}
                    </b>
                  </span>
                ) : null}
              </div>
            )}
            {row.progressKnown !== false && <ProgressBar
              value={row.progress}
              label={`${row.name} progress`}
              isLabelHidden
              variant={row.status === 'At Risk' ? 'accent' : 'success'}
            />}
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 6 }}>
              {row.progressKnown === false ? 'Program progress unavailable' : `${row.progress}% complete`} · Coursera grade {formatRosterGrade(row.courseraGrade)} · last active{' '}
              <span title={row.lastActiveSource} aria-label={row.lastActiveSource ? `${row.lastActive} · ${row.lastActiveSource}` : undefined}>
                {row.lastActive}
              </span>
            </div>
          </Card>
        )}
        emptyTitle={copy.emptyTitle}
        emptyDescription={copy.emptyDescription}
      />

      <p
        data-testid="students-roster-footer"
        style={{ textAlign: 'center', fontSize: 13, color: 'var(--wa-muted)', marginTop: 16 }}
      >
        {showingLabel ?? `Showing ${visible.length} of ${total}`}
      </p>
    </DesignSurface>
  );
}
