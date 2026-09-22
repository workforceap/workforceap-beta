'use client';
import { formatPortalDateTime } from '@/lib/formatDate';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import DataTable from '@/components/portal/ui/DataTable';
import { StatusTag } from '@/components/portal/kit';
import { badgeVariantToKitTone } from '@/lib/ui/statusToneAdapters';
import type { BadgeVariant } from '@/components/portal/StatusBadge';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import type { EnrollmentPipelineRow, EnrollmentSignal } from '@/lib/admin/courseraEnrollmentPipeline';
import { hasRecentCourseraActivity } from '@/lib/admin/courseraEnrollmentEvidence';

const SIGNAL_CONFIG: Record<EnrollmentSignal, { label: string; variant: BadgeVariant }> = {
  not_approved: { label: 'Not approved', variant: 'neutral' },
  approved_not_started: { label: 'Approved — no activity observed', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
  stalled: { label: 'No recent activity', variant: 'error' },
  activity_unknown: { label: 'Activity date unknown', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'accent' },
};

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  // Fixed locale + timezone: server and client render the same text (hydration).
  return formatPortalDateTime(value);
}

type EnrollResult = { ok: boolean; text: string };

export default function CourseraEnrollmentPipelineTable({
  initialRows,
  programs,
}: {
  initialRows: EnrollmentPipelineRow[];
  programs: Array<{ slug: string; title: string }>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [programFilter, setProgramFilter] = useState<string>('all');
  const [signalFilter, setSignalFilter] = useState<'all' | EnrollmentSignal>('all');
  const [search, setSearch] = useState('');

  const [approvePendingId, setApprovePendingId] = useState<string | null>(null);
  const [confirmApproveRow, setConfirmApproveRow] = useState<EnrollmentPipelineRow | null>(null);
  const [confirmEnrollRow, setConfirmEnrollRow] = useState<EnrollmentPipelineRow | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [rowMessages, setRowMessages] = useState<Record<string, EnrollResult>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkApprove, setConfirmBulkApprove] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/coursera/enrollment-pipeline');
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const data = (await res.json()) as { rows: EnrollmentPipelineRow[] };
      setRows(data.rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not refresh the pipeline.');
    } finally {
      setLoading(false);
    }
  }

  async function submitApprove(row: EnrollmentPipelineRow, next: boolean) {
    setApprovePendingId(row.memberId);
    setRowErrors((prev) => ({ ...prev, [row.memberId]: '' }));
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(row.memberId)}/coursera-enrollment-approval`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: next }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setRowErrors((prev) => ({ ...prev, [row.memberId]: payload.error ?? 'Could not update. Please try again.' }));
        return;
      }
      await refresh();
    } catch {
      setRowErrors((prev) => ({ ...prev, [row.memberId]: 'Could not reach the server.' }));
    } finally {
      setApprovePendingId(null);
      setConfirmApproveRow(null);
    }
  }

  function handleApproveToggle(row: EnrollmentPipelineRow) {
    if (!row.approved) {
      // Granting approval spends a seat the first time the member enrolls —
      // confirm once, same guardrail as the member-detail toggle.
      setConfirmApproveRow(row);
      return;
    }
    void submitApprove(row, false);
  }

  async function enrollNow(row: EnrollmentPipelineRow) {
    setEnrollingId(row.memberId);
    setRowMessages((prev) => {
      const next = { ...prev };
      delete next[row.memberId];
      return next;
    });
    try {
      const res = await fetch('/api/admin/coursera/enroll-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: row.memberId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        courseName?: string;
        error?: string;
      };
      if (!res.ok) {
        setRowMessages((prev) => ({
          ...prev,
          [row.memberId]: { ok: false, text: payload.error ?? 'Enrollment failed. Try again.' },
        }));
        return;
      }
      const text =
        payload.status === 'invited'
          ? `Invite sent — ${row.memberName} will get an email to join, then courses unlock.`
          : payload.status === 'already-enrolled'
            ? `Already enrolled${payload.courseName ? ` in ${payload.courseName}` : ''}.`
            : `Enrolled${payload.courseName ? ` in ${payload.courseName}` : ''}.`;
      setRowMessages((prev) => ({ ...prev, [row.memberId]: { ok: true, text } }));
      await refresh();
    } catch {
      setRowMessages((prev) => ({ ...prev, [row.memberId]: { ok: false, text: 'Could not reach the server.' } }));
    } finally {
      setEnrollingId(null);
      setConfirmEnrollRow(null);
    }
  }

  const filteredRows = useMemo(() => {
    let list = rows;
    if (programFilter !== 'all') list = list.filter((r) => r.programSlug === (programFilter === '__unassigned__' ? '' : programFilter));
    if (signalFilter !== 'all') list = list.filter((r) => {
      if (signalFilter === 'not_approved') return !r.approved;
      if (signalFilter === 'active') return hasRecentCourseraActivity(r.lastActivityAt, new Date());
      return r.signal === signalFilter;
    });
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.memberName.toLowerCase().includes(q) || r.memberEmail.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, programFilter, signalFilter, search]);

  const filteredIds = useMemo(() => filteredRows.map((r) => r.memberId), [filteredRows]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleOne(memberId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  }

  async function submitBulkApprove() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkPending(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await fetch('/api/admin/coursera/members/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: ids, approved: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        processedCount?: number;
        failedCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setBulkError(payload.error ?? 'Bulk approval failed. Please try again.');
        return;
      }
      setBulkResult(
        `Approved ${payload.processedCount ?? ids.length} member${(payload.processedCount ?? ids.length) === 1 ? '' : 's'}${
          payload.failedCount ? `, ${payload.failedCount} failed` : ''
        }.`,
      );
      setSelected(new Set());
      await refresh();
    } catch {
      setBulkError('Could not reach the server.');
    } finally {
      setBulkPending(false);
      setConfirmBulkApprove(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        className="content-card"
        style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search by name or email"
          style={{
            flex: 1,
            minWidth: '12rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
            color: 'inherit',
            fontSize: '0.85rem',
          }}
        />
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          aria-label="Filter by program"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
            color: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          <option value="all">All programs</option>
          {programs.map((p) => (
            <option key={p.slug} value={p.slug || '__unassigned__'}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          value={signalFilter}
          onChange={(e) => setSignalFilter(e.target.value as 'all' | EnrollmentSignal)}
          aria-label="Filter by enrollment signal"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
            color: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          <option value="all">All signals</option>
          {(Object.keys(SIGNAL_CONFIG) as EnrollmentSignal[]).map((s) => (
            <option key={s} value={s}>
              {SIGNAL_CONFIG[s].label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-muted btn-sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loadError ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--wa-accent-text)' }}>
          {loadError}
        </p>
      ) : null}

      <div
        className="content-card"
        style={{ padding: '0.6rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} disabled={filteredIds.length === 0} />
          {selected.size > 0 ? `${selected.size} selected` : 'Select all shown'}
        </label>
        {selected.size > 0 ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setConfirmBulkApprove(true)}
            style={{ fontSize: '0.8125rem', padding: '0.3rem 0.7rem' }}
          >
            Approve {selected.size} selected
          </button>
        ) : null}
      </div>
      {bulkResult ? (
        <p role="status" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-success, #166534)' }}>
          {bulkResult}
        </p>
      ) : null}

      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>
        Showing {filteredRows.length} of {rows.length} member{rows.length === 1 ? '' : 's'}
      </p>

      <DataTable
        density="compact"
        rows={filteredRows}
        rowKey={(row) => row.memberId}
        emptyState={
          <div style={{ padding: '1rem', display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
              No members match the current search / program / signal filters.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearch('');
                setProgramFilter('all');
                setSignalFilter('all');
              }}
            >
              Clear filters
            </button>
          </div>
        }
        columns={[
          {
            key: 'member',
            header: 'Member',
            cell: (row) => (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selected.has(row.memberId)}
                  onChange={() => toggleOne(row.memberId)}
                  aria-label={`Select ${row.memberName}`}
                  style={{ marginTop: '0.2rem', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                  <Link href={`/admin/members/${row.memberId}`} style={{ fontWeight: 600 }}>
                    {row.memberName}
                  </Link>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{row.memberEmail}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'program',
            header: 'Program',
            cell: (row) => row.programTitle,
          },
          {
            key: 'approved',
            header: 'Approved?',
            cell: (row) => (
              <div>
                <span style={{ fontWeight: 600, color: row.approved ? 'var(--wa-success-dark)' : 'var(--color-on-surface-variant)' }}>
                  {row.approved ? 'Yes' : 'No'}
                </span>
                {row.approved && row.approvedAt ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {fmtDateTime(row.approvedAt)}
                    {row.approvedByName ? ` by ${row.approvedByName}` : ''}
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            key: 'signal',
            header: 'Observed learning',
            cell: (row) => (
              <div>
                <StatusTag tone={badgeVariantToKitTone(SIGNAL_CONFIG[row.signal].variant)}>{SIGNAL_CONFIG[row.signal].label}</StatusTag>
                {row.hasEnrollmentReceipt ? <div style={{ fontSize: '0.8125rem' }}>Enrollment receipt recorded</div> : null}
                {row.lastActivityAt ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.2rem' }}>
                    last activity {fmtDateTime(row.lastActivityAt)}
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            cell: (row) => {
              const isApprovePending = approvePendingId === row.memberId;
              const isEnrolling = enrollingId === row.memberId;
              const message = rowMessages[row.memberId];
              const error = rowErrors[row.memberId];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '10rem' }}>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={row.approved ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm'}
                      disabled={isApprovePending}
                      onClick={() => handleApproveToggle(row)}
                      style={{ fontSize: '0.8125rem', padding: '0.3rem 0.6rem' }}
                    >
                      {isApprovePending ? 'Working…' : row.approved ? 'Revoke' : 'Approve'}
                    </button>
                    {row.approved ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isEnrolling || !row.programSlug}
                        onClick={() => setConfirmEnrollRow(row)}
                        style={{ fontSize: '0.8125rem', padding: '0.3rem 0.6rem' }}
                      >
                        {isEnrolling ? 'Enrolling…' : 'Enroll now'}
                      </button>
                    ) : null}
                  </div>
                  {message ? (
                    <span
                      role={message.ok ? 'status' : 'alert'}
                      style={{ fontSize: '0.8125rem', color: message.ok ? 'var(--color-success, #166534)' : 'var(--color-error, #c83232)' }}
                    >
                      {message.text}
                    </span>
                  ) : null}
                  {error ? (
                    <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-error, #c83232)' }}>
                      {error}
                    </span>
                  ) : null}
                </div>
              );
            },
          },
        ]}
      />

      <ConfirmDialog
        open={confirmApproveRow != null}
        title="Approve Coursera enrollment?"
        body={
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'pre-line' }}>
            {`Approve ${confirmApproveRow?.memberName ?? 'this member'} for Coursera enrollment?\n\nThis lets them self-enroll in their assigned program's courses. Each enrollment uses a paid Coursera seat. Only approve once funding is confirmed and a counselor has assigned a program.`}
          </p>
        }
        confirmLabel="Approve"
        busy={approvePendingId === confirmApproveRow?.memberId}
        onConfirm={() => {
          if (confirmApproveRow) void submitApprove(confirmApproveRow, true);
        }}
        onCancel={() => setConfirmApproveRow(null)}
      />
      <ConfirmDialog
        open={confirmEnrollRow != null}
        title="Enroll this member in Coursera now?"
        body={
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'pre-line' }}>
            {`Enroll ${confirmEnrollRow?.memberName ?? 'this member'} in their assigned program's first course?\n\nIf they're not on Coursera yet, this sends the program invite (they'll get an email). Enrollment uses a paid Coursera seat and is recorded in the audit log.`}
          </p>
        }
        confirmLabel="Enroll now"
        busy={enrollingId === confirmEnrollRow?.memberId}
        onConfirm={() => {
          if (confirmEnrollRow) void enrollNow(confirmEnrollRow);
        }}
        onCancel={() => setConfirmEnrollRow(null)}
      />
      <ConfirmDialog
        open={confirmBulkApprove}
        title={`Approve ${selected.size} member${selected.size === 1 ? '' : 's'} for Coursera enrollment?`}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              This lets each selected member self-enroll in their assigned program&apos;s courses. Each enrollment uses a
              paid Coursera seat. Only approve once funding is confirmed and a counselor has assigned a program.
            </p>
            {bulkError ? (
              <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-error, #c83232)' }}>
                {bulkError}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Approve"
        busy={bulkPending}
        onConfirm={() => void submitBulkApprove()}
        onCancel={() => {
          if (!bulkPending) setConfirmBulkApprove(false);
        }}
      />
    </div>
  );
}
