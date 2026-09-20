'use client';

import Link from 'next/link';
import { JOB_READY_TRAINING_PCT } from '@/lib/member/trainingProgress';
import DataTable from '@/components/portal/ui/DataTable';
import { programDisplayTitle } from '@/lib/content/programTitle';

export type JobReadyRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  enrolledProgram: string | null;
  trainingPct: number;
  completedCount: number;
  totalCourses: number;
  interviewEligible: boolean;
};

export default function AdminJobReadyTable({ rows }: { rows: JobReadyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="admin-empty-state">
        <h3>No one is at {JOB_READY_TRAINING_PCT}%+ training yet</h3>
        <p>
          Members appear here once they complete {JOB_READY_TRAINING_PCT}% or more of their enrolled program. This is
          separate from Interview ready, which gates on pre-screening.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <DataTable
        variant="admin"
        tableClassName="admin-table"
        scrollX={false}
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'member',
            header: 'Member',
            cell: (r) => (
              <>
                <Link href={`/admin/members/${r.id}`}>{r.fullName}</Link>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{r.email}</div>
                {r.phone ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{r.phone}</div>
                ) : null}
              </>
            ),
          },
          { key: 'program', header: 'Program', cell: (r) => (r.enrolledProgram ? programDisplayTitle(r.enrolledProgram) : '—') },
          {
            key: 'training',
            header: 'Training progress',
            cell: (r) => (
              <>
                <strong>{r.trainingPct}%</strong>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  {r.completedCount}/{r.totalCourses} courses
                </div>
              </>
            ),
          },
          {
            key: 'prescreen',
            header: 'Pre-screening',
            cell: (r) =>
              r.interviewEligible ? (
                <span style={{ color: 'var(--color-success, #16a34a)' }}>Done</span>
              ) : (
                <span style={{ color: 'var(--color-on-surface-variant)' }}>Pending</span>
              ),
          },
          {
            key: 'actions',
            header: 'Actions',
            cell: (r) => (
              <Link href={`/admin/members/${r.id}`} className="btn btn-outline btn-sm">
                Open
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
