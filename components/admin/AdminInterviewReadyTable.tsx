'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import DataTable from '@/components/portal/ui/DataTable';

export type InterviewReadyRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  assessmentScorePct: number | null;
  interviewRequestedAt: Date | null;
  preScreening: {
    primaryGoal: string;
    weeklyHours: string;
    barrier: string;
    employmentStatus: string;
  } | null;
};

function mailtoSchedule(email: string, name: string) {
  const subject = encodeURIComponent(`WorkforceAP interview — ${name}`);
  const body = encodeURIComponent(
    `Hi ${name.split(' ')[0] || 'there'},\n\nI'd like to schedule your WorkforceAP interview.\n\n`
  );
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export default function AdminInterviewReadyTable({ rows }: { rows: InterviewReadyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const markInterviewed = async (id: string) => {
    setBusy(id);
    setMsg('');
    try {
      const res = await fetch(`/api/admin/members/${id}/interview`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_interviewed' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="admin-empty-state">
        <h3>No one in the interview queue</h3>
        <p>Members appear here after they complete pre-screening.</p>
      </div>
    );
  }

  return (
    <div>
      {msg && <p className="form-error" role="alert">{msg}</p>}
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
                </>
              ),
            },
            {
              key: 'score',
              header: 'Assessment %',
              align: 'right',
              cell: (r) => (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.assessmentScorePct ?? '—'}</span>
              ),
            },
            {
              key: 'prescreen',
              header: 'Pre-screening',
              cell: (r) =>
                r.preScreening ? (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                    <li>Goal: {r.preScreening.primaryGoal}</li>
                    <li>Time/wk: {r.preScreening.weeklyHours}</li>
                    <li>
                      Barrier: {r.preScreening.barrier.slice(0, 80)}
                      {r.preScreening.barrier.length > 80 ? '…' : ''}
                    </li>
                  </ul>
                ) : (
                  '—'
                ),
            },
            {
              key: 'request',
              header: 'Request',
              cell: (r) =>
                r.interviewRequestedAt ? new Date(r.interviewRequestedAt).toLocaleString() : 'Not requested',
            },
            {
              key: 'actions',
              header: 'Actions',
              cell: (r) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => mailtoSchedule(r.email, r.fullName)}
                  >
                    Schedule (email)
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy === r.id}
                    onClick={() => void markInterviewed(r.id)}
                  >
                    {busy === r.id ? '…' : 'Mark interviewed'}
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
