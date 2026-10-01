'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import DataTable from '@/components/portal/ui/DataTable';
import { csvCell } from '@/lib/csv/cells';

export type PlacementTableRow = {
  id: string;
  employerName: string;
  jobTitle: string;
  startDate: Date | string | null;
  startDateVerified: boolean;
  /** Unverified row the member created by confirming an offer themselves (see app/admin/placements/page.tsx). */
  memberReported?: boolean;
  salaryOffered: number | null;
  placedAt: Date | string;
  user: { id: string; fullName: string | null; email: string; enrolledProgram: string | null } | null;
};

type SortKey = 'member' | 'employer' | 'role' | 'start' | 'wage' | 'status';
type SortDir = 'asc' | 'desc';

function toTime(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const d = typeof value === 'string' ? new Date(value) : value;
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSalary(s: number | null): string {
  if (s == null) return '—';
  return `$${s.toLocaleString()}`;
}

function memberLabel(r: PlacementTableRow): string {
  return r.user ? (r.user.fullName ?? r.user.email) : '';
}

function comparePlacements(a: PlacementTableRow, b: PlacementTableRow, key: SortKey): number {
  switch (key) {
    case 'member':
      return memberLabel(a).localeCompare(memberLabel(b));
    case 'employer':
      return a.employerName.localeCompare(b.employerName);
    case 'role':
      return a.jobTitle.localeCompare(b.jobTitle);
    case 'start':
      return toTime(a.startDate) - toTime(b.startDate);
    case 'wage':
      return (a.salaryOffered ?? -1) - (b.salaryOffered ?? -1);
    case 'status':
      // Pending verification ranks before verified so default desc surfaces work to do.
      return Number(a.startDateVerified) - Number(b.startDateVerified);
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

function toIsoDate(value: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function buildPlacementsCsv(rows: PlacementTableRow[]): string {
  const header = ['Member', 'Email', 'Program', 'Employer', 'Role', 'Start date', 'Wage (USD)', 'Status', 'Placed at'];
  const lines = rows.map((r) =>
    [
      csvCell(r.user?.fullName ?? ''),
      csvCell(r.user?.email ?? ''),
      csvCell(r.user?.enrolledProgram ?? ''),
      csvCell(r.employerName),
      csvCell(r.jobTitle),
      csvCell(toIsoDate(r.startDate)),
      csvCell(r.salaryOffered ?? ''),
      r.startDateVerified ? 'verified' : r.memberReported ? 'member_reported_unverified' : 'pending_verification',
      csvCell(toIsoDate(r.placedAt)),
    ].join(',')
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}

export default function PlacementsTableClient({ placements }: { placements: PlacementTableRow[] }) {
  // null = keep the server's placedAt-desc order until a column is clicked.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return placements;
    const dir = sortDir === 'asc' ? 1 : -1;
    return placements
      .map((p, i) => [p, i] as const)
      .sort(([a, ia], [b, ib]) => {
        const primary = comparePlacements(a, b, sortKey) * dir;
        return primary !== 0 ? primary : ia - ib;
      })
      .map(([p]) => p);
  }, [placements, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text columns default ascending (A→Z); dates/wage/status default descending.
      setSortDir(key === 'member' || key === 'employer' || key === 'role' ? 'asc' : 'desc');
    }
  }

  const header = (label: string, key: SortKey) => (
    <SortHeader label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={onSort} />
  );

  function exportCsv() {
    const csv = buildPlacementsCsv(sorted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `placements-export-${sorted.length}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {sorted.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button type="button" className="btn btn-outline" onClick={exportCsv}>
            Export CSV ({sorted.length})
          </button>
        </div>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
      <DataTable
        variant="admin"
        tableClassName="admin-table"
        rows={sorted}
        rowKey={(r) => r.id}
        emptyState={
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            No placements recorded yet. When a member lands a job,{' '}
            <Link href="/admin/placements/new">record it</Link> so outcomes reporting stays
            accurate.
          </p>
        }
        columns={[
          {
            key: 'member',
            header: header('Member', 'member'),
            cell: (r) =>
              r.user ? (
                <Link href={`/admin/members/${r.user.id}`}>{r.user.fullName ?? r.user.email}</Link>
              ) : (
                '—'
              ),
          },
          { key: 'employer', header: header('Employer', 'employer'), cell: (r) => r.employerName },
          { key: 'role', header: header('Role', 'role'), cell: (r) => r.jobTitle },
          { key: 'start', header: header('Start date', 'start'), cell: (r) => formatDate(r.startDate) },
          {
            key: 'wage',
            header: header('Wage', 'wage'),
            align: 'right',
            cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatSalary(r.salaryOffered)}</span>,
          },
          {
            key: 'status',
            header: header('Status', 'status'),
            cell: (r) => {
              // Same tone pairs as the partners table status pill: success on
              // its soft fill once verified, gold (warning) on its soft fill
              // while pending. The member-reported state is the pending row
              // the member created themselves; it is spelled out so staff can
              // tell it from an employer- or counselor-created pending row.
              const verified = r.startDateVerified;
              const label = verified ? 'Verified' : r.memberReported ? 'Member-reported, unverified' : 'Pending verification';
              return (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    background: verified ? 'var(--wa-success-soft)' : 'var(--wa-gold-soft)',
                    color: verified ? 'var(--wa-success-dark)' : 'var(--wa-gold-dark)',
                  }}
                >
                  {label}
                </span>
              );
            },
          },
        ]}
      />
      </div>
    </div>
  );
}
