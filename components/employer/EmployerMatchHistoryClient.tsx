'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { employerMatchPipelineLabel } from '@/lib/employer/aiMatchPipelineLabels';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import { DataTable, Avatar, type Column, type KitColor } from '@/components/portal/kit';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';

export type EmployerMatchHistoryRow = {
  id: string;
  jobId: string;
  studentId: string;
  status: string;
  matchScore: number;
  createdAt: string;
  statusUpdatedAt: string | null;
  job: { id: string; title: string };
  student: { id: string; fullName: string };
  applicationId: string | null;
};

const STATUSES = [
  'suggested',
  'employer_notified',
  'student_notified',
  'contacted',
  'interviewing',
  'hired',
  'rejected',
] as const;

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Fit-score band color, mirrors EmployerHomeKit's candidate-pipeline fit column. */
function fitScoreColor(pct: number): KitColor {
  if (pct >= 85) return 'success';
  if (pct >= 70) return 'gold';
  if (pct >= 60) return 'accent';
  return 'muted';
}

function FitBadge({ pct }: { pct: number }) {
  const color = fitScoreColor(pct);
  const varName =
    color === 'success' ? 'var(--wa-success)' : color === 'gold' ? 'var(--wa-gold)' : color === 'accent' ? 'var(--wa-accent)' : 'var(--wa-muted)';
  if (pct < 60) {
    return <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-muted)' }}>Possible fit</span>;
  }
  return (
    <span style={{ fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: varName }}>{pct}%</span>
  );
}

const STATUS_UPDATE_FAILED = 'Could not update this candidate\u2019s status. Please try again.';

function StatusSelect({
  value,
  disabled,
  studentName,
  onChange,
}: {
  value: string;
  disabled: boolean;
  studentName: string;
  onChange: (next: string) => void;
}) {
  return (
    <select
      className="wa-kit-focus"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Status for ${studentName}`}
      style={{
        minWidth: '9.5rem',
        fontSize: 13,
        border: '1px solid var(--wa-border)',
        borderRadius: 'var(--wa-radius-sm)',
        padding: '7px 10px',
        background: 'var(--wa-surface)',
        color: 'var(--wa-text)',
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {employerMatchPipelineLabel(s)}
        </option>
      ))}
    </select>
  );
}

export default function EmployerMatchHistoryClient({ initialRows }: { initialRows: EmployerMatchHistoryRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tCommon = useTranslations('common');
  const connectionCopy = tCommon('connectionError');

  const patchStatus = useCallback(async (jobId: string, studentId: string, matchId: string, status: string) => {
    setBusyId(matchId);
    setError(null);
    try {
      const r = await fetch(`/api/employer/jobs/${jobId}/matches/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // A server rejection is JSON `{ error }`; a non-JSON answer falls
      // through to the stable sentence.
      const data = (await r.json().catch(() => ({}))) as { error?: unknown; status?: string; statusUpdatedAt?: string };
      if (!r.ok) {
        setError(typeof data.error === 'string' && data.error.trim() ? data.error : STATUS_UPDATE_FAILED);
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === matchId
            ? {
                ...row,
                status: data.status ?? status,
                statusUpdatedAt: data.statusUpdatedAt ?? new Date().toISOString(),
              }
            : row
        )
      );
    } catch (err) {
      // Before this catch a dropped connection escaped as an unhandled
      // rejection: the select re-enabled and the employer read nothing.
      setError(requestFailureMessage(err, { connection: connectionCopy, fallback: STATUS_UPDATE_FAILED }, 'employer-match-status'));
    } finally {
      setBusyId(null);
    }
  }, [connectionCopy]);

  if (rows.length === 0) {
    return (
      <div className="wa-kit-card">
        <KitEmptyState
          headingAs="h2"
          title="No suggested candidates yet"
          description="When WorkforceAP matches members to your open roles, they will appear here with match scores and pipeline status."
          action={
            <Link href="/employer/jobs/new" className="wa-kit-cta">
              Post your first job <ArrowRight size={14} aria-hidden />
            </Link>
          }
        />
      </div>
    );
  }

  const columns: Column<EmployerMatchHistoryRow>[] = [
    {
      key: 'candidate',
      header: 'Candidate',
      render: (row) => (
        <Link
          href={`/employer/candidates/${row.studentId}?jobId=${encodeURIComponent(row.jobId)}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
        >
          <Avatar initials={initialsFor(row.student.fullName)} size={30} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-accent)' }}>{row.student.fullName}</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600 }}>{row.job.title}</div>
          </div>
        </Link>
      ),
    },
    {
      key: 'fit',
      header: 'Fit',
      align: 'right',
      render: (row) => <FitBadge pct={matchScoreAsPercent(row.matchScore)} />,
    },
    {
      key: 'status',
      header: 'Your status',
      render: (row) => (
        <StatusSelect
          value={row.status}
          disabled={busyId === row.id}
          studentName={row.student.fullName}
          onChange={(next) => void patchStatus(row.jobId, row.studentId, row.id, next)}
        />
      ),
    },
    {
      key: 'updated',
      header: 'Last update',
      align: 'right',
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {new Date(row.statusUpdatedAt ?? row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'application',
      header: 'Application',
      align: 'right',
      render: (row) =>
        row.applicationId ? (
          <Link href={`/employer/applications/${encodeURIComponent(row.applicationId)}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)' }}>
            Open
          </Link>
        ) : (
          <span style={{ color: 'var(--wa-muted)' }}>—</span>
        ),
    },
  ];

  return (
    <div className="wa-space-y-3">
      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '0.75rem 1rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-accent-soft)',
            color: 'var(--wa-accent)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error}
        </p>
      ) : null}
      <DataTable<EmployerMatchHistoryRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        mobile="cards"
        minWidth={640}
        cardRender={(row) => (
          <div className="wa-kit-card wa-kit-card--sm">
            <div className="wa-flex wa-items-start wa-justify-between wa-gap-3">
              <Link
                href={`/employer/candidates/${row.studentId}?jobId=${encodeURIComponent(row.jobId)}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 0 }}
              >
                <Avatar initials={initialsFor(row.student.fullName)} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--wa-text)' }}>{row.student.fullName}</div>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 1 }}>{row.job.title}</div>
                </div>
              </Link>
              <FitBadge pct={matchScoreAsPercent(row.matchScore)} />
            </div>
            <div className="wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-2" style={{ marginTop: 12 }}>
              <StatusSelect
                value={row.status}
                disabled={busyId === row.id}
                studentName={row.student.fullName}
                onChange={(next) => void patchStatus(row.jobId, row.studentId, row.id, next)}
              />
              {row.applicationId ? (
                <Link
                  href={`/employer/applications/${encodeURIComponent(row.applicationId)}`}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)' }}
                >
                  Open application
                </Link>
              ) : null}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
              Updated {new Date(row.statusUpdatedAt ?? row.createdAt).toLocaleString()}
            </div>
          </div>
        )}
        emptyTitle="No suggested candidates yet"
      />
    </div>
  );
}
