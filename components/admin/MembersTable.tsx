'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Filter, Plus, Download, Mail, Users, GraduationCap, CheckCircle } from 'lucide-react';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { getStudentStatus, type StudentStatus } from '@/lib/admin/studentStatus';
import BulkEmailModal from './BulkEmailModal';
import BulkUpdateModal from './BulkUpdateModal';
import { formatPhone } from '@/lib/formatPhone';
import type { HealthStatus } from '@/lib/admin/healthScore';
import { APPLICANT_TRIAGE_BUCKETS, type ApplicantTriageBucket } from '@/lib/admin/applicantTriage';
import ApplicantTriageChip from './ApplicantTriageChip';
import DataTable from '@/components/portal/ui/DataTable';
import ConfirmDialog from './ConfirmDialog';
import PortalPagination from '@/components/portal/PortalPagination';
import { useDirectoryNavigation } from './useDirectoryNavigation';
import { formatPortalDate } from '@/lib/formatDate';

function formatMemberDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  // Fixed locale + timezone: server and client render the same text (hydration).
  return formatPortalDate(d);
}

type Member = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  profile: { profilePhone?: string | null; smsOptIn?: boolean } | null;
  enrolledProgram: string | null;
  enrolledAt: Date | string | null;
  createdAt: Date | string;
  staleTrainingDetectedAt: Date | string | null;
  assessmentScorePct: number | null;
  assessmentCompleted: boolean | null;
  updatedAt: Date | string;
  memberStatus: string | null;
  programTitle: string | null | undefined;
  coursesCompleted: string[];
  totalCourses: number;
  liveTraining: {
    percent: number;
    coursesCompleted: number;
    coursesActive: number;
    totalCourses: number;
    lastUpdatedAt: Date | string;
  } | null;
  partnerName: string | null;
  partnerId: string | null;
  fitScore?: number;
  healthStatus?: HealthStatus;
  /** Applicant intake triage; only set while the member has an open application (PENDING / NEEDS_INFO). */
  applicantTriage?: { bucket: ApplicantTriageBucket; label: string; reasons: string[] } | null;
  enrollmentProgramSlugs: string[];
  enrollmentProgramTitleBySlug: Record<string, string>;
};

type MembersTableProps = {
  members: Member[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  searchQuery: string;
  programFilter: string;
  statusFilter: string;
  partnerFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  /**
   * Whether the server included staff / dogfood admin accounts in `members`
   * and `totalCount`. Default is members only, so the count line agrees with
   * /admin/students (audit 2026-09-20, S3; Mike: "remove staff in count").
   */
  includeStaff?: boolean;
  /** Translated copy for the applicant-triage filter; omitted = filter hidden. */
  applicantTriageCopy?: { filterLabel: string; filterAll: string; buckets: Record<ApplicantTriageBucket, string> };
  /** Org-wide partner list so the dropdown is not limited to the loaded page. */
  allPartnerOptions: Array<{ id: string; name: string }>;
  /** Tenant-catalog program list for assignment, independent of this member page. */
  allAssignablePrograms: Array<{ slug: string; title: string }>;
};

function FitScoreBadge({ score }: { score: number }) {
  // Mid scores use the token layer's text-on-gold-tint pair (--wa-gold-dark on
  // --wa-gold-soft, the .wa-kit-tag--warn pattern): the previous #d97706 on
  // #fffbeb measured 3.07:1 for 12.8px text. High scores use the matching
  // text-on-success-tint pair: the previous #16a34a on #f0fdf4 measured 3.15:1.
  // Low scores: the danger tag pair (--wa-danger-text on --wa-danger-soft);
  // #dc2626 on #fef2f2 was 4.41:1 and the opaque tint glowed white in dark.
  const color = score >= 8 ? 'var(--wa-success-dark)' : score >= 5 ? 'var(--wa-gold-dark)' : 'var(--wa-danger-text)';
  const bg = score >= 8 ? 'var(--wa-success-soft)' : score >= 5 ? 'var(--wa-gold-soft)' : 'var(--wa-danger-soft)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: '50px', fontSize: '0.8125rem', fontWeight: 600, color, background: bg, border: `1px solid color-mix(in srgb, ${color} 12%, transparent)`, fontVariantNumeric: 'tabular-nums' }}>{score}/10</span>;
}

function HealthDot({ status }: { status: HealthStatus }) {
  const variant = status === 'green' ? 'success' : status === 'yellow' ? 'warning' : 'error';
  // "Low activity", not "At Risk": the yellow dot is a 7-day event-recency
  // heuristic, unrelated to the at-risk alert queue behind /admin "Risk
  // alerts" (audit 2026-09-20, S25).
  const label = status === 'green' ? 'Active' : status === 'yellow' ? 'Low activity' : 'Inactive';
  return (
    <span style={{ display: 'inline-flex', marginRight: '0.35rem', verticalAlign: 'middle' }}>
      <StatusDot variant={variant} label={label} tooltip={label} />
    </span>
  );
}

function formatTraining(m: Member, variant: 'table' | 'card' = 'table'): string {
  if (m.liveTraining) {
    const active = m.liveTraining.coursesActive > 0
      ? ` · ${m.liveTraining.coursesActive} active`
      : '';
    if (variant === 'card') {
      return `${m.liveTraining.percent}% program${active}`;
    }
    return `${m.liveTraining.percent}% program · ${m.liveTraining.coursesCompleted}/${m.liveTraining.totalCourses} done${active}`;
  }
  if (m.assessmentCompleted) return `${m.coursesCompleted.length}/${m.totalCourses}`;
  return '—';
}

const NEW_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function toTime(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * A member has no assigned program when neither the legacy `enrolledProgram`
 * pointer nor any `course_enrollments` row names one. It does NOT mean they
 * have done no coursework: 10 members with real course_progress land here, so
 * the badge says "No assigned program" rather than "No course"
 * (audit 2026-09-20, S16). Program deliberately stays "—" for them — the
 * latest rollup row is not an assignment.
 */
function isNotInCourse(m: Member): boolean {
  return !m.enrolledProgram && m.enrollmentProgramSlugs.length === 0;
}

function isNewMember(m: Member): boolean {
  const t = toTime(m.createdAt);
  return t > 0 && Date.now() - t <= NEW_MEMBER_WINDOW_MS;
}

/**
 * "Needs attention" surfaces members dad should look at, derived from existing
 * row signals only: red health (inactive) OR stale training detected OR
 * no assigned program OR a brand-new signup. A sensible default he can refine.
 */
function attentionReasons(m: Member): string[] {
  const reasons: string[] = [];
  if (m.healthStatus === 'red') reasons.push('Inactive');
  if (m.staleTrainingDetectedAt) reasons.push('Stale training');
  if (isNotInCourse(m)) reasons.push('No assigned program');
  if (isNewMember(m)) reasons.push('New');
  return reasons;
}

function needsAttention(m: Member): boolean {
  return attentionReasons(m).length > 0;
}

function AttentionBadge({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <span style={{ color: 'var(--wa-muted)' }}>—</span>;
  const isNewOnly = reasons.length === 1 && reasons[0] === 'New';
  // Kit tag pairs (info / danger) so the chip follows dark mode: the former
  // #2563eb on #eff6ff / #dc2626 on #fef2f2 were opaque light tints.
  const color = isNewOnly ? 'var(--wa-info-dark)' : 'var(--wa-danger-text)';
  const bg = isNewOnly ? 'var(--wa-info-soft)' : 'var(--wa-danger-soft)';
  return (
    <span
      title={reasons.join(' · ')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.5rem',
        borderRadius: '50px',
        fontSize: '0.8125rem',
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {reasons[0]}
      {reasons.length > 1 ? ` +${reasons.length - 1}` : ''}
    </span>
  );
}

type SortKey = 'name' | 'enrolled' | 'created' | 'fit' | 'health' | 'lastActive' | 'score';
type SortDir = 'asc' | 'desc';

const HEALTH_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2 };

function compareMembers(a: Member, b: Member, key: SortKey): number {
  switch (key) {
    case 'name':
      return (a.fullName ?? '').localeCompare(b.fullName ?? '');
    case 'enrolled':
      return toTime(a.enrolledAt) - toTime(b.enrolledAt);
    case 'created':
      return toTime(a.createdAt) - toTime(b.createdAt);
    case 'fit':
      return (a.fitScore ?? -1) - (b.fitScore ?? -1);
    case 'health':
      return (HEALTH_RANK[a.healthStatus ?? ''] ?? 99) - (HEALTH_RANK[b.healthStatus ?? ''] ?? 99);
    case 'lastActive':
      return toTime(a.updatedAt) - toTime(b.updatedAt);
    case 'score':
      return (a.assessmentScorePct ?? -1) - (b.assessmentScorePct ?? -1);
    default:
      return 0;
  }
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="admin-members-sort-header"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}
      aria-label={`Sort by ${label}${active ? (dir === 'asc' ? ', ascending' : ', descending') : ''}`}
    >
      {label}
      <span style={{ fontSize: '0.7em', opacity: active ? 1 : 0.3 }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </button>
  );
}

function HeaderSelectAll({
  filtered,
  selectedIds,
  onBulkSelect,
}: {
  filtered: Member[];
  selectedIds: Set<string>;
  onBulkSelect: (selectAllInView: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const ids = filtered.map((m) => m.id);
  const selectedInView = ids.filter((id) => selectedIds.has(id)).length;
  const all = ids.length > 0 && selectedInView === ids.length;
  const some = selectedInView > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={all}
      onChange={() => onBulkSelect(!all)}
      aria-label={all ? 'Deselect all rows in current view' : 'Select all rows in current view'}
      className="admin-members-row-check"
    />
  );
}

export default function MembersTable({
  members,
  totalCount,
  currentPage,
  pageSize,
  searchQuery,
  programFilter,
  statusFilter,
  partnerFilter: partnerFilterProp,
  startDateFilter,
  endDateFilter,
  allPartnerOptions,
  allAssignablePrograms,
  includeStaff = false,
  applicantTriageCopy,
}: MembersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialSort = searchParams?.get('sort')?.split(':') as [SortKey, SortDir] | undefined;
  const { query: search, search: setSearch, navigate: updateUrl, pending: searchPending } = useDirectoryNavigation(searchQuery);
  const [programFilterState, setProgramFilterState] = useState(programFilter);
  const [statusFilterState, setStatusFilterState] = useState(statusFilter);
  const [partnerFilter, setPartnerFilter] = useState(partnerFilterProp);
  const [healthFilter, setHealthFilter] = useState(() => searchParams?.get('health') ?? '');
  const [triageFilter, setTriageFilter] = useState(() => {
    const v = searchParams?.get('triage') ?? '';
    return (APPLICANT_TRIAGE_BUCKETS as readonly string[]).includes(v) ? v : '';
  });
  const [notInCourseFilter, setNotInCourseFilter] = useState(false);
  const [needsAttentionFilter, setNeedsAttentionFilter] = useState(() => searchParams?.get('attention') === '1');
  const [startDate, setStartDate] = useState(startDateFilter);
  const [endDate, setEndDate] = useState(endDateFilter);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // Dad-safe default: surface most-recently-active members first (matches server's initial sort).
  const [sortKey, setSortKey] = useState<SortKey>(() => initialSort?.[0] ?? 'lastActive');
  const [sortDir, setSortDir] = useState<SortDir>(() => initialSort?.[1] ?? 'desc');
  // "More sort options" disclosure starts collapsed; only the 3 common sorts show until expanded.
  const [showAdvancedSorts, setShowAdvancedSorts] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkHint, setBulkHint] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | { type: 'enrolled' | 'completed'; count: number }>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const closeConfirmAction = () => {
    if (!bulkActionLoading) setConfirmAction(null);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // An earlier response for one filter must not reset newer choices in others.
  useEffect(() => { setProgramFilterState(programFilter); }, [programFilter]);
  useEffect(() => { setStatusFilterState(statusFilter); }, [statusFilter]);
  useEffect(() => { setPartnerFilter(partnerFilterProp); }, [partnerFilterProp]);
  useEffect(() => { setStartDate(startDateFilter); }, [startDateFilter]);
  useEffect(() => { setEndDate(endDateFilter); }, [endDateFilter]);

  const filtered = useMemo(() => {
    const rows = members.filter((m) => {
      // Search, program, lifecycle, partner and dates are already applied before
      // server pagination. Re-filtering them here can hide valid server matches.
      const matchHealth = !healthFilter || m.healthStatus === healthFilter;
      const matchNotInCourse = !notInCourseFilter || isNotInCourse(m);
      const matchAttention = !needsAttentionFilter || needsAttention(m);
      const matchTriage = !triageFilter || m.applicantTriage?.bucket === triageFilter;
      return matchHealth && matchNotInCourse && matchAttention && matchTriage;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    // Stable sort with a fit-score tiebreaker so equal keys keep a sensible order.
    return rows
      .map((m, i) => [m, i] as const)
      .sort(([a, ia], [b, ib]) => {
        const primary = compareMembers(a, b, sortKey) * dir;
        if (primary !== 0) return primary;
        const tie = (b.fitScore ?? -1) - (a.fitScore ?? -1);
        return tie !== 0 ? tie : ia - ib;
      })
      .map(([m]) => m);
  }, [
    members,
    healthFilter,
    triageFilter,
    notInCourseFilter,
    needsAttentionFilter,
    sortKey,
    sortDir,
  ]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Names default ascending (A→Z); numeric/date columns default descending (newest/highest first).
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  const programs = useMemo(() => {
    const titleBySlug = new Map(allAssignablePrograms.map(program => [program.slug, program.title]));
    for (const m of members) {
      for (const slug of m.enrollmentProgramSlugs) {
        if (!titleBySlug.has(slug)) {
          titleBySlug.set(slug, m.enrollmentProgramTitleBySlug[slug] ?? slug);
        }
      }
    }
    return [...titleBySlug.entries()]
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [members, allAssignablePrograms]);

  const partnerOptions = useMemo(
    () => allPartnerOptions.map((p) => [p.id, p.name] as const),
    [allPartnerOptions],
  );

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (programFilterState ? 1 : 0) +
    (statusFilterState ? 1 : 0) +
    (partnerFilter ? 1 : 0) +
    (healthFilter ? 1 : 0) +
    (triageFilter ? 1 : 0) +
    (notInCourseFilter ? 1 : 0) +
    (needsAttentionFilter ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const selectedInCurrentView = useMemo(
    () => filtered.filter((m) => selectedIds.has(m.id)).length,
    [filtered, selectedIds],
  );

  const selectedRows = useMemo(() => members.filter((m) => selectedIds.has(m.id)), [members, selectedIds]);

  function clearAllFilters() {
    setProgramFilterState('');
    setStatusFilterState('');
    setPartnerFilter('');
    setHealthFilter('');
    setNotInCourseFilter(false);
    setNeedsAttentionFilter(false);
    setStartDate('');
    setEndDate('');
    updateUrl({ search: '', program: '', status: '', partner: '', startDate: '', endDate: '', health: '', attention: '', page: '' });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkHint(null);
  }

  function onHeaderSelect(selectAllInView: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const ids = filtered.map((m) => m.id);
      if (selectAllInView) {
        for (const id of ids) next.add(id);
      } else {
        for (const id of ids) next.delete(id);
      }
      return next;
    });
    setBulkHint(null);
  }

  function copySelectedEmails() {
    const text = selectedRows.map((m) => m.email).join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      setBulkHint(`Copied ${selectedRows.length} email${selectedRows.length === 1 ? '' : 's'}`);
      window.setTimeout(() => setBulkHint(null), 3500);
    });
  }

  async function downloadSelectedCsv() {
    if (selectedRows.length === 0) return;
    try {
      const res = await fetch('/api/admin/members/bulk-export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: selectedRows.map((m) => m.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBulkHint(typeof data.error === 'string' ? data.error : 'Export failed');
        window.setTimeout(() => setBulkHint(null), 3500);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      a.download = `members-export-${selectedRows.length}-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setBulkHint(`Exported ${selectedRows.length} row${selectedRows.length === 1 ? '' : 's'}`);
      window.setTimeout(() => setBulkHint(null), 3500);
    } catch {
      setBulkHint('Network error during export');
      window.setTimeout(() => setBulkHint(null), 3500);
    }
  }

  async function exportFilteredCsv() {
    if (filtered.length === 0) return;
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilterState) params.set('status', statusFilterState);
      if (programFilterState) params.set('program', programFilterState);
      if (partnerFilter) params.set('partner', partnerFilter);
      if (healthFilter) params.set('health', healthFilter);
      if (notInCourseFilter) params.set('notInCourse', '1');
      if (needsAttentionFilter) params.set('needsAttention', '1');
      // The CSV must cover exactly the rows on screen, staff included or not.
      if (includeStaff) params.set('staff', '1');
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await fetch(`/api/admin/members/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBulkHint(typeof data.error === 'string' ? data.error : 'Export failed');
        window.setTimeout(() => setBulkHint(null), 3500);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      a.download = `members-export-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setBulkHint('Exported all members matching your filters');
      window.setTimeout(() => setBulkHint(null), 3500);
    } catch {
      setBulkHint('Network error during export');
      window.setTimeout(() => setBulkHint(null), 3500);
    } finally {
      setExportLoading(false);
    }
  }

  function goToPage(page: number) {
    if (page < 1 || page > totalPages) return;
    updateUrl({ page: page.toString() });
  }

  return (
    <div className="admin-members-table-root" aria-busy={searchPending}>
      <div className="admin-members-toolbar">
        <div className="admin-members-toolbar__primary">
          <label className="admin-members-search-label">
            <span className="admin-members-search-label__text">Search members</span>
            <input
              type="search"
              placeholder="Name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-members-search-input"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm admin-members-filter-toggle"
            onClick={() => setFiltersExpanded((v) => !v)}
            aria-expanded={filtersExpanded}
          >
            <Filter size={14} aria-hidden style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
            Refine list
            {activeFilterCount > 0 ? <span className="admin-members-filter-badge">{activeFilterCount}</span> : null}
          </button>
        </div>

        <div className="admin-members-count-line" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span role="status">
            {searchPending ? 'Searching all members… ' : null}
            <strong>{filtered.length.toLocaleString()}</strong> shown
            {totalCount !== filtered.length ? (
              <>
                {' '}
                of <strong>{totalCount.toLocaleString()}</strong>
              </>
            ) : null}
            {includeStaff ? <span className="admin-members-count-line__filters"> · includes staff accounts</span> : null}
            {activeFilterCount > 0 ? <span className="admin-members-count-line__filters"> · {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} on</span> : null}
            {totalPages > 1 && (healthFilter || notInCourseFilter || needsAttentionFilter) ? (
              <span className="admin-members-count-line__filters" style={{ display: 'block', fontSize: '0.8125rem' }}>
                Health / attention filters apply to this page&apos;s {members.length} members only — page through to check the rest, or Export CSV (applies them to all matching members).
              </span>
            ) : null}
          </span>
          <div className={`admin-members-secondary-controls${filtersExpanded ? ' admin-members-secondary-controls--open' : ''}`}>
            <label className="admin-members-filter-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); updateUrl({ startDate: e.target.value }); }}
                className="admin-members-filter-select"
                style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
              />
            </label>
            <label className="admin-members-filter-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); updateUrl({ endDate: e.target.value }); }}
                className="admin-members-filter-select"
                style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
              />
            </label>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void exportFilteredCsv()}
              disabled={searchPending || exportLoading || filtered.length === 0}
              aria-busy={exportLoading}
            >
              <Download size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div
          className={['admin-members-filters', filtersExpanded ? 'admin-members-filters--open' : ''].filter(Boolean).join(' ')}
        >
          <label className="admin-members-filter-field">
            <span>Program</span>
            <select
              value={programFilterState}
              onChange={(e) => {
                setProgramFilterState(e.target.value);
                updateUrl({ program: e.target.value });
              }}
              className="admin-members-filter-select"
            >
              <option value="">All programs</option>
              {programs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-members-filter-field">
            <span>Status</span>
            <select
              value={statusFilterState}
              onChange={(e) => {
                setStatusFilterState(e.target.value);
                updateUrl({ status: e.target.value });
              }}
              className="admin-members-filter-select"
            >
              <option value="">All statuses</option>
              <option value="enrolled">Enrolled (in program)</option>
              <option value="active">Active (recent activity)</option>
              <option value="completed">Completed a course</option>
              <option value="dropped">Dropped (deleted)</option>
              <option value="stale">Stale training (7d+)</option>
            </select>
          </label>
          <label className="admin-members-filter-field">
            <span>Partner</span>
            <select value={partnerFilter} onChange={(e) => { setPartnerFilter(e.target.value); updateUrl({ partner: e.target.value }); }} className="admin-members-filter-select">
              <option value="">All partners</option>
              <option value="__none">No partner</option>
              {partnerOptions.map(([pid, pname]) => (
                <option key={pid} value={pid}>
                  {pname}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-members-filter-field">
            <span>Health</span>
            <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="admin-members-filter-select">
              <option value="">All health</option>
              <option value="green">Active</option>
              <option value="yellow">Low activity</option>
              <option value="red">Inactive</option>
            </select>
          </label>
          {applicantTriageCopy ? (
            <label className="admin-members-filter-field">
              <span>{applicantTriageCopy.filterLabel}</span>
              <select value={triageFilter} onChange={(e) => setTriageFilter(e.target.value)} className="admin-members-filter-select">
                <option value="">{applicantTriageCopy.filterAll}</option>
                {APPLICANT_TRIAGE_BUCKETS.map((bucket) => (
                  <option key={bucket} value={bucket}>{applicantTriageCopy.buckets[bucket]}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="admin-members-filter-field admin-members-filter-field--check" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={needsAttentionFilter}
              onChange={(e) => setNeedsAttentionFilter(e.target.checked)}
            />
            <span>Needs attention</span>
          </label>
          <label className="admin-members-filter-field admin-members-filter-field--check" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={notInCourseFilter}
              onChange={(e) => setNotInCourseFilter(e.target.checked)}
            />
            <span>No assigned program</span>
          </label>
          <label className="admin-members-filter-field admin-members-filter-field--check" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={includeStaff}
              onChange={(e) => updateUrl({ staff: e.target.checked ? '1' : '' })}
            />
            <span title="Admin and super-admin accounts used for testing member surfaces. Off by default, so this count matches the Students roster.">
              Include staff accounts
            </span>
          </label>
          <label className="admin-members-filter-field">
            <span>Sort by</span>
            {(() => {
              // Dad-safe surface: 3 common sorts always visible; remaining 6 behind a
              // "More sort options" disclosure. If the user's current sort is one of the
              // advanced 6, auto-expand so the dropdown reflects the active selection.
              const currentValue = `${sortKey}:${sortDir}`;
              const commonValues = new Set(['lastActive:desc', 'name:asc', 'created:desc']);
              const expanded = showAdvancedSorts || !commonValues.has(currentValue);
              return (
                <>
                  <select
                    value={currentValue}
                    onChange={(e) => {
                      const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                      setSortKey(k);
                      setSortDir(d);
                    }}
                    className="admin-members-filter-select"
                  >
                    {expanded ? (
                      <>
                        <optgroup label="Common">
                          <option value="lastActive:desc">Recently active</option>
                          <option value="name:asc">Name (A→Z)</option>
                          <option value="created:desc">Recently signed up</option>
                        </optgroup>
                        <optgroup label="Advanced">
                          <option value="fit:desc">Best fit first</option>
                          <option value="created:asc">Oldest first</option>
                          <option value="enrolled:desc">Recently enrolled</option>
                          <option value="lastActive:asc">Least recently active</option>
                          <option value="health:asc">Health (worst first)</option>
                          <option value="score:desc">Highest assessment %</option>
                        </optgroup>
                      </>
                    ) : (
                      <>
                        <option value="lastActive:desc">Recently active</option>
                        <option value="name:asc">Name (A→Z)</option>
                        <option value="created:desc">Recently signed up</option>
                      </>
                    )}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAdvancedSorts((v) => !v)}
                    aria-expanded={expanded}
                    style={{ marginTop: '0.25rem', alignSelf: 'flex-start', fontSize: '0.8125rem', padding: '0.15rem 0.4rem' }}
                  >
                    {expanded ? 'Fewer sort options ▴' : 'More sort options ▾'}
                  </button>
                </>
              );
            })()}
          </label>
          {activeFilterCount > 0 ? (
            <div className="admin-members-filter-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllFilters}>
                Clear all filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {selectedIds.size >= 1 && (
        <div className="admin-members-bulk-bar" role="region" aria-label="Bulk actions for selected members">
          <div className="admin-members-bulk-bar__lead">
            <span className="admin-members-bulk-bar__count">{selectedIds.size}</span>
            <span>
              selected
              {selectedInCurrentView < selectedIds.size ? (
                <span className="admin-members-bulk-bar__sub"> ({selectedInCurrentView} in current view)</span>
              ) : null}
            </span>
          </div>
          <div className="admin-members-bulk-bar__actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onHeaderSelect(true)} disabled={filtered.length === 0}>
              Select all in view
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelectedIds(new Set()); setBulkHint(null); }}>
              Clear selection
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void copySelectedEmails()}>
              Copy emails
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void downloadSelectedCsv()}>
              <Download size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Export CSV
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowEmailModal(true)}>
              <Mail size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Bulk email
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowUpdateModal(true)}>
              <Users size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Bulk update
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setConfirmAction({ type: 'enrolled', count: selectedIds.size })}
              disabled={bulkActionLoading}
            >
              <GraduationCap size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Mark as Enrolled
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setConfirmAction({ type: 'completed', count: selectedIds.size })}
              disabled={bulkActionLoading}
            >
              <CheckCircle size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Mark as Completed
            </button>
          </div>
          {bulkHint ? <p className="admin-members-bulk-hint">{bulkHint}</p> : null}
        </div>
      )}

      <div className="admin-table-scroll admin-members-desktop">
        <DataTable
          variant="admin"
          tableClassName="admin-table admin-table--dense"
          scrollX={false}
          rows={filtered}
          rowKey={(m) => m.id}
          getRowProps={(m) => ({
            onClick: () => router.push(`/admin/members/${m.id}`),
            style: { cursor: 'pointer' },
            'data-clickable': 'true',
          })}
          columns={[
            {
              key: 'sel',
              header: <HeaderSelectAll filtered={filtered} selectedIds={selectedIds} onBulkSelect={onHeaderSelect} />,
              cellDataLabel: 'Select',
              width: 40,
              align: 'center',
              columnClassName: 'admin-members-col-select',
              cell: (m) => (
                <span
                  role="presentation"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => toggleSelect(m.id)}
                    aria-label={`Select ${m.fullName}`}
                    className="admin-members-row-check"
                  />
                </span>
              ),
            },
            {
              key: 'attn',
              header: 'Priority',
              cell: (m) => (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                  <AttentionBadge reasons={attentionReasons(m)} />
                  {m.applicantTriage ? <ApplicantTriageChip {...m.applicantTriage} /> : null}
                </span>
              ),
            },
            {
              key: 'memberStatus',
              header: 'Status',
              cell: (m) => {
                const status = m.memberStatus ?? 'active';
                // Same pairs as the mobile card below (kit tag ok / info / muted).
                const color = status === 'active' ? 'var(--wa-success-dark)' : status === 'placed' ? 'var(--wa-info-dark)' : 'var(--wa-muted-strong)';
                const bg = status === 'active' ? 'var(--wa-success-soft)' : status === 'placed' ? 'var(--wa-info-soft)' : 'var(--wa-surface-2)';
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: '50px', fontSize: '0.8125rem', fontWeight: 600, color, background: bg, border: `1px solid color-mix(in srgb, ${color} 12%, transparent)`, textTransform: 'capitalize' }}>
                    {status}
                  </span>
                );
              },
            },
            {
              key: 'name',
              header: (
                <SortHeader label="Name" sortKey="name" active={sortKey === 'name'} dir={sortDir} onSort={onSort} />
              ),
              cell: (m) => {
                const rawPhone = m.profile?.profilePhone ?? m.phone;
                const phoneDisplay = formatPhone(rawPhone);
                const lastActive = formatMemberDate(m.updatedAt) ?? '—';
                return (
                  <>
                    <Link href={`/admin/members/${m.id}`} onClick={(e) => e.stopPropagation()}>
                      {m.healthStatus && <HealthDot status={m.healthStatus} />}
                      {m.fullName}
                    </Link>
                    <div className="members-name-details">
                      {rawPhone ? (
                        <>
                          <span>{phoneDisplay}</span>
                          <span className="members-name-details-sep"> · </span>
                        </>
                      ) : null}
                      <span>Last active {lastActive}</span>
                    </div>
                  </>
                );
              },
            },
            { key: 'email', header: 'Email', cell: (m) => m.email },
            {
              key: 'phone',
              header: 'Phone',
              columnClassName: 'members-col-md',
              cell: (m) => (
                <span title={m.profile?.smsOptIn ? 'SMS opted in' : 'SMS not opted in'}>
                  {formatPhone(m.profile?.profilePhone ?? m.phone)}
                  {m.profile?.smsOptIn && <span style={{ marginLeft: 4, fontSize: '0.8125rem', color: '#16a34a' }}>✓ SMS</span>}
                </span>
              ),
            },
            { key: 'program', header: 'Program', cell: (m) => m.programTitle ?? '—' },
            { key: 'partner', header: 'Partner', cell: (m) => m.partnerName ?? '—' },
            {
              key: 'fit',
              header: <SortHeader label="Fit" sortKey="fit" active={sortKey === 'fit'} dir={sortDir} onSort={onSort} />,
              align: 'right',
              cell: (m) => (m.fitScore != null ? <FitScoreBadge score={m.fitScore} /> : '—'),
            },
            {
              key: 'health',
              header: (
                <SortHeader label="Health" sortKey="health" active={sortKey === 'health'} dir={sortDir} onSort={onSort} />
              ),
              cell: (m) =>
                m.healthStatus ? (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color:
                        m.healthStatus === 'green' ? '#16a34a' : m.healthStatus === 'yellow' ? '#d97706' : '#dc2626',
                    }}
                  >
                    {m.healthStatus === 'green' ? 'Active' : m.healthStatus === 'yellow' ? 'Low activity' : 'Inactive'}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              key: 'enrolled',
              header: (
                <SortHeader label="Enrolled" sortKey="enrolled" active={sortKey === 'enrolled'} dir={sortDir} onSort={onSort} />
              ),
              cell: (m) => formatMemberDate(m.enrolledAt) ?? '—',
            },
            {
              key: 'score',
              header: (
                <SortHeader label="Score %" sortKey="score" active={sortKey === 'score'} dir={sortDir} onSort={onSort} />
              ),
              align: 'right',
              cell: (m) => (
                <span
                  className={
                    m.assessmentScorePct != null
                      ? m.assessmentScorePct >= 70
                        ? 'admin-score-high'
                        : m.assessmentScorePct >= 50
                          ? 'admin-score-mid'
                          : 'admin-score-low'
                      : ''
                  }
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {m.assessmentScorePct != null ? `${m.assessmentScorePct}%` : '—'}
                </span>
              ),
            },
            { key: 'training', header: 'Training', cell: (m) => formatTraining(m) },
            {
              key: 'lastMd',
              header: (
                <SortHeader label="Last Active" sortKey="lastActive" active={sortKey === 'lastActive'} dir={sortDir} onSort={onSort} />
              ),
              columnClassName: 'members-col-md',
              cell: (m) => formatMemberDate(m.updatedAt) ?? '—',
            },
            {
              key: 'session',
              header: 'Session',
              cell: (m) => (
                <Link
                  href={`/counselor/sessions/${m.id}/run`}
                  onClick={(e) => e.stopPropagation()}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                >
                  Start session
                </Link>
              ),
            },
          ]}
        />
      </div>

      <ul className="admin-portal-card-list admin-members-cards" aria-label="Members (mobile layout)">
        {filtered.map((m) => {
          const rawPhone = m.profile?.profilePhone ?? m.phone;
          const phoneDisplay = formatPhone(rawPhone);
          const lastActive = formatMemberDate(m.updatedAt) ?? '—';
          return (
            <li
              key={m.id}
              className="admin-portal-card"
            >
              <div className="admin-portal-card__header" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <div className="admin-members-mobile-identity">
                  <label className="admin-members-mobile-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      aria-label={`Select ${m.fullName}`}
                    />
                  </label>
                  <Link href={`/admin/members/${m.id}`} style={{ fontWeight: 700, color: 'var(--color-accent)', wordBreak: 'break-word' }} onClick={(e) => e.stopPropagation()}>
                    {m.healthStatus && <HealthDot status={m.healthStatus} />}
                    {m.fullName}
                  </Link>
                </div>
                {m.healthStatus ? (
                  <span
                    className="admin-portal-card__badge"
                    style={{
                      background:
                        m.healthStatus === 'green'
                          ? 'var(--wa-success-soft)'
                          : m.healthStatus === 'yellow'
                            ? 'var(--wa-gold-soft)'
                            : 'var(--wa-danger-soft)',
                      color: m.healthStatus === 'green' ? 'light-dark(#166534, var(--wa-success))' : m.healthStatus === 'yellow' ? 'var(--wa-gold-dark)' : 'light-dark(#991b1b, var(--wa-danger))',
                    }}
                  >
                    {m.healthStatus === 'green' ? 'Active' : m.healthStatus === 'yellow' ? 'Low activity' : 'Inactive'}
                  </span>
                ) : null}
              </div>
              {attentionReasons(m).length > 0 ? (
                <p className="admin-portal-card__row" onClick={(e) => e.stopPropagation()}>
                  <span className="admin-portal-card__label">Priority</span> <AttentionBadge reasons={attentionReasons(m)} />
                </p>
              ) : null}
              {m.applicantTriage && applicantTriageCopy ? (
                <p className="admin-portal-card__row">
                  <span className="admin-portal-card__label">{applicantTriageCopy.filterLabel}</span> <ApplicantTriageChip {...m.applicantTriage} />
                </p>
              ) : null}
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Status</span>{' '}
                {(() => {
                  const status = m.memberStatus ?? 'active';
                  // Token pairs (kit tag ok / info / muted): the hardcoded light
                  // tints rendered as white pills on the dark card (scout M5).
                  const color = status === 'active' ? 'var(--wa-success-dark)' : status === 'placed' ? 'var(--wa-info-dark)' : 'var(--wa-muted-strong)';
                  const bg = status === 'active' ? 'var(--wa-success-soft)' : status === 'placed' ? 'var(--wa-info-soft)' : 'var(--wa-surface-2)';
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: '50px', fontSize: '0.8125rem', fontWeight: 600, color, background: bg, border: `1px solid color-mix(in srgb, ${color} 12%, transparent)`, textTransform: 'capitalize' }}>
                      {status}
                    </span>
                  );
                })()}
              </p>
              <p className="admin-portal-card__meta">{m.email}</p>
              {rawPhone ? <p className="admin-portal-card__meta">{phoneDisplay}</p> : null}
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Program</span> {m.programTitle ?? '—'}
              </p>
              <details className="admin-members-mobile-details">
                <summary>Training & details</summary>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Partner</span> {m.partnerName ?? '—'}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Fit</span> {m.fitScore != null ? <FitScoreBadge score={m.fitScore} /> : '—'}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Training</span> {formatTraining(m, 'card')}
              </p>
              <p className="admin-portal-card__meta">Last active {lastActive}</p>
              </details>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                <Link href={`/admin/members/${m.id}`} className="btn btn-sm btn-primary">Open member</Link>
                <Link
                  href={`/counselor/sessions/${m.id}/run`}
                  onClick={(e) => e.stopPropagation()}
                  className="btn btn-sm btn-outline"
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  Start session
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <div className="admin-empty-state">
          <h3>{searchPending ? 'Searching…' : activeFilterCount > 0 ? 'No matching members' : 'No members yet'}</h3>
          <p>{activeFilterCount > 0 ? 'Try a different name, email, or filter.' : 'Add your first member to get started.'}</p>
          {activeFilterCount > 0 && <button type="button" className="btn btn-outline" onClick={clearAllFilters}>Clear search & filters</button>}
          {members.length === 0 && activeFilterCount === 0 && !searchPending && (
            <a href="/admin/members/new" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Plus size={16} /> Add Member
            </a>
          )}
        </div>
      )}

      <PortalPagination
        page={currentPage}
        totalPages={totalPages}
        onChange={goToPage}
        label="Members pagination"
      />

      <BulkEmailModal
        open={showEmailModal}
        memberIds={selectedRows.map((m) => m.id)}
        onClose={() => setShowEmailModal(false)}
        onSent={(result) => {
          const hint = `Reported results for ${result.total} members: ${result.sent} emails sent, ${result.messagesCreated} portal messages created${result.errors.length > 0 ? ` (${result.errors.length} issues to review)` : ''}`;
          setBulkHint(hint);
          window.setTimeout(() => setBulkHint(null), 5000);
        }}
      />

      <BulkUpdateModal
        open={showUpdateModal}
        memberIds={selectedRows.map((m) => m.id)}
        programs={allAssignablePrograms}
        onClose={() => setShowUpdateModal(false)}
        onUpdated={(result) => {
          const hint = `Updated ${result.updated}/${result.total} members${result.errors.length > 0 ? ` (${result.errors.length} failed)` : ''}${result.warnings?.length ? ` (${result.warnings.length} follow-up warning${result.warnings.length === 1 ? '' : 's'})` : ''}`;
          setBulkHint(hint);
          window.setTimeout(() => setBulkHint(null), 5000);
          if (result.errors.length === 0) setSelectedIds(new Set());
          router.refresh();
        }}
      />

      {/* Confirmation dialog for quick bulk actions — shared pattern, see ConfirmDialog.tsx */}
      <ConfirmDialog
        open={!!confirmAction}
        title="Confirm bulk action"
        body={
          confirmAction ? (
            <>
              You are about to mark <strong>{confirmAction.count}</strong> member{confirmAction.count === 1 ? '' : 's'} as{' '}
              <strong>{confirmAction.type === 'enrolled' ? 'Enrolled' : 'Completed'}</strong>.
              This will update their pipeline stage.
            </>
          ) : (
            ''
          )
        }
        confirmLabel={bulkActionLoading ? 'Applying…' : 'Confirm'}
        busy={bulkActionLoading}
        onCancel={closeConfirmAction}
        onConfirm={async () => {
          if (!confirmAction) return;
          setBulkActionLoading(true);
          try {
            const res = await fetch('/api/admin/members/bulk-update', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                memberIds: selectedRows.map((m) => m.id),
                pipelineStage: confirmAction.type === 'enrolled' ? 'enrolled' : 'certified',
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setBulkHint(typeof data.error === 'string' ? data.error : 'Bulk action failed');
              window.setTimeout(() => setBulkHint(null), 5000);
              return;
            }
            const hint = `${confirmAction.type === 'enrolled' ? 'Marked as enrolled' : 'Marked as completed'}: ${data.updated}/${data.total} members${data.errors.length > 0 ? ` (${data.errors.length} failed)` : ''}`;
            setBulkHint(hint);
            window.setTimeout(() => setBulkHint(null), 5000);
            setSelectedIds(new Set());
            router.refresh();
          } catch {
            setBulkHint('Network error during bulk action');
            window.setTimeout(() => setBulkHint(null), 5000);
          } finally {
            setBulkActionLoading(false);
            setConfirmAction(null);
          }
        }}
      />
    </div>
  );
}
