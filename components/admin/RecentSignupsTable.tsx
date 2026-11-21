'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { programDisplayTitle } from '@/lib/content/programTitle';
import DataTable from '@/components/portal/ui/DataTable';

type RecentUser = {
  id: string;
  fullName: string | null;
  email: string;
  enrolledProgram: string | null;
  enrolledAt: Date | string | null;
  assessmentScorePct: number | null;
  assessmentCompleted: boolean | null;
};

type RecentSignupsTableProps = {
  users: RecentUser[];
};

export default function RecentSignupsTable({ users }: RecentSignupsTableProps) {
  const router = useRouter();

  return (
    <div style={{ overflowX: 'auto' }}>
      <DataTable
        variant="admin"
        tableClassName="admin-table"
        scrollX={false}
        rows={users}
        rowKey={(u) => u.id}
        getRowProps={(u) => ({
          onClick: () => router.push(`/admin/members/${u.id}`),
          style: { cursor: 'pointer' },
        })}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (u) => (
              <Link href={`/admin/members/${u.id}`} onClick={(e) => e.stopPropagation()}>
                {u.fullName}
              </Link>
            ),
          },
          { key: 'email', header: 'Email', cell: (u) => u.email },
          {
            key: 'program',
            header: 'Program',
            cell: (u) =>
              u.enrolledProgram ? programDisplayTitle(u.enrolledProgram) : '—',
          },
          {
            key: 'enrolled',
            header: 'Enrolled',
            cell: (u) => (u.enrolledAt ? new Date(u.enrolledAt).toLocaleDateString() : '—'),
          },
          {
            key: 'score',
            header: 'Points score % (legacy)',
            cell: (u) => (
              <span
                className={
                  u.assessmentScorePct != null
                    ? u.assessmentScorePct >= 70
                      ? 'admin-score-high'
                      : u.assessmentScorePct >= 50
                        ? 'admin-score-mid'
                        : 'admin-score-low'
                    : ''
                }
              >
                {u.assessmentScorePct ?? '—'}%
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (u) => (u.assessmentCompleted ? 'Assessed' : 'Pending'),
          },
        ]}
      />
    </div>
  );
}
