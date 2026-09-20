'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { Plus } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  PageOpener,
  DataTable,
  StatusTag,
  type Column,
  type KitTone,
} from '@/components/portal/kit';
import { ariaSortForColumn, useKitTableSort } from '@/components/portal/kit/kitTableSort';
import {
  DEFAULT_JOB_SORT_DIRECTION,
  DEFAULT_JOB_SORT_KEY,
  sortJobRows,
  type JobSortKey,
} from '@/lib/admin/jobsBoardSort';

/**
 * Jobs board — the admin job-posting queue rendered as a dense roster table.
 * Mockup: workforceap-admin-full.html "jobs" view.
 * Target route: /admin/jobs
 *
 * Columns: Role · Employer · Location · Wage · Applicants · Status.
 * Status is a StatusTag (Open=ok, Closing=warn, Pending=info, …). Wide table
 * collapses to stacked cards on mobile via DataTable mobile="cards".
 */

/** Display status mapped from the underlying JobStatusEnum. */
export type JobDisplayStatus =
  | 'Open'
  | 'Closing'
  | 'Pending'
  | 'Draft'
  | 'Filled'
  | 'Closed';

export interface JobRow {
  id: string;
  /** Role / job title. */
  role: string;
  employer: string;
  location: string;
  /** Pre-formatted wage range, e.g. "$72–88k" or "—". */
  wage: string;
  applicants: number;
  status: JobDisplayStatus;
}

export interface JobsBoardKitProps {
  jobs?: JobRow[];
  /** Total open roles (for the subtitle). */
  openRoles?: number;
  /** Distinct employers with open roles (for the subtitle). */
  employers?: number;
}

const DEFAULT_JOBS: JobRow[] = [
  {
    id: 'sf-admin',
    role: 'Salesforce Administrator',
    employer: 'Deloitte',
    location: 'Austin, TX',
    wage: '$72–88k',
    applicants: 14,
    status: 'Open',
  },
  {
    id: 'it-support',
    role: 'IT Support Specialist',
    employer: 'Dell',
    location: 'Round Rock',
    wage: '$58–70k',
    applicants: 9,
    status: 'Open',
  },
  {
    id: 'med-assistant',
    role: 'Medical Assistant',
    employer: "St. David's",
    location: 'Austin, TX',
    wage: '$48–55k',
    applicants: 22,
    status: 'Closing',
  },
];

const STATUS_TONE: Record<JobDisplayStatus, KitTone> = {
  Open: 'ok',
  Closing: 'warn',
  Pending: 'info',
  Draft: 'muted',
  Filled: 'ok',
  Closed: 'muted',
};

export function JobsBoardKit({
  jobs = DEFAULT_JOBS,
  openRoles = 127,
  employers = 48,
}: JobsBoardKitProps) {
  const router = useRouter();
  const { sortKey, sortDirection, sortHeader } = useKitTableSort<JobSortKey>(
    DEFAULT_JOB_SORT_KEY,
    DEFAULT_JOB_SORT_DIRECTION,
    ['role', 'employer', 'location'],
  );
  const sortedJobs = useMemo(
    () => sortJobRows(jobs, sortKey, sortDirection),
    [jobs, sortKey, sortDirection],
  );
  const subtitle = `${openRoles.toLocaleString()} open ${
    openRoles === 1 ? 'role' : 'roles'
  } across ${employers.toLocaleString()} ${employers === 1 ? 'employer' : 'employers'}`;

  const columns: Column<JobRow>[] = [
    {
      key: 'role',
      header: sortHeader('role', 'Role'),
      stickyLeft: true,
      minWidth: 180,
      ariaSort: ariaSortForColumn('role', sortKey, sortDirection),
      render: (row) => <span style={{ fontWeight: 700 }}>{row.role}</span>,
    },
    {
      key: 'employer',
      header: sortHeader('employer', 'Employer'),
      minWidth: 140,
      ariaSort: ariaSortForColumn('employer', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.employer}</span>,
    },
    {
      key: 'location',
      header: sortHeader('location', 'Location'),
      minWidth: 120,
      ariaSort: ariaSortForColumn('location', sortKey, sortDirection),
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.location}</span>,
    },
    {
      key: 'wage',
      header: sortHeader('wage', 'Wage'),
      align: 'right',
      minWidth: 88,
      ariaSort: ariaSortForColumn('wage', sortKey, sortDirection),
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {row.wage}
        </span>
      ),
    },
    {
      key: 'applicants',
      header: sortHeader('applicants', 'Applicants'),
      align: 'right',
      minWidth: 96,
      ariaSort: ariaSortForColumn('applicants', sortKey, sortDirection),
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
          {row.applicants}
        </span>
      ),
    },
    {
      key: 'status',
      header: sortHeader('status', 'Status'),
      minWidth: 96,
      ariaSort: ariaSortForColumn('status', sortKey, sortDirection),
      render: (row) => <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>,
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Jobs"
        kicker="Employers"
        lede={subtitle}
        action={
          <AstryxLink href="/admin/jobs?ui=legacy" as={NextLink as never} isStandalone>
            <Button
              label="Post Job"
              variant="primary"
              size="sm"
              icon={<Plus size={14} aria-hidden="true" />}
            />
          </AstryxLink>
        }
      />

      <DataTable<JobRow>
        columns={columns}
        rows={sortedJobs}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/admin/jobs/${row.id}`)}
        minWidth={820}
        mobile="cards"
        cardRender={(row) => (
          <Card padding={3}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
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
                  {row.role}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.employer} · {row.location}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>
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
                marginTop: 12,
              }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {row.wage}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-text)' }}>
                  {row.applicants}
                </b>{' '}
                applicants
              </span>
            </div>
          </Card>
        )}
        emptyTitle="No open roles"
        emptyDescription="Approved job postings will appear here once employers publish roles."
      />
    </DesignSurface>
  );
}
