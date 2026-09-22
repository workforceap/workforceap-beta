'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AdminEmployerTierSelect from '@/app/admin/employers/AdminEmployerTierSelect';
import EmployerStatusButton from '@/app/admin/employers/EmployerStatusButton';
import OpenEmployerPortalButton from '@/app/admin/employers/OpenEmployerPortalButton';
import type { DataTableColumn } from '@/components/portal/ui/DataTable';
import DataTable from '@/components/portal/ui/DataTable';
import PortalPagination from '@/components/portal/PortalPagination';
import { statusColor } from '@/lib/ui/statusColors';

export type EmployerTableRow = {
  id: string;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  status: string;
  tier: string;
  placementAgreementSigned: boolean;
  hiringPipelineActive: boolean;
  user: { email: string; fullName: string | null; lastLoginAt: string | Date | null };
  _count: { jobs: number };
};

/** Whole days since an ISO/Date timestamp, or null if missing (never logged in). */
function daysSinceLogin(lastLoginAt: string | Date | null): number | null {
  if (!lastLoginAt) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(lastLoginAt).getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Dormant-employer visibility: green < 30d, amber 30-90d, red 90d+ or never
 * logged in. Sourced from lib/ui/statusColors (the single source of truth
 * for semantic status colors) instead of a one-off rgba palette.
 */
function lastActiveBadgeStyle(days: number | null): { background: string; color: string } {
  const tone =
    days === null ? statusColor('danger') : days < 30 ? statusColor('success') : days <= 90 ? statusColor('warning') : statusColor('danger');
  return { background: tone.bg, color: tone.fg };
}

function lastActiveLabel(days: number | null): string {
  if (days === null) return 'Never';
  return `${days}d ago`;
}

function getPartnershipTier(placementAgreementSigned: boolean, hiringPipelineActive: boolean): {
  label: string;
  color: string;
  bg: string;
} {
  if (placementAgreementSigned && hiringPipelineActive) {
    return { label: 'Strategic Hiring Partner', color: 'var(--wa-accent-text)', bg: 'var(--wa-accent-soft)' };
  }
  if (placementAgreementSigned) {
    return { label: 'Hiring Partner', color: '#a47f38', bg: 'rgba(164,127,56,0.14)' };
  }
  if (hiringPipelineActive) {
    return { label: 'Active Pipeline', color: 'var(--wa-success-dark)', bg: 'var(--wa-success-soft)' };
  }
  return { label: 'Standard', color: 'var(--color-on-surface-variant)', bg: 'var(--surface-container)' };
}

function statusBadgeStyle(status: string) {
  if (status === 'active') {
    return { background: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)' };
  }
  if (status === 'pending_approval') {
    return { background: 'var(--wa-gold-soft)', color: 'var(--wa-gold-dark)' };
  }
  return { background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' };
}

function statusLabel(status: string) {
  if (status === 'active') return 'Active';
  if (status === 'pending_approval') return 'Pending';
  return 'Inactive';
}

type SortKey = 'company' | 'contact' | 'status' | 'jobs' | 'tier' | 'partnership' | 'lastActive';
type SortDir = 'asc' | 'desc';

// Ascending status sort surfaces work to do first: pending → active → inactive.
const STATUS_RANK: Record<string, number> = { pending_approval: 0, active: 1, inactive: 2 };

// Strategic Hiring Partner (3) > Hiring Partner (2) > Active Pipeline (1) > Standard (0).
function partnershipRank(e: EmployerTableRow): number {
  return Number(e.placementAgreementSigned) * 2 + Number(e.hiringPipelineActive);
}

function compareEmployers(a: EmployerTableRow, b: EmployerTableRow, key: SortKey): number {
  switch (key) {
    case 'company':
      return (a.companyName ?? '').localeCompare(b.companyName ?? '');
    case 'contact':
      return (a.contactName ?? '').localeCompare(b.contactName ?? '');
    case 'status':
      return (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
    case 'jobs':
      return a._count.jobs - b._count.jobs;
    case 'tier':
      return a.tier.localeCompare(b.tier);
    case 'partnership':
      return partnershipRank(a) - partnershipRank(b);
    case 'lastActive': {
      // Never-logged-in employers rank as maximally stale (Infinity days).
      const aDays = daysSinceLogin(a.user.lastLoginAt) ?? Infinity;
      const bDays = daysSinceLogin(b.user.lastLoginAt) ?? Infinity;
      return aDays - bDays;
    }
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
      <span aria-hidden="true" style={{ fontSize: '0.7em', opacity: active ? 1 : 0.3 }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </button>
  );
}

export default function EmployersTableClient({
  employers,
  superAdmin,
  totalCount,
  currentPage,
  pageSize,
}: {
  employers: EmployerTableRow[];
  superAdmin: boolean;
  /** Total employers matching the active tab filter (for pagination), not just this page. */
  totalCount: number;
  currentPage: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // null = keep the server's companyName-asc order until a column is clicked.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const totalPages = Math.ceil(totalCount / pageSize);

  // Preserve existing query params (e.g. ?ui=legacy&status=...) when changing pages.
  function goToPage(page: number) {
    if (page < 1 || page > totalPages) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('page', page.toString());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const sorted = useMemo(() => {
    if (!sortKey) return employers;
    const dir = sortDir === 'asc' ? 1 : -1;
    // Stable sort with an index tiebreaker so equal keys keep the server order.
    return employers
      .map((e, i) => [e, i] as const)
      .sort(([a, ia], [b, ib]) => {
        const primary = compareEmployers(a, b, sortKey) * dir;
        return primary !== 0 ? primary : ia - ib;
      })
      .map(([e]) => e);
  }, [employers, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Text columns default ascending (A→Z); Jobs/Partnership default to highest first.
      setSortDir(key === 'jobs' || key === 'partnership' ? 'desc' : 'asc');
    }
  }

  const header = (label: string, key: SortKey) => (
    <SortHeader label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={onSort} />
  );

  const employerColumns: DataTableColumn<EmployerTableRow>[] = [
    {
      key: 'company',
      header: header('Company', 'company'),
      cell: (e) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '0.5rem',
              background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--wa-on-hero)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              flexShrink: 0,
            }}
          >
            {(e.companyName ?? '?')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <Link href={`/admin/employers/${e.id}`} style={{ color: 'var(--color-on-surface)', fontWeight: 700, textDecoration: 'none' }}>
            {e.companyName}
          </Link>
        </div>
      ),
    },
    {
      key: 'contact',
      header: header('Contact', 'contact'),
      cell: (e) => (
        <>
          <div style={{ fontSize: '0.875rem' }}>{e.contactName}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{e.contactEmail}</div>
        </>
      ),
    },
    {
      key: 'portalUser',
      header: 'Portal User',
      cell: (e) => (
        <>
          <div style={{ fontSize: '0.875rem' }}>{e.user.fullName}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{e.user.email}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: header('Status', 'status'),
      cell: (e) => {
        const style = statusBadgeStyle(e.status);
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.8125rem',
              background: style.background,
              color: style.color,
              fontWeight: 600,
            }}
          >
            {statusLabel(e.status)}
          </span>
        );
      },
    },
    {
      key: 'jobs',
      header: header('Jobs', 'jobs'),
      align: 'right',
      cell: (e) => (
        <span style={{ fontWeight: 700, color: 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums' }}>
          {e._count.jobs}
        </span>
      ),
    },
    {
      key: 'lastActive',
      header: header('Last Active', 'lastActive'),
      cell: (e) => {
        const days = daysSinceLogin(e.user.lastLoginAt);
        const style = lastActiveBadgeStyle(days);
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.8125rem',
              background: style.background,
              color: style.color,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {lastActiveLabel(days)}
          </span>
        );
      },
    },
    {
      key: 'tier',
      header: header('Tier', 'tier'),
      cell: (e) => <AdminEmployerTierSelect employerId={e.id} initialTier={e.tier} />,
    },
    {
      key: 'partnership',
      header: header('Partnership', 'partnership'),
      cell: (e) => {
        const pt = getPartnershipTier(e.placementAgreementSigned, e.hiringPipelineActive);
        return (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.8125rem',
              background: pt.bg,
              color: pt.color,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {pt.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (e) => <EmployerStatusButton employerId={e.id} status={e.status as 'active' | 'inactive' | 'pending_approval'} />,
    },
    ...(superAdmin
      ? ([
          {
            key: 'help',
            header: 'Help',
            cell: (e) => (
              <OpenEmployerPortalButton
                employerId={e.id}
                canOpenPortal={e.status === 'active'}
                disabledReason="Inactive employers cannot be opened in portal preview. Reactivate the employer first."
              />
            ),
          },
        ] satisfies DataTableColumn<EmployerTableRow>[])
      : []),
  ];

  return (
    <>
      <div className="wa-hidden md:wa-block employer-applications-shell" style={{ overflowX: 'auto' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table employer-applications-table"
          scrollX={false}
          rows={sorted}
          rowKey={(e) => e.id}
          columns={employerColumns}
        />
      </div>

      <PortalPagination
        page={currentPage}
        totalPages={totalPages}
        onChange={goToPage}
        label="Employers pagination"
      />
    </>
  );
}
