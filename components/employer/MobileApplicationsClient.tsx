'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { JobPostingApplicationStatus } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { JOB_APPLICATION_STATUS_KEYS, jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
import EmployerApplicationChatClient from '@/components/portal/EmployerApplicationChatClient';
import { KitEmptyState, StatusTag, type KitTone } from '@/components/portal/kit';
import type { AppMsg, EmployerApplicationRow } from './EmployerApplicationsClient';
import { employerApplicationsListHref, type EmployerApplicationsSort } from '@/lib/employer/employerApplicationsListQuery';
import PortalRecordLink from '@/components/portal/PortalRecordLink';
import { classifyEmployerApplicationsEmpty, type EmployerApplicationsEmptyContext } from '@/lib/employer/applicationEmptyState';
import EmployerApplicationsEmptyState from './EmployerApplicationsEmptyState';

const STATUS_CHIP_FILTERS = [
  { label: 'All', value: 'all' as const },
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
  activeSort = 'applied_desc',
  emptyContext,
}: {
  initialRows: EmployerApplicationRow[];
  activeStatusFilter?: JobPostingApplicationStatus | null;
  activeSort?: EmployerApplicationsSort;
  emptyContext?: EmployerApplicationsEmptyContext;
}) {
  const tCommon = useTranslations('common');
  const t = useTranslations('employer');
  const [rows, setRows] = useState(initialRows);
  const filter = activeStatusFilter ?? 'all';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, AppMsg[]>>({});
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination/filter navigation reuses this client island. Replace the loaded
  // rows so a new server page never keeps the previous applicants on screen.
  useEffect(() => {
    setRows(initialRows);
    setExpandedId(null);
    setOpenChatId(null);
  }, [initialRows]);

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

  // The same server filter and pager now serve both responsive layouts.
  const visible = rows;
  const emptyCase = classifyEmployerApplicationsEmpty({ rowCount: visible.length, activeStatusFilter, context: emptyContext });

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1rem 0.75rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap' }}>
        {STATUS_CHIP_FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={employerApplicationsListHref({ status: f.value, sort: activeSort })}
              aria-current={active ? 'page' : undefined}
              className="wa-kit-focus wa-text-sm wa-font-semibold"
              style={Object.assign(
                { flexShrink: 0, padding: '0.375rem 1rem', borderRadius: '9999px' },
                // Solid accent control: --wa-accent paired with its adaptive foreground
                // (KIT_GUIDE §1), like the desktop "All" pill in EmployerJobsBoard. The
                // old --color-accent + #ffffff was 3.28:1 wherever --color-accent
                // follows the lightened dark accent (no org accent pinned).
                active ? { background: 'var(--wa-accent-fill)', color: 'var(--wa-on-accent-control)' } : { background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' }
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-2 text-xs text-red-600 font-semibold">{error}</p>
      )}

      {/* Applicant cards */}
      <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {emptyCase ? (
          <EmployerApplicationsEmptyState emptyCase={emptyCase} activeSort={activeSort} />
        ) : visible.length === 0 ? (
          <KitEmptyState
            framed
            title={activeStatusFilter ? 'No applicants match this filter' : t('noApplicationsYet')}
            kind={activeStatusFilter ? 'filtered' : 'first'}
            primaryAction={activeStatusFilter ? {
              label: 'Show all applicants',
              href: employerApplicationsListHref({ sort: activeSort }),
            } : undefined}
          />
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
                      <PortalRecordLink href={`/employer/applications/${app.id}`} className="wa-kit-cta wa-mb-2">
                        {t('applicationReviewMetaTitle')}
                      </PortalRecordLink>
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
