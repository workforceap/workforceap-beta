'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { type DataTableColumn } from '@/components/portal/ui/DataTable';
import StatusBadge from '@/components/portal/StatusBadge';

type ItemRow = {
  courseItemId: string;
  itemType: string | null;
  itemTypeLabel: string;
  latestVerb: string | null;
  latestScoreScaled: number | null;
  completed: boolean;
  lastSeenAt: string;
  statementCount: number;
};

type ItemFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: ItemRow[] };

export type CanonicalCatalog = Array<{
  programSlug: string;
  programTitle: string;
  courses: Array<{
    slug: string;
    name: string;
    courseraCourseId: string | null;
  }>;
}>;

export type CurriculumRow = {
  key: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  learnerRole: string;
  programSlug: string;
  programTitle: string;
  /**
   * Which CourseEnrollment row this curriculum block came from.
   * - 'primary'   = the user's primary enrollment (or legacy
   *                 `User.enrolledProgram` fallback for unmigrated users).
   * - 'secondary' = a non-primary CourseEnrollment row. Surfaced with a
   *                 `secondary` pill so admins can see at a glance which
   *                 curriculum block is the headline vs. an additional
   *                 program the learner is also enrolled in.
   */
  programRole: 'primary' | 'secondary';
  courseSlug: string;
  courseName: string;
  courseraCourseId: string | null;
  status: string;
  percentComplete: number;
  /** Coursera / xAPI grade 0–100; null when unknown. */
  gradePercent: number | null;
  lastActivityAt: string | null;
  lastUpdatedAt: string | null;
};

export type RawCourseraRow = {
  key: string;
  learnerId: string | null;
  learnerName: string | null;
  learnerEmail: string;
  learnerRole: string | null;
  identityMatched: boolean;
  courseraCourseId: string;
  courseraCourseSlug: string | null;
  courseName: string;
  university: string | null;
  courseraProgramSlug: string;
  courseraProgramName: string | null;
  mappedProgramSlug: string | null;
  mappedCourseSlug: string | null;
  mappingSource: 'db' | 'static' | null;
  suggestedProgramSlug: string | null;
  percentComplete: number;
  /** Coursera course grade 0–100, null when unknown. */
  gradePercent: number | null;
  learningHours: number;
  isCompleted: boolean;
  enrollmentTime: string | null;
  lastActivityTime: string | null;
  completionTime: string | null;
};

type View = 'curriculum' | 'raw';
type SortDir = 'asc' | 'desc';

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

function compare(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const STATUS_VARIANT: Record<string, 'success' | 'accent' | 'neutral'> = {
  COMPLETED: 'success',
  IN_PROGRESS: 'accent',
  NOT_STARTED: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'in progress',
  NOT_STARTED: 'not started',
};

function SortLabel({
  label,
  active,
  dir,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
}) {
  return (
    <span style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}
      {active && <span style={{ marginLeft: 4 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </span>
  );
}

function MapThisAction({
  row,
  catalog,
  onSaved,
}: {
  row: RawCourseraRow;
  catalog: CanonicalCatalog;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [programSlug, setProgramSlug] = useState(row.suggestedProgramSlug ?? catalog[0]?.programSlug ?? '');
  const [courseSlug, setCourseSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = catalog.find((p) => p.programSlug === programSlug);

  const onSubmit = async () => {
    if (!programSlug || !courseSlug) {
      setError('Pick a program and course.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/coursera/canonical-course-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseraCourseId: row.courseraCourseId,
          courseraCourseSlug: row.courseraCourseSlug,
          canonicalProgramSlug: programSlug,
          canonicalCourseSlug: courseSlug,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mapping save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <StatusBadge label="Not in WAP" variant="error" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-outline"
          style={{ fontSize: '0.8125rem', padding: '0.2rem 0.5rem' }}
        >
          Map this →
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.5rem',
        border: '1px solid var(--wa-border)',
        borderRadius: '0.4rem',
        background: 'var(--surface-container-low)',
        minWidth: 240,
      }}
    >
      <select
        value={programSlug}
        onChange={(e) => {
          setProgramSlug(e.target.value);
          setCourseSlug('');
        }}
        style={{ fontSize: '0.8125rem', padding: '0.25rem' }}
        aria-label="Canonical program"
      >
        <option value="">— pick program —</option>
        {catalog.map((p) => (
          <option key={p.programSlug} value={p.programSlug}>
            {p.programTitle}
          </option>
        ))}
      </select>
      <select
        value={courseSlug}
        onChange={(e) => setCourseSlug(e.target.value)}
        disabled={!program}
        style={{ fontSize: '0.8125rem', padding: '0.25rem' }}
        aria-label="Canonical course"
      >
        <option value="">— pick course —</option>
        {program?.courses.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
            {c.courseraCourseId ? ' (already linked statically)' : ''}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ color: 'var(--color-error, #b91c1c)', fontSize: '0.8125rem' }}>{error}</span>
      )}
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="btn btn-primary"
          style={{ fontSize: '0.8125rem', padding: '0.25rem 0.55rem' }}
        >
          {submitting ? 'Saving…' : 'Save mapping'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn btn-outline"
          style={{ fontSize: '0.8125rem', padding: '0.25rem 0.55rem' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Pretty-print a Coursera xAPI score (0..1 scaled) as `87%` / `—`. */
function fmtScore(scaled: number | null): string {
  if (scaled == null || !Number.isFinite(scaled)) return '—';
  return `${Math.round(scaled * 100)}%`;
}

const perItemColumns: DataTableColumn<ItemRow>[] = [
  {
    key: 'courseItemId',
    header: 'Item ID',
    cell: (it) => <span style={{ fontFamily: 'monospace' }}>{it.courseItemId}</span>,
  },
  {
    key: 'itemType',
    header: 'Type',
    cell: (it) => it.itemTypeLabel,
    hideOnMobile: true,
  },
  {
    key: 'latestVerb',
    header: 'Latest verb',
    cell: (it) => it.latestVerb ?? '—',
    hideOnMobile: true,
  },
  {
    key: 'score',
    header: 'Score',
    cell: (it) => fmtScore(it.latestScoreScaled),
    align: 'right',
  },
  {
    key: 'status',
    header: 'Status',
    cell: (it) => (
      <StatusBadge label={it.completed ? 'completed' : 'in progress'} variant={it.completed ? 'success' : 'accent'} />
    ),
  },
  {
    key: 'lastSeenAt',
    header: 'Last seen',
    cell: (it) => fmtDate(it.lastSeenAt),
    hideOnMobile: true,
  },
  {
    key: 'statementCount',
    header: '#evts',
    cell: (it) => it.statementCount,
    align: 'right',
  },
];

/**
 * Per-item drill-down for one (learner, course) cell. Lazily fetches from
 * `/api/admin/training-progress/items` only when the row expands, so the
 * page-load cost of 100s of curriculum rows stays flat.
 *
 * Renders inline below the row via DataTable's `renderSubRow` slot.
 */
function PerItemSubRow({
  learnerEmail,
  courseraCourseId,
}: {
  learnerEmail: string;
  courseraCourseId: string;
}) {
  const [state, setState] = useState<ItemFetchState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const params = new URLSearchParams({
      email: learnerEmail,
      courseraCourseId,
    });
    fetch(`/api/admin/training-progress/items?${params.toString()}`, {
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((j: { items?: ItemRow[] }) => {
        if (cancelled) return;
        setState({ status: 'ready', rows: j.items ?? [] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not load items',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [learnerEmail, courseraCourseId]);

  if (state.status === 'loading') {
    return (
      <div style={{ padding: '0.6rem 0.8rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        Loading per-item activity…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div style={{ padding: '0.6rem 0.8rem', fontSize: '0.8125rem', color: 'var(--color-error, #b91c1c)' }}>
        {state.message}
      </div>
    );
  }
  if (state.status !== 'ready') return null;

  if (state.rows.length === 0) {
    return (
      <div style={{ padding: '0.6rem 0.8rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        No item-level xAPI statements for this learner on this Coursera course.
        {' '}This is expected when only course-level rollups have been ingested.
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0.6rem', background: 'var(--surface-container-low)' }}>
      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem' }}>
        {state.rows.length} item{state.rows.length === 1 ? '' : 's'} from xapi_statements (item-level only).
      </div>
      <DataTable
        density="compact"
        rows={state.rows}
        rowKey={(it) => it.courseItemId}
        columns={perItemColumns}
      />
    </div>
  );
}

export default function TrainingProgressClient({
  curriculumRows,
  rawRows,
  canonicalCatalog,
}: {
  curriculumRows: CurriculumRow[];
  rawRows: RawCourseraRow[];
  canonicalCatalog: CanonicalCatalog;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>('curriculum');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<string>('learnerName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Set of curriculum-row keys whose per-item drill-down is open. Lazy: each
  // open row mounts <PerItemSubRow> which fetches once per (learner, course).
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredCurriculum = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let rows = curriculumRows;
    if (q) {
      rows = rows.filter(
        (r) =>
          r.learnerName.toLowerCase().includes(q) ||
          r.learnerEmail.toLowerCase().includes(q) ||
          r.programTitle.toLowerCase().includes(q) ||
          r.courseName.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const v = compare(a[sortKey as keyof CurriculumRow], b[sortKey as keyof CurriculumRow]);
      return sortDir === 'asc' ? v : -v;
    });
  }, [curriculumRows, filter, sortKey, sortDir]);

  const filteredRaw = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let rows = rawRows;
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.learnerName ?? '').toLowerCase().includes(q) ||
          r.learnerEmail.toLowerCase().includes(q) ||
          r.courseName.toLowerCase().includes(q) ||
          (r.courseraCourseSlug ?? '').toLowerCase().includes(q) ||
          (r.courseraProgramName ?? '').toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const v = compare(a[sortKey as keyof RawCourseraRow], b[sortKey as keyof RawCourseraRow]);
      return sortDir === 'asc' ? v : -v;
    });
  }, [rawRows, filter, sortKey, sortDir]);

  const sortHeader = (label: string, key: string) => (
    <span
      role="button"
      tabIndex={0}
      onClick={() => handleSort(key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(key); } }}
      aria-label={`Sort by ${label}`}
    >
      <SortLabel label={label} active={sortKey === key} dir={sortDir} />
    </span>
  );

  const learnerCell = (name: string | null, role: string | null) => (
    <>
      <strong>{name || '—'}</strong>
      {role && role !== 'member' && (
        <StatusBadge label={role} variant="info" className="wa-ml-1" />
      )}
    </>
  );

  const curriculumColumns: DataTableColumn<CurriculumRow>[] = [
    {
      key: 'expand',
      header: '',
      width: '2.2rem',
      cell: (r) => {
        // Only courses with a Coursera courseId can be drilled in — the
        // per-item route keys off the LRS's actor email + course id.
        if (!r.courseraCourseId || !r.learnerEmail) return null;
        const isOpen = expandedKeys.has(r.key);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(r.key);
            }}
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Hide per-item activity' : 'Show per-item activity'}
            className="btn btn-outline"
            style={{ fontSize: '0.8125rem', padding: '0.1rem 0.4rem', lineHeight: 1 }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        );
      },
    },
    {
      key: 'learnerName',
      header: sortHeader('Learner', 'learnerName'),
      cell: (r) => learnerCell(r.learnerName, r.learnerRole),
    },
    {
      key: 'learnerEmail',
      header: sortHeader('Email', 'learnerEmail'),
      cell: (r) => r.learnerEmail,
      hideOnMobile: true,
    },
    {
      key: 'programTitle',
      header: sortHeader('Program', 'programTitle'),
      cell: (r) => (
        <>
          {r.programTitle}
          {r.programRole === 'secondary' && (
            <StatusBadge label="secondary" variant="info" className="wa-ml-1" />
          )}
        </>
      ),
      hideOnMobile: true,
    },
    {
      key: 'courseName',
      header: sortHeader('Course', 'courseName'),
      cell: (r) => (
        <>
          {r.courseName}
          {r.courseraCourseId && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {r.courseraCourseId}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'percentComplete',
      header: sortHeader('Progress', 'percentComplete'),
      cell: (r) => `${r.percentComplete}%`,
      align: 'right',
    },
    {
      key: 'gradePercent',
      header: sortHeader('Grade', 'gradePercent'),
      cell: (r) =>
        r.gradePercent != null && Number.isFinite(r.gradePercent)
          ? `${Math.round(r.gradePercent * 100) / 100}%`
          : '—',
      align: 'right',
    },
    {
      key: 'status',
      header: sortHeader('Status', 'status'),
      cell: (r) => (
        <StatusBadge
          label={STATUS_LABEL[r.status] ?? r.status.toLowerCase()}
          variant={STATUS_VARIANT[r.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'lastActivityAt',
      header: sortHeader('Last activity', 'lastActivityAt'),
      cell: (r) => fmtDate(r.lastActivityAt),
      hideOnMobile: true,
    },
    {
      key: 'lastUpdatedAt',
      header: sortHeader('Last updated', 'lastUpdatedAt'),
      cell: (r) => fmtDate(r.lastUpdatedAt),
      hideOnMobile: true,
    },
  ];

  const rawColumns: DataTableColumn<RawCourseraRow>[] = [
    {
      key: 'learnerName',
      header: sortHeader('Learner', 'learnerName'),
      cell: (r) => (
        <>
          {learnerCell(r.learnerName ?? '(unknown)', r.learnerRole)}
          {!r.identityMatched && (
            <StatusBadge
              label="Not in WAP"
              variant="warning"
              className="wa-ml-1"
            />
          )}
        </>
      ),
    },
    {
      key: 'learnerEmail',
      header: sortHeader('Email', 'learnerEmail'),
      cell: (r) => r.learnerEmail,
      hideOnMobile: true,
    },
    {
      key: 'courseraProgramName',
      header: sortHeader('Coursera program', 'courseraProgramName'),
      cell: (r) => (
        <>
          {r.courseraProgramName ?? r.courseraProgramSlug}
          {r.courseraProgramSlug && r.courseraProgramName && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {r.courseraProgramSlug}
            </div>
          )}
        </>
      ),
      hideOnMobile: true,
    },
    {
      key: 'courseName',
      header: sortHeader('Coursera course', 'courseName'),
      cell: (r) => (
        <>
          {r.courseName}
          {r.courseraCourseSlug && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {r.courseraCourseSlug}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'mappedCourseSlug',
      header: sortHeader('Mapped to canonical', 'mappedCourseSlug'),
      cell: (r) =>
        r.mappedCourseSlug ? (
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            <div>{r.mappedProgramSlug}</div>
            <div>{r.mappedCourseSlug}</div>
            {r.mappingSource === 'db' && (
              <StatusBadge label="db override" variant="info" className="wa-mt-1" />
            )}
          </div>
        ) : (
          <MapThisAction
            row={r}
            catalog={canonicalCatalog}
            onSaved={() => router.refresh()}
          />
        ),
    },
    {
      key: 'percentComplete',
      header: sortHeader('Progress', 'percentComplete'),
      cell: (r) => `${Math.round(r.percentComplete)}%`,
      align: 'right',
    },
    {
      key: 'gradePercent',
      header: sortHeader('Grade', 'gradePercent'),
      cell: (r) =>
        r.gradePercent != null && Number.isFinite(r.gradePercent)
          ? `${Math.round(r.gradePercent * 100) / 100}%`
          : '—',
      align: 'right',
    },
    {
      key: 'learningHours',
      header: sortHeader('Hours', 'learningHours'),
      cell: (r) => r.learningHours.toFixed(1),
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'lastActivityTime',
      header: sortHeader('Last activity', 'lastActivityTime'),
      cell: (r) => fmtDate(r.lastActivityTime),
      hideOnMobile: true,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '0.75rem',
          background: 'var(--wa-surface)',
          border: '1px solid var(--wa-border)',
          borderRadius: '0.5rem',
        }}
      >
        <div role="tablist" aria-label="Training progress view" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          <button
            role="tab"
            aria-selected={view === 'curriculum'}
            onClick={() => setView('curriculum')}
            className={view === 'curriculum' ? 'btn btn-primary' : 'btn btn-outline'}
            style={{ fontSize: '0.85rem' }}
          >
            Curriculum view
            <span style={{ marginLeft: 6, opacity: 0.75, fontSize: '0.8125rem' }}>
              ({curriculumRows.length})
            </span>
          </button>
          <button
            role="tab"
            aria-selected={view === 'raw'}
            onClick={() => setView('raw')}
            className={view === 'raw' ? 'btn btn-primary' : 'btn btn-outline'}
            style={{ fontSize: '0.85rem' }}
          >
            Raw Coursera view
            <span style={{ marginLeft: 6, opacity: 0.75, fontSize: '0.8125rem' }}>
              ({rawRows.length})
            </span>
          </button>
        </div>
        <input
          type="search"
          placeholder="Filter by learner, course, program…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '0.4rem 0.6rem',
            borderRadius: '0.4rem',
            border: '1px solid var(--wa-control-border)',
            fontSize: '0.85rem',
          }}
        />
      </div>

      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        {view === 'curriculum'
          ? 'Row per (learner × enrolled program × canonical course). Pulls from the DB course_progress table — what the member dashboard renders. Click ▸ on any row to drill into per-item xAPI activity (lectures, quizzes, labs, peer reviews) for that learner on that Coursera course. A learner showing 0% here when their portal shows progress means raw Coursera activity exists in the Raw view but never promoted into course_progress (usually because no canonical mapping exists yet — open the Raw view and click "Map this →").'
          : 'Row per (learner × actual Coursera course they’re enrolled in). Pulls from coursera_course_progress (CSV import + B4B refresh). Includes every Coursera email — learners with no WAP account are flagged “Not in WAP” and need an identity mapping in /admin/coursera before progress can promote to the member dashboard.'}
      </p>

      {view === 'curriculum' ? (
        <DataTable<CurriculumRow>
          columns={curriculumColumns}
          rows={filteredCurriculum}
          rowKey={(r) => r.key}
          density="compact"
          renderSubRow={(r) => {
            if (!expandedKeys.has(r.key)) return null;
            if (!r.courseraCourseId || !r.learnerEmail) return null;
            return (
              <PerItemSubRow
                learnerEmail={r.learnerEmail}
                courseraCourseId={r.courseraCourseId}
              />
            );
          }}
          subRowTdStyle={{ padding: 0 }}
          emptyState={
            <p style={{ textAlign: 'center', color: 'var(--color-on-surface-variant)', padding: '1.5rem' }}>
              No rows. Curriculum rows only exist when a learner has an enrolledProgram set.
            </p>
          }
        />
      ) : (
        <DataTable<RawCourseraRow>
          columns={rawColumns}
          rows={filteredRaw}
          rowKey={(r) => r.key}
          density="compact"
          emptyState={
            <p style={{ textAlign: 'center', color: 'var(--color-on-surface-variant)', padding: '1.5rem' }}>
              No raw Coursera rows. Either no learner has triggered a B4B refresh or no CSV import has run.
            </p>
          }
        />
      )}
    </div>
  );
}
