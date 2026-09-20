'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { postMemberEvent } from '@/lib/events/client';
import { trackFunnelEvent } from '@/lib/analytics/events';
import {
  CardHead,
  StatusTag,
  DataTable,
  type Column,
  type KitTone,
} from '@/components/portal/kit';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Job = {
  id: string;
  title: string;
  location: string | null;
  locationType: string;
  jobType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  sourceUrl?: string | null;
  importProvider?: string | null;
  importMethod?: string | null;
  requirements: string[];
  preferredCertifications: string[];
  suggestedPrograms: string[];
  status: string;
  applicationsCount: number;
  aiMatchesComputedAt?: string | Date | null;
  matchSuggestionsLastSentAt?: string | Date | null;
  matchSuggestionsLastStatus?: string | null;
  matchSuggestionsLastError?: string | null;
  employer?: { companyName: string; contactEmail: string; contactName: string | null } | null;
  applications?: { id: string; student: { fullName: string; email: string } }[];
};

type MatchRow = {
  studentId: string;
  matchScore: number;
  matchReasons: string[];
  student: { fullName: string; email: string; enrolledProgram: string | null };
};

function formatAdminDate(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

const JOB_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  live: 'Live',
  filled: 'Filled',
  closed: 'Closed',
};

/** Tone for the job status pill — mirrors the color language on the jobs queue. */
function jobStatusTone(status: string): KitTone {
  if (status === 'live') return 'ok';
  if (status === 'pending') return 'warn';
  if (status === 'approved') return 'info';
  if (status === 'filled') return 'ok';
  if (status === 'closed') return 'muted';
  return 'muted';
}

function matchEmailBadge(status: string | null | undefined): { tone: KitTone; label: string } {
  switch (status) {
    case 'success':
      return { tone: 'ok', label: 'Success' };
    case 'test_sent':
      return { tone: 'ok', label: 'Test sent' };
    case 'failed':
      return { tone: 'danger', label: 'Failed' };
    case 'dry_run':
      return { tone: 'info', label: 'Dry run' };
    default:
      return { tone: 'muted', label: status ? status : 'None' };
  }
}

function formatImportMethod(importMethod?: string | null) {
  if (!importMethod) return null;
  return importMethod
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminJobReview({ job }: { job: Job }) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const canApprove = job.status === 'pending';
  const canReject = job.status === 'pending';
  const hasProvenance = !!(job.sourceUrl || job.importProvider || job.importMethod);
  const suggestionBadge = matchEmailBadge(job.matchSuggestionsLastStatus);

  useEffect(() => {
    trackFunnelEvent('admin_review_queue', 'job_review_opened', { job_id: job.id, status: job.status });
    void postMemberEvent({
      eventName: 'admin_job_review_viewed',
      entityType: 'job',
      entityId: job.id,
      sourcePage: `/admin/jobs/${job.id}`,
      metadata: { status: job.status },
    });
  }, [job.id, job.status]);

  async function handleApprove() {
    setApproving(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/approve`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (res.ok) {
        setActionFeedback({
          type: data.warning ? 'warning' : 'success',
          message: data.warning ?? 'Job approved.',
        });
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: data.error ?? 'Failed to approve. Try again.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Could not reach the server. Check the job status before retrying.' });
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      setRejectReasonError('Please enter a rejection reason before rejecting.');
      return;
    }
    setRejectReasonError('');
    setRejecting(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (res.ok) {
        setActionFeedback({
          type: data.warning ? 'warning' : 'success',
          message: data.warning ?? 'Job rejected.',
        });
        router.refresh();
      } else {
        setActionFeedback({ type: 'error', message: data.error ?? 'Failed to reject. Try again.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Could not reach the server. Check the job status before retrying.' });
    } finally {
      setRejecting(false);
    }
  }

  async function loadMatches() {
    setLoadingMatches(true);
    trackFunnelEvent('admin_review_queue', 'matches_requested', { job_id: job.id });
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/matches`);
      const data = await res.json();
      if (res.ok) setMatches(data);
    } finally {
      setLoadingMatches(false);
    }
  }

  async function handleSuggestMatches() {
    setSuggesting(true);
    setActionFeedback(null);
    trackFunnelEvent('admin_review_queue', 'match_suggestions_requested', { job_id: job.id });
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/suggest-matches`, { method: 'POST' });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        dryRun?: boolean;
        testMode?: boolean;
        employerNotifiedUpdate?: string;
      };
      if (res.ok) {
        if (d.dryRun) {
          setActionFeedback({
            type: 'success',
            message: 'Dry run complete — no email was sent. Check audit / job timestamps.',
          });
        } else {
          const parts = [
            d.testMode ? 'Sent to test inbox (ADMIN_MATCH_SUGGESTIONS_TEST_EMAIL).' : 'Match suggestions sent to employer.',
          ];
          if (d.employerNotifiedUpdate === 'failed') {
            parts.push('Warning: email may have delivered but applicant statuses did not update — see logs.');
          }
          setActionFeedback({ type: 'success', message: parts.join(' ') });
        }
        router.refresh();
      } else {
        setActionFeedback({
          type: 'error',
          message: typeof d.error === 'string' ? d.error : 'Failed to send suggestions.',
        });
      }
    } finally {
      setSuggesting(false);
    }
  }

  const applicationColumns: Column<NonNullable<Job['applications']>[number]>[] = [
    { key: 'name', header: 'Name', render: (app) => <span style={{ fontWeight: 700 }}>{app.student?.fullName ?? 'Unknown'}</span> },
    { key: 'email', header: 'Email', render: (app) => app.student?.email ?? '—' },
  ];

  const matchColumns: Column<MatchRow>[] = [
    { key: 'name', header: 'Member', render: (m) => <span style={{ fontWeight: 700 }}>{m.student.fullName}</span> },
    { key: 'program', header: 'Program', render: (m) => (m.student.enrolledProgram ? programDisplayTitle(m.student.enrolledProgram) : '—') },
    {
      key: 'score',
      header: 'Match',
      align: 'right',
      render: (m) => <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--wa-accent)' }}>{m.matchScore}%</span>,
    },
    {
      key: 'reasons',
      header: 'Reasons',
      render: (m) => (m.matchReasons.length > 0 ? m.matchReasons.join('; ') : '—'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {actionFeedback && (() => {
        const feedbackColor = actionFeedback.type === 'success'
          ? 'var(--wa-success)'
          : actionFeedback.type === 'warning'
            ? 'var(--wa-gold)'
            : 'var(--wa-danger)';
        return (
        <div
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 'var(--wa-radius-sm)',
            fontSize: 13,
            fontWeight: 600,
            color: feedbackColor,
            background: `color-mix(in srgb, ${feedbackColor} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${feedbackColor} 25%, transparent)`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {actionFeedback.type === 'error' ? <XCircle size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
            {actionFeedback.message}
          </span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="wa-kit-focus"
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'inherit', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
        );
      })()}

      <div className="wa-flex wa-items-center wa-flex-wrap" style={{ gap: 10 }}>
        <span style={{ fontSize: 14, color: 'var(--wa-muted)' }}>
          {job.employer?.companyName ?? 'Unknown'} · {job.employer?.contactName ?? job.employer?.contactEmail ?? '—'}
        </span>
        <StatusTag tone={jobStatusTone(job.status)}>{JOB_STATUS_LABELS[job.status] ?? job.status}</StatusTag>
      </div>

      {hasProvenance && (
        <div className="wa-kit-card">
          <CardHead title="Import Provenance" />
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14, margin: 0 }}>
            {job.importProvider && (
              <>
                <dt className="wa-kit-stat-label">Provider</dt>
                <dd style={{ margin: 0, color: 'var(--wa-text)' }}>{job.importProvider}</dd>
              </>
            )}
            {job.importMethod && (
              <>
                <dt className="wa-kit-stat-label">Method</dt>
                <dd style={{ margin: 0, color: 'var(--wa-text)' }}>{formatImportMethod(job.importMethod)}</dd>
              </>
            )}
            {job.sourceUrl && (
              <>
                <dt className="wa-kit-stat-label">Source</dt>
                <dd style={{ margin: 0 }}>
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--wa-accent)' }}
                  >
                    {job.sourceUrl} <ExternalLink size={12} aria-hidden />
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {(canApprove || canReject) && (
        <div className="wa-kit-card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {canApprove && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="wa-kit-focus"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                borderRadius: 999,
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--wa-on-accent)',
                background: 'var(--wa-accent)',
                cursor: approving ? 'default' : 'pointer',
                opacity: approving ? 0.75 : 1,
                flexShrink: 0,
              }}
            >
              {approving ? <PortalInlineSpinner size={14} /> : null}
              {approving ? 'Approving…' : 'Approve'}
            </button>
          )}
          {canReject && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  aria-label="Rejection reason"
                  placeholder="Rejection reason"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectReasonError) setRejectReasonError('');
                  }}
                  aria-invalid={!!rejectReasonError}
                  aria-describedby={rejectReasonError ? 'admin-job-reject-reason-error' : undefined}
                  className="wa-kit-focus"
                  style={{
                    flex: 1,
                    minWidth: 180,
                    fontSize: 13,
                    padding: '9px 12px',
                    border: '1px solid var(--wa-border)',
                    borderRadius: 'var(--wa-radius-sm)',
                    background: 'var(--wa-surface)',
                    color: 'var(--wa-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={rejecting}
                  className="wa-kit-focus"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 16px',
                    borderRadius: 999,
                    border: '1px solid var(--wa-border)',
                    background: 'transparent',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--wa-text)',
                    cursor: rejecting ? 'default' : 'pointer',
                  }}
                >
                  {rejecting ? <PortalInlineSpinner size={14} /> : null}
                  {rejecting ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
              {rejectReasonError ? (
                <p id="admin-job-reject-reason-error" style={{ margin: 0, fontSize: 13, color: 'var(--wa-danger)' }}>
                  {rejectReasonError}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      <div className="wa-kit-card">
        <CardHead title="Details" />
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14, margin: 0 }}>
          <dt className="wa-kit-stat-label">Location</dt>
          <dd style={{ margin: 0, color: 'var(--wa-text)' }}>{job.location ?? '—'}</dd>
          <dt className="wa-kit-stat-label">Type</dt>
          <dd style={{ margin: 0, color: 'var(--wa-text)' }}>{job.jobType} · {job.locationType}</dd>
          <dt className="wa-kit-stat-label">Salary</dt>
          <dd style={{ margin: 0, color: 'var(--wa-text)', fontVariantNumeric: 'tabular-nums' }}>
            {job.salaryMin ?? job.salaryMax
              ? `$${(job.salaryMin ?? 0).toLocaleString()} – $${(job.salaryMax ?? 0).toLocaleString()}`
              : '—'}
          </dd>
        </dl>
        <div style={{ marginTop: 16 }}>
          <div className="wa-kit-stat-label" style={{ marginBottom: 6 }}>Description</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--wa-text)' }}>{job.description}</div>
        </div>
        {(job.requirements?.length ?? 0) > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="wa-kit-stat-label" style={{ marginBottom: 8 }}>Requirements</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {job.requirements.map((r, i) => (
                <StatusTag key={i} tone="muted">{r}</StatusTag>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="wa-kit-card">
        <CardHead title={`Applications (${job.applications?.length ?? 0})`} />
        {(job.applications?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--wa-muted)', fontSize: 13 }}>No applications yet.</p>
        ) : (
          <DataTable columns={applicationColumns} rows={job.applications ?? []} rowKey={(app) => app.id} emptyTitle="No applications yet" />
        )}
      </div>

      <div id="matches" className="wa-kit-card">
        <CardHead title="AI Member Matches" />
        <div className="wa-kit-card wa-kit-card--sm" style={{ marginBottom: 16 }}>
          {job.status === 'pending' && !job.aiMatchesComputedAt && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--wa-text)' }}>
              Member matches are calculated automatically when you approve this job (they may show as &quot;None&quot; until then).
            </p>
          )}
          <div className="wa-flex wa-items-center wa-flex-wrap" style={{ gap: '6px 16px', marginBottom: 6 }}>
            <span style={{ color: 'var(--wa-muted)', fontSize: 13 }}>Matches calculated at</span>
            <strong style={{ fontSize: 13 }}>{formatAdminDate(job.aiMatchesComputedAt)}</strong>
            <span style={{ marginLeft: 'auto' }}>
              <StatusTag tone={suggestionBadge.tone}>{suggestionBadge.label}</StatusTag>
            </span>
          </div>
          <div style={{ color: 'var(--wa-muted)', fontSize: 13 }}>
            Last suggestion email: <strong style={{ color: 'var(--wa-text)' }}>{formatAdminDate(job.matchSuggestionsLastSentAt)}</strong>
          </div>
          {job.matchSuggestionsLastError && (
            <p style={{ margin: '8px 0 0', color: 'var(--wa-danger)', fontSize: 13 }}>
              Last error: {job.matchSuggestionsLastError}
            </p>
          )}
        </div>
        {!matches ? (
          <button
            type="button"
            onClick={loadMatches}
            disabled={loadingMatches}
            className="wa-kit-focus"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              borderRadius: 999,
              border: '1px solid var(--wa-border)',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--wa-text)',
              cursor: loadingMatches ? 'default' : 'pointer',
            }}
          >
            {loadingMatches ? <PortalInlineSpinner size={14} /> : null}
            {loadingMatches ? 'Loading…' : 'View AI Matches'}
          </button>
        ) : (
          <>
            {matches.length === 0 ? (
              <p style={{ color: 'var(--wa-muted)', fontSize: 13 }}>No matching members found.</p>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <DataTable columns={matchColumns} rows={matches} rowKey={(m) => m.studentId} emptyTitle="No matching members found" />
                </div>
                {job.status === 'live' && (
                  <button
                    type="button"
                    onClick={handleSuggestMatches}
                    disabled={suggesting}
                    className="wa-kit-focus"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 20px',
                      borderRadius: 999,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--wa-on-accent)',
                      background: 'var(--wa-accent)',
                      cursor: suggesting ? 'default' : 'pointer',
                      opacity: suggesting ? 0.75 : 1,
                    }}
                  >
                    {suggesting ? <PortalInlineSpinner size={14} /> : null}
                    {suggesting ? 'Sending…' : 'Send Match Suggestions to Employer'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
