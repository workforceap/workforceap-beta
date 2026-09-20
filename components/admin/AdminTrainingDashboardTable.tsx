'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TrainingDashboardRow } from '@/lib/admin/trainingDashboard';
import { programDisplayTitle } from '@/lib/content/programTitle';
import DataTable from '@/components/portal/ui/DataTable';

function formatDate(value: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatLastTouch(value: string | Date | null): string {
  if (!value) return 'No activity yet';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'No activity yet';
  const diffHours = Math.max(1, Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60)));
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function statusFor(row: TrainingDashboardRow): { label: string; color: string; bg: string } {
  if (row.totalCourses > 0 && row.completedCount >= row.totalCourses) {
    return { label: 'Complete', color: '#166534', bg: 'rgba(22,163,74,0.12)' };
  }
  if (row.staleTrainingDetectedAt) {
    return { label: 'Stale', color: '#991b1b', bg: 'rgba(220,38,38,0.12)' };
  }
  if (row.progressPercent > 0 || row.activeCourseCount > 0) {
    return { label: 'In progress', color: 'var(--wa-gold)', bg: 'rgba(164,127,56,0.14)' };
  }
  return { label: 'Not started', color: '#92400e', bg: 'rgba(245,158,11,0.12)' };
}

function formatCareerPlanStage(stage: NonNullable<TrainingDashboardRow['careerPlanSignal']>['stage']): string {
  return stage.replace(/_/g, ' ');
}

export default function AdminTrainingDashboardTable({ rows }: { rows: TrainingDashboardRow[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [program, setProgram] = useState('');

  // Multi-program-aware: build the program-filter dropdown from every program
  // each row carries (primary + secondary enrollments). Filtering then matches
  // a row if ANY of its program slugs equals the chosen program — so a member
  // enrolled in both `it-cyber` and `ai-software` shows up under either.
  const programs = useMemo(() => {
    const titleByPrimary = new Map(rows.map((row) => [row.enrolledProgram, row.programTitle]));
    const slugs = new Set<string>();
    for (const row of rows) {
      for (const slug of row.programSlugsAll) slugs.add(slug);
    }
    return [...slugs]
      .map((slug) => [slug, titleByPrimary.get(slug) ?? programDisplayTitle(slug)] as const)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    const rowStatus = statusFor(row).label.toLowerCase().replace(' ', '_');
    const matchesQuery = !q || row.fullName.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
    const matchesStatus = !status || rowStatus === status;
    const matchesProgram = !program || row.programSlugsAll.includes(program);
    return matchesQuery && matchesStatus && matchesProgram;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search member or email"
          aria-label="Search member or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '0.6rem', minWidth: '220px' }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by training status"
          style={{ padding: '0.6rem', minWidth: '170px' }}
        >
          <option value="">All training statuses</option>
          <option value="in_progress">In progress</option>
          <option value="not_started">Not started</option>
          <option value="stale">Stale</option>
          <option value="complete">Complete</option>
        </select>
        <select
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          aria-label="Filter by program"
          style={{ padding: '0.6rem', minWidth: '220px' }}
        >
          <option value="">All programs</option>
          {programs.map(([slug, title]) => (
            <option key={slug} value={slug}>
              {title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table"
          scrollX={false}
          rows={filtered}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'member',
              header: 'Member',
              cell: (row) => (
                <>
                  <Link href={`/admin/members/${row.id}`}>{row.fullName}</Link>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{row.email}</div>
                </>
              ),
            },
            {
              key: 'program',
              header: 'Program',
              cell: (row) => (
                <>
                  {row.programTitle}{' '}
                  {row.noProgram ? (
                    <span className="portal-badge portal-badge-warning">No program</span>
                  ) : null}
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {row.noProgram
                      ? 'Coursera progress saved; enrollment needed'
                      : `Enrolled ${formatDate(row.enrolledAt)}`}
                  </div>
                </>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => {
                const badge = statusFor(row);
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.8125rem',
                      fontWeight: 800,
                      color: badge.color,
                      background: badge.bg,
                    }}
                  >
                    {badge.label}
                  </span>
                );
              },
            },
            {
              key: 'progress',
              header: 'Progress',
              align: 'right',
              cell: (row) => (
                <>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.progressPercent}%</strong>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.completedCount}/{row.totalCourses} complete · {row.activeCourseCount} active
                  </div>
                </>
              ),
            },
            {
              key: 'touch',
              header: 'Last training touch',
              cell: (row) => formatLastTouch(row.lastTrainingActivityAt),
            },
            {
              key: 'career-plan',
              header: 'Career-plan signal',
              cell: (row) => {
                const signal = row.careerPlanSignal;
                if (!signal) return <span style={{ color: 'var(--color-on-surface-variant)' }}>—</span>;
                return (
                  <div style={{ maxWidth: 220 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '999px',
                        fontSize: '0.8125rem',
                        fontWeight: 800,
                        color: '#1d4ed8',
                        background: 'rgba(37,99,235,0.1)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {formatCareerPlanStage(signal.stage)}
                    </span>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.8125rem', fontWeight: 700 }}>
                      {signal.topCareerTitle ?? 'Career target pending'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {signal.typeLabel ?? 'Quiz type pending'}
                      {signal.selectedProgramSlug ? ` · ${signal.selectedProgramSlug}` : ''}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: '#92400e' }}>
                      {signal.staffAction}
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'partner',
              header: 'Partner / counselor',
              cell: (row) => (
                <>
                  <div>{row.partnerName ?? 'No partner'}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {row.counselorName ?? 'No counselor'}
                  </div>
                </>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              cell: (row) => (
                <Link href={`/admin/members/${row.id}`} className="btn btn-outline btn-sm">
                  Open
                </Link>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
