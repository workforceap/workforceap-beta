'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { JOB_APPLICATION_STATUS_KEYS, jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
import EmployerApplicationChatClient from '@/components/portal/EmployerApplicationChatClient';
import { ListFilter } from 'lucide-react';
import { StatusTag, type KitTone } from '@/components/portal/kit';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { employerApplicationsListHref } from '@/lib/employer/employerApplicationsListQuery';
import type { AppMsg, EmployerApplicationRow } from './EmployerApplicationsClient';

const STATUS_CHIP_FILTERS = [
  { label: 'All', value: 'all' },
  ...JOB_APPLICATION_STATUS_KEYS.map((value) => ({ label: jobApplicationStatusLabel(value, 'employer'), value })),
];

const STATUS_ACTIONS: Record<string, string[]> = {
  pending: ['reviewing'],
  reviewing: ['interview', 'rejected'],
  interview: ['offered', 'rejected'],
  offered: ['hired', 'rejected'],
  hired: [],
  rejected: [],
};

/** Application status → kit tone (guide §4): rejected is a failed state, so it reads kit `danger`. */
function statusTone(status: string): KitTone {
  if (status === 'hired') return 'ok';
  if (status === 'rejected') return 'danger';
  if (status === 'pending') return 'alert';
  if (status === 'reviewing') return 'warn';
  if (status === 'interview' || status === 'offered') return 'info';
  return 'muted';
}

/** Employer words from the one job-application vocabulary; also labels the move-to buttons. */
function applicationStatusLabel(status: string): string {
  return jobApplicationStatusLabel(status, 'employer');
}

function initials(name: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function MobileApplicationsClient({
  initialRows,
  activeStatusFilter = null,
}: {
  initialRows: EmployerApplicationRow[];
  /** The `?status=` filter the page already applied server-side, so zero rows can be named honestly. */
  activeStatusFilter?: string | null;
}) {
  const tCommon = useTranslations('common');
  const tEmpty = useTranslations('empty');
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, AppMsg[]>>({});
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: data.status ?? status } : row
        )
      );
    } catch (err) {
      setError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Update failed' }, 'employer-application-status'),
      );
    } finally {
      setBusyId(null);
    }
  }, [tCommon]);

  const toggleChat = useCallback(async (applicationId: string) => {
    if (openChatId === applicationId) {
      setOpenChatId(null);
      return;
    }

    setError(null);
    setExpandedId(applicationId);

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
  }, [chatMessages, openChatId]);

  const visible =
    filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1rem 0.75rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap' }}>
        {STATUS_CHIP_FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button type="button"
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="text-xs font-semibold transition-colors"
              style={Object.assign(
                { flexShrink: 0, padding: '0.375rem 1rem', borderRadius: '9999px' },
                active ? { background: 'var(--color-accent)', color: '#ffffff' } : { background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' }
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-2 text-xs text-red-600 font-semibold">{error}</p>
      )}

      {/* Applicant cards */}
      <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {visible.length === 0 ? (
          // The page renders this list only when applications exist or a stage
          // filter is set, so every zero here is `filtered`: the local chip
          // (cleared in place), the URL stage filter, or a page past the last
          // applicant (both answered by the unfiltered first page).
          filter !== 'all' ? (
            <KitEmptyState
              framed
              kind="filtered"
              headingAs="h2"
              data-testid="employer-applications-empty"
              data-variant="applicationsFiltered"
              icon={<ListFilter size={13} aria-hidden="true" />}
              title={tEmpty('employer.applicationsFiltered.title', { stage: applicationStatusLabel(filter) })}
              description={tEmpty('employer.applicationsFiltered.body')}
              primaryAction={{ label: tEmpty('employer.applicationsFiltered.action'), onClick: () => setFilter('all') }}
            />
          ) : (
            <KitEmptyState
              framed
              kind="filtered"
              headingAs="h2"
              data-testid="employer-applications-empty"
              data-variant={activeStatusFilter ? 'applicationsFiltered' : 'applicationsPage'}
              icon={<ListFilter size={13} aria-hidden="true" />}
              title={
                activeStatusFilter
                  ? tEmpty('employer.applicationsFiltered.title', { stage: applicationStatusLabel(activeStatusFilter) })
                  : tEmpty('employer.applicationsPage.title')
              }
              description={activeStatusFilter ? tEmpty('employer.applicationsFiltered.body') : tEmpty('employer.applicationsPage.body')}
              primaryAction={{
                label: activeStatusFilter ? tEmpty('employer.applicationsFiltered.action') : tEmpty('employer.applicationsPage.action'),
                href: employerApplicationsListHref({}),
              }}
            />
          )
        ) : (
          visible.map((app) => {
            const isExpanded = expandedId === app.id;
            const isChatOpen = openChatId === app.id;
            const isChatLoading = chatLoadingId === app.id;
            const nextStatuses = STATUS_ACTIONS[app.status] ?? [];
            const studentName = app.student.fullName?.trim() || app.student.email;

            return (
              <div
                key={app.id}
                style={{ borderRadius: '0.75rem', overflow: 'hidden', background: 'var(--color-white)', boxShadow: '0 4px 24px -2px rgba(28,27,27,0.06)' }}
              >
                {/* Card header — tap to expand */}
                <button type="button"
                  style={{ width: '100%', textAlign: 'left', padding: '1rem', display: 'flex', gap: '0.875rem', alignItems: 'flex-start', background: 'none', border: 'none', cursor: 'pointer' }}
                  aria-expanded={isExpanded} aria-controls={`application-details-${app.id}`} aria-label={isExpanded ? `Collapse details for ${studentName}` : `Expand details for ${studentName}`} onClick={() => {
                    const nextExpanded = isExpanded ? null : app.id;
                    setExpandedId(nextExpanded);
                    if (nextExpanded !== app.id && openChatId === app.id) {
                      setOpenChatId(null);
                    }
                  }}
                >
                  {/* Avatar */}
                  <div style={{ width: '3rem', height: '3rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))', color: '#fff', fontWeight: 700, fontSize: '0.9375rem' }}>
                    {initials(app.student.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h4 className="font-bold text-sm truncate" style={{ color: 'var(--color-on-surface)' }}>
                        {studentName}
                      </h4>
                      <StatusTag tone={statusTone(app.status)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {applicationStatusLabel(app.status)}
                      </StatusTag>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider truncate mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {app.job.title}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                      Applied {new Date(app.appliedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className="material-symbols-outlined text-[18px] flex-shrink-0 mt-1 transition-transform"
                    style={{ color: 'var(--wa-accent-text)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                   aria-hidden="true">
                    expand_more
                  </span>
                </button>

                {/* Expandable detail */}
                {isExpanded && (
                  <div id={`application-details-${app.id}`} className="px-4 pb-4 border-t" style={{ borderColor: 'var(--surface-container)' }}>
                    <div className="pt-4 mb-4">
                      <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Email</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>{app.student.email}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2" style={{ marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        disabled={isChatLoading}
                        onClick={() => void toggleChat(app.id)}
                        className="w-full font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.375rem',
                          padding: '0.75rem',
                          borderRadius: '0.75rem',
                          border: 'none',
                          cursor: isChatLoading ? 'default' : 'pointer',
                          background: isChatOpen ? 'rgba(173,44,77,0.12)' : 'rgba(173,44,77,0.08)',
                          color: 'var(--wa-accent-text)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">forum</span>
                        {isChatLoading ? 'Loading…' : isChatOpen ? 'Close messages' : 'Message applicant'}
                      </button>

                    {nextStatuses.length > 0 && (
                      <>
                        {nextStatuses.map((s) => {
                          const isReject = s === 'rejected';
                          return (
                            <button type="button"
                              key={s}
                              disabled={busyId === app.id}
                              onClick={() => patchStatus(app.id, s)}
                              className="w-full py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                              style={
                                isReject
                                  ? { background: '#ffdad6', color: '#93000a' }
                                  : { background: 'var(--color-accent)', color: '#ffffff' }
                              }
                            >
                              {busyId === app.id ? '…' : applicationStatusLabel(s)}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                    {nextStatuses.length === 0 && !isChatOpen && (
                      <p className="text-xs text-center" style={{ color: 'var(--color-on-surface-variant)' }}>No further actions available.</p>
                    )}

                    {isChatOpen && chatMessages[app.id] && (
                      <div style={{ marginTop: '1rem', border: '1px solid var(--outline-variant)', borderRadius: '0.875rem', overflow: 'hidden', background: 'var(--color-white)', minHeight: '24rem' }}>
                        <EmployerApplicationChatClient
                          applicationId={app.id}
                          studentName={studentName}
                          jobTitle={app.job.title}
                          initialMessages={chatMessages[app.id]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
