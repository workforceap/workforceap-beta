'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { JobPostingApplicationStatus } from '@prisma/client';
import EmployerApplicationChatClient from '@/components/portal/EmployerApplicationChatClient';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import DataTable from '@/components/portal/ui/DataTable';
import { employerApplicationsListHref, type EmployerApplicationsSort } from '@/lib/employer/employerApplicationsListQuery';
import { employerJobPostingApplicationStatusLabel } from '@/lib/employer/jobPostingApplicationStatus';

export type AppMsg = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  isFromEmployer: boolean;
};

export type EmployerApplicationRow = {
  id: string;
  jobId: string;
  status: string;
  appliedAt: string;
  employerNotes: string | null;
  job: { id: string; title: string };
  student: { id: string; fullName: string | null; email: string };
};

const STATUSES = ['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected'] as const satisfies readonly JobPostingApplicationStatus[];

const FILTER_CHIPS: { label: string; value: JobPostingApplicationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  ...STATUSES.map((value) => ({ label: employerJobPostingApplicationStatusLabel(value), value })),
];

export default function EmployerApplicationsClient({
  initialRows,
  activeStatusFilter,
  activeSort,
}: {
  initialRows: EmployerApplicationRow[];
  activeStatusFilter: JobPostingApplicationStatus | null;
  activeSort: EmployerApplicationsSort;
}) {
  const tCommon = useTranslations('common');
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<JobPostingApplicationStatus>('reviewing');
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, AppMsg[]>>({});
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRows(initialRows);
    setSelected(new Set());
  }, [initialRows]);

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    const ids = rows.map((r) => r.id);
    const allSel = ids.length > 0 && ids.every((id) => selected.has(id));
    if (allSel) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(ids));
  }, [rows, selected]);

  const patchStatus = useCallback(async (id: string, status: string) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch(`/api/employer/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Update failed');
        return false;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status: data.status ?? status,
                employerNotes: data.employerNotes ?? row.employerNotes,
              }
            : row
        )
      );
      return true;
    } catch (err) {
      setError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Update failed' }, 'employer-application-status'),
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }, [tCommon]);

  const applyBulkStatus = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of ids) {
        const worked = await patchStatus(id, bulkStatus);
        if (!worked) return;
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }, [bulkStatus, patchStatus, selected]);

  const toggleChat = useCallback(
    async (applicationId: string) => {
      if (openChatId === applicationId) {
        setOpenChatId(null);
        return;
      }

      setError(null);

      if (!chatMessages[applicationId]) {
        setChatLoadingId(applicationId);
        try {
          const r = await fetch(`/api/employer/applications/${applicationId}/messages`, {
            credentials: 'include',
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            setError(typeof data.error === 'string' ? data.error : 'Unable to load messages');
            return;
          }
          setChatMessages((prev) => ({ ...prev, [applicationId]: Array.isArray(data.messages) ? data.messages : [] }));
        } catch {
          setError('Unable to load messages');
          return;
        } finally {
          setChatLoadingId(null);
        }
      }

      setOpenChatId(applicationId);
    },
    [chatMessages, openChatId]
  );

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someVisibleSelected;
  }, [someVisibleSelected, rows]);

  if (rows.length === 0) {
    const filtered = !!activeStatusFilter;
    return (
      <div className="employer-applications-root">
        <div className="employer-applications-toolbar" role="search" aria-label="Filter applicants by hiring stage">
          <div className="employer-applications-toolbar__row">
            <div className="employer-applications-toolbar__filters">
              <span className="employer-applications-toolbar__eyebrow">
                <span className="material-symbols-outlined" aria-hidden>
                  tune
                </span>
                Pipeline stage
              </span>
              <div className="employer-applications-toolbar__chip-row">
                {FILTER_CHIPS.map((chip) => {
                  const isActive =
                    chip.value === 'all' ? activeStatusFilter == null : activeStatusFilter === chip.value;
                  return (
                    <Link
                      key={chip.label}
                      href={employerApplicationsListHref({
                        page: 1,
                        status: chip.value === 'all' ? undefined : chip.value,
                        sort: activeSort,
                      })}
                      className={`employer-applications-filter-chip${isActive ? ' is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {chip.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="employer-applications-toolbar__sort">
              <span id="employer-apps-sort-label-empty" className="employer-applications-toolbar__eyebrow">
                <span className="material-symbols-outlined" aria-hidden>
                  sort
                </span>
                Sort by applied date
              </span>
              <div className="employer-applications-sort-toggle" role="group" aria-labelledby="employer-apps-sort-label-empty">
                <Link
                  href={employerApplicationsListHref({ page: 1, status: activeStatusFilter ?? undefined, sort: 'applied_desc' })}
                  className={`employer-applications-sort-toggle__btn${activeSort === 'applied_desc' ? ' is-active' : ''}`}
                  aria-current={activeSort === 'applied_desc' ? 'true' : undefined}
                >
                  Newest
                </Link>
                <Link
                  href={employerApplicationsListHref({ page: 1, status: activeStatusFilter ?? undefined, sort: 'applied_asc' })}
                  className={`employer-applications-sort-toggle__btn${activeSort === 'applied_asc' ? ' is-active' : ''}`}
                  aria-current={activeSort === 'applied_asc' ? 'true' : undefined}
                >
                  Oldest
                </Link>
              </div>
            </div>
          </div>
        </div>
        <PortalEmptyState
          title={filtered ? 'No applicants match this filter' : 'No applications yet'}
          description={
            filtered
              ? 'Adjust the pipeline filter above or reset to view all applicants in your funnel.'
              : 'When candidates apply to your jobs, they will appear here with status and messaging.'
          }
          icon={<span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-on-surface-variant)' }} aria-hidden>badge</span>}
          primaryAction={
            filtered
              ? { label: 'Show all applicants', href: employerApplicationsListHref({ sort: activeSort }) }
              : { label: 'Post a role', href: '/employer/jobs/new' }
          }
        />
      </div>
    );
  }

  return (
    <div className="employer-applications-root">
      <div className="employer-applications-toolbar" role="search" aria-label="Filter applicants by hiring stage">
        <div className="employer-applications-toolbar__row">
          <div className="employer-applications-toolbar__filters">
            <span className="employer-applications-toolbar__eyebrow">
              <span className="material-symbols-outlined" aria-hidden>
                tune
              </span>
              Pipeline stage
            </span>
            <div className="employer-applications-toolbar__chip-row">
              {FILTER_CHIPS.map((chip) => {
                const isActive =
                  chip.value === 'all' ? activeStatusFilter == null : activeStatusFilter === chip.value;
                return (
                  <Link
                    key={chip.label}
                    href={employerApplicationsListHref({
                      page: 1,
                      status: chip.value === 'all' ? null : chip.value,
                      sort: activeSort,
                    })}
                    className={`employer-applications-filter-chip${isActive ? ' is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {chip.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="employer-applications-toolbar__sort">
            <span id="employer-apps-sort-label" className="employer-applications-toolbar__eyebrow">
              <span className="material-symbols-outlined" aria-hidden>
                sort
              </span>
              Sort by applied date
            </span>
            <div className="employer-applications-sort-toggle" role="group" aria-labelledby="employer-apps-sort-label">
              <Link
                href={employerApplicationsListHref({ page: 1, status: activeStatusFilter ?? undefined, sort: 'applied_desc' })}
                className={`employer-applications-sort-toggle__btn${activeSort === 'applied_desc' ? ' is-active' : ''}`}
                aria-current={activeSort === 'applied_desc' ? 'true' : undefined}
              >
                Newest
              </Link>
              <Link
                href={employerApplicationsListHref({ page: 1, status: activeStatusFilter ?? undefined, sort: 'applied_asc' })}
                className={`employer-applications-sort-toggle__btn${activeSort === 'applied_asc' ? ' is-active' : ''}`}
                aria-current={activeSort === 'applied_asc' ? 'true' : undefined}
              >
                Oldest
              </Link>
            </div>
          </div>
        </div>
        <p className="employer-applications-toolbar__hint">
          <span className="material-symbols-outlined employer-applications-toolbar__hint-icon" aria-hidden>
            info
          </span>
          Select rows to update several candidates at once. Prefer the row dropdown for precise one-off edits.
        </p>
      </div>

      {selected.size > 0 ? (
        <div className="employer-applications-bulk-bar" role="region" aria-label="Bulk update pipeline stages">
          <div className="employer-applications-bulk-bar__lead">
            <span className="employer-applications-bulk-bar__count">{selected.size}</span>
            <span className="employer-applications-bulk-bar__label">selected · set stage for all selected applicants</span>
          </div>
          <div className="employer-applications-bulk-bar__controls">
            <label className="employer-applications-bulk-bar__select-label wa-sr-only" htmlFor="employer-apps-bulk-status">
              Bulk status
            </label>
            <select
              id="employer-apps-bulk-status"
              className="employer-applications-bulk-bar__select"
              value={bulkStatus}
              disabled={bulkBusy}
              onChange={(e) => setBulkStatus(e.target.value as JobPostingApplicationStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {employerJobPostingApplicationStatusLabel(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm employer-applications-bulk-bar__apply"
              disabled={bulkBusy}
              onClick={() => void applyBulkStatus()}
            >
              {bulkBusy ? 'Updating…' : 'Apply stage'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="employer-applications-shell">
        {error ? (
          <p className="employer-apps-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="employer-applications-table-wrap">
          <DataTable
            variant="admin"
            tableClassName="admin-table employer-applications-table employer-applications-table--responsive"
            scrollX={true}
            className="employer-applications-data-table-scroll"
            rows={rows}
            rowKey={(app) => app.id}
            renderSubRow={(app) => {
              const isChatOpen = openChatId === app.id;
              if (!isChatOpen) return null;
              const studentName = app.student.fullName?.trim() || app.student.email;
              const initialMessages = chatMessages[app.id] ?? [];
              return (
                <div
                  id={`employer-chat-${app.id}`}
                  className="employer-applications-chat-shell"
                  style={{
                    border: '1px solid var(--outline-variant)',
                    borderRadius: '0.875rem',
                    overflow: 'hidden',
                    background: 'var(--surface-container-lowest)',
                    minHeight: '28rem',
                  }}
                >
                  <EmployerApplicationChatClient
                    applicationId={app.id}
                    studentName={studentName}
                    jobTitle={app.job.title}
                    initialMessages={initialMessages}
                  />
                </div>
              );
            }}
            subRowTdStyle={{ padding: '0 0 1rem', verticalAlign: 'top', borderBottom: '1px solid var(--outline-variant)' }}
            columns={[
              {
                key: 'candidate',
                cellDataLabel: 'Candidate',
                header: (
                  <div className="employer-applications-th-candidate">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="employer-applications-row-check"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select every applicant visible on this page"
                    />
                    <span>Candidate</span>
                  </div>
                ),
                stickyLeft: true,
                columnClassName: 'employer-applications-col-candidate',
                cell: (app) => {
                  const studentName = app.student.fullName?.trim() || app.student.email;
                  const checked = selected.has(app.id);
                  return (
                    <div className="employer-applications-candidate-cell">
                      <input
                        type="checkbox"
                        className="employer-applications-row-check"
                        checked={checked}
                        disabled={busyId === app.id}
                        onChange={(e) => toggleOne(app.id, e.target.checked)}
                        aria-label={`Select applicant ${studentName}`}
                      />
                      <div
                        className="employer-applications-candidate-cell__avatar"
                        aria-hidden
                      >
                        {(studentName ?? '?')
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="employer-applications-candidate-cell__text">
                        <Link
                          href={`/employer/candidates/${app.student.id}?jobId=${encodeURIComponent(app.jobId)}`}
                          className="employer-applications-candidate-cell__name"
                        >
                          {studentName}
                        </Link>
                        <div className="employer-applications-candidate-cell__email">{app.student.email}</div>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'job',
                header: 'Job',
                hideOnMobile: true,
                cellDataLabel: 'Job',
                cell: (app) => (
                  <Link href={`/employer/jobs/${app.job.id}`} className="employer-applications-job-link">
                    {app.job.title}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Pipeline',
                align: 'left',
                cellDataLabel: 'Pipeline stage',
                cell: (app) => {
                  const studentName = app.student.fullName?.trim() || app.student.email;
                  return (
                    <select
                      className="employer-app-status-select"
                      value={app.status}
                      disabled={busyId === app.id}
                      onChange={(e) => void patchStatus(app.id, e.target.value)}
                      aria-label={`Pipeline stage for ${studentName}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {employerJobPostingApplicationStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                  );
                },
              },
              {
                key: 'applied',
                header: 'Applied',
                hideOnMobile: true,
                align: 'right',
                cellDataLabel: 'Applied',
                cell: (app) => (
                  <time className="employer-applications-applied-meta" dateTime={app.appliedAt}>
                    {new Date(app.appliedAt).toLocaleDateString()}
                  </time>
                ),
              },
              {
                key: 'message',
                header: 'Contact',
                align: 'center',
                cellDataLabel: 'Messages',
                cell: (app) => {
                  const isChatOpen = openChatId === app.id;
                  const isChatLoading = chatLoadingId === app.id;
                  return (
                    <button
                      type="button"
                      className={`employer-applications-msg-btn${isChatOpen ? ' is-open' : ''}`}
                      onClick={() => void toggleChat(app.id)}
                      disabled={isChatLoading}
                      aria-expanded={isChatOpen}
                      aria-controls={`employer-chat-${app.id}`}
                    >
                      <span className="material-symbols-outlined employer-applications-msg-btn__ico" aria-hidden>
                        forum
                      </span>
                      {isChatLoading ? '…' : isChatOpen ? 'Close' : 'Message'}
                    </button>
                  );
                },
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
