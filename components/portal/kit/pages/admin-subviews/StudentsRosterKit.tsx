'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  Avatar,
  colorVar,
  type Column,
  type KitColor,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import {
  DEFAULT_STUDENT_SORT_DIRECTION,
  DEFAULT_STUDENT_SORT_KEY,
  sortStudentRows,
  type StudentSortKey,
} from '@/lib/admin/studentsRosterSort';

/**
 * Students roster — the consolidated members workspace with saved-view filter
 * chips (dense). Mockup: workforceap-admin-suite.html "Students" view.
 * Target route: /admin/students
 *
 * Interactive (filter chips toggle the visible rows) → needs 'use client'.
 * Uses DataTable mobile="cards" so the wide roster stacks cleanly on mobile
 * (the mockup calls out "wide table → stacked cards on mobile, no squish").
 * Names always include the full account email to distinguish same-name accounts
 * in both table rows and mobile cards; email text wraps instead of truncating.
 * Last-active captions expose the learner-action source in their accessible
 * label and tooltip; import and database-update timestamps are not activity.
 * Unavailable program progress is a dash, not an observed zero percent.
 */
export type StudentStatus = 'Job-Ready' | 'At Risk' | 'In Training' | 'Interviewing' | 'Placed';

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  initials?: string;
  location: string;
  program: string;
  /** 0–100 course progress. */
  progress: number;
  /** False when no assigned-program denominator or progress read is available. */
  progressKnown?: boolean;
  /** Readiness score, 0–100. */
  readiness: number;
  counselor: string;
  status: StudentStatus;
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
export type StudentFilter = 'All' | 'Job-Ready' | 'At Risk' | 'In Training' | 'Unmatched';

export interface StudentsRosterKitProps {
  students?: StudentRow[];
  /** Total roster size for the "Showing N of TOTAL" footer + All chip count. */
  total?: number;
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

const FILTERS: StudentFilter[] = ['All', 'Job-Ready', 'At Risk', 'In Training', 'Unmatched'];

/** Maps the kit's semantic tone vocabulary to a real Token color. */
const STATUS_TOKEN_COLOR: Record<StudentStatus, TokenColor> = {
  'Job-Ready': 'orange',
  Placed: 'green',
  'At Risk': 'pink',
  Interviewing: 'blue',
  'In Training': 'gray',
};

function matchesFilter(student: StudentRow, filter: StudentFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Unmatched') return student.inWap === false;
  if (student.inWap === false) return false;
  return student.status === filter;
}

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

export function StudentsRosterKit({
  students = DEFAULT_STUDENTS,
  total = 847,
}: StudentsRosterKitProps) {
  const router = useRouter();
  const [active, setActive] = useState<StudentFilter>('All');
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<StudentSortKey>(
    DEFAULT_STUDENT_SORT_KEY,
    DEFAULT_STUDENT_SORT_DIRECTION,
    ['name', 'program', 'counselor'],
  );

  const counts: Record<StudentFilter, number> = {
    All: total,
    'Job-Ready': students.filter((s) => matchesFilter(s, 'Job-Ready')).length,
    'At Risk': students.filter((s) => s.status === 'At Risk' && s.inWap !== false).length,
    'In Training': students.filter((s) => s.status === 'In Training' && s.inWap !== false).length,
    Unmatched: students.filter((s) => s.inWap === false).length,
  };

  const visible = useMemo(
    () =>
      sortStudentRows(
        students.filter((s) => matchesFilter(s, active)),
        sortKey,
        sortDirection,
      ),
    [students, active, sortKey, sortDirection],
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

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: sortHeader('name', 'Student'),
      stickyLeft: true,
      minWidth: 220,
      ariaSort: ariaSortForColumn('name', sortKey, sortDirection),
      render: (row) => <StudentCell row={row} />,
    },
    {
      key: 'program',
      header: sortHeader('program', 'Program'),
      minWidth: 160,
      ariaSort: ariaSortForColumn('program', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.program}</span>,
    },
    {
      key: 'progress',
      header: sortHeader('progress', 'Progress'),
      minWidth: 120,
      ariaSort: ariaSortForColumn('progress', sortKey, sortDirection),
      render: (row) => <ProgressCell row={row} />,
    },
    {
      key: 'courseraGrade',
      header: sortHeader('courseraGrade', 'Coursera grade'),
      align: 'right',
      minWidth: 112,
      ariaSort: ariaSortForColumn('courseraGrade', sortKey, sortDirection),
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {formatRosterGrade(row.courseraGrade)}
        </span>
      ),
    },
    {
      key: 'readiness',
      header: sortHeader('readiness', 'Readiness'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSortForColumn('readiness', sortKey, sortDirection),
      render: (row) => (
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
      ariaSort: ariaSortForColumn('counselor', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.counselor}</span>,
    },
    {
      key: 'status',
      header: sortHeader('status', 'Status'),
      minWidth: 108,
      ariaSort: ariaSortForColumn('status', sortKey, sortDirection),
      render: (row) => (
        <span style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
          <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
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
          title={row.lastActiveSource}
          aria-label={row.lastActiveSource ? `${row.lastActive} · ${row.lastActiveSource}` : undefined}
          style={{
            color: row.status === 'At Risk' ? 'var(--wa-accent)' : 'var(--wa-muted)',
            fontWeight: row.status === 'At Risk' ? 700 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {row.lastActive}
        </span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader title="Students" kicker="People" goal="Find and act on any student." />

      {/* Saved-view filter chips */}
      <div className="wa-mb-5">
        <SegmentedControl
          value={active}
          onChange={(v) => setActive(v as StudentFilter)}
          label="Roster filters"
          size="sm"
          layout="hug"
        >
          {FILTERS.map((f) => (
            <SegmentedControlItem key={f} value={f} label={`${f} · ${counts[f]}`} />
          ))}
        </SegmentedControl>
      </div>

      <DataTable<StudentRow>
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(row.href ?? `/admin/members/${row.id}`)}
        minWidth={1040}
        mobile="cards"
        cardRender={(row) => (
          <Card padding={3}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <StudentCell row={row} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <Token label={row.status} size="sm" color={STATUS_TOKEN_COLOR[row.status]} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--wa-muted)', margin: '12px 0 4px' }}>
              <span style={{ minWidth: 0 }}>{row.program} · {row.counselor}</span>
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
            </div>
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
        emptyTitle="No students match this view"
        emptyDescription="Try a different filter."
      />

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wa-muted)', marginTop: 16 }}>
        Showing {visible.length} of {total}
      </p>
    </DesignSurface>
  );
}
