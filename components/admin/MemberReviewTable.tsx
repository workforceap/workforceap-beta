'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApplicationStatus } from '@prisma/client';
import { formatPhone } from '@/lib/formatPhone';
import DataTable from '@/components/portal/ui/DataTable';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';

type ApplicationWithUser = {
  id: string;
  status: ApplicationStatus;
  programInterest: string;
  submittedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
  };
};

type MemberReviewTableProps = {
  applications: ApplicationWithUser[];
};

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approve' },
  { value: 'DENIED', label: 'Deny' },
  { value: 'NEEDS_INFO', label: 'Request info' },
];

export function MemberReviewTable({ applications }: MemberReviewTableProps) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleStatusChange = async (applicationId: string, newStatus: ApplicationStatus) => {
    // WAP-184 G-3: a denial needs a written reason; the server enforces it too.
    if (isMissingDenialReason('application_decision', newStatus, notes[applicationId])) {
      setFeedback(DENIAL_REASON_REQUIRED_MESSAGE);
      return;
    }
    setUpdatingId(applicationId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/members/${applicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes: notes[applicationId] || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFeedback(typeof json.error === 'string' ? json.error : 'Failed to update status.');
        return;
      }

      // Refresh server data in place — preserves scroll position and typed notes
      // (unlike a full window.location.reload()).
      router.refresh();
    } catch {
      setFeedback('Network error. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (applications.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
        No applications to review.
      </div>
    );
  }

  return (
    <div className="admin-responsive-data">
      {feedback && (
        <div className="admin-inline-feedback admin-inline-feedback--error" role="alert">
          <p>{feedback}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="admin-table-scroll admin-member-review-desktop">
        <DataTable
          variant="portal"
          scrollX={false}
          rows={applications}
          rowKey={(app) => app.id}
          columns={[
            {
              key: 'applicant',
              header: 'Applicant',
              cell: (app) => (
                <>
                  <div style={{ fontWeight: 600 }}>{app.user.fullName}</div>
                  <div style={{ fontSize: '.875rem', color: 'var(--color-on-surface-variant)' }}>{app.user.email}</div>
                  {app.user.phone ? (
                    <div style={{ fontSize: '.875rem', color: 'var(--color-on-surface-variant)' }}>
                      {formatPhone(app.user.phone)}
                    </div>
                  ) : null}
                </>
              ),
            },
            {
              key: 'program',
              header: 'Program',
              cell: (app) => <span style={{ fontSize: '.9rem' }}>{app.programInterest}</span>,
            },
            {
              key: 'submitted',
              header: 'Submitted',
              cell: (app) => (
                <span style={{ fontSize: '.9rem' }}>
                  {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '—'}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (app) => (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '.8rem',
                    fontWeight: 600,
                    background:
                      app.status === 'APPROVED'
                        ? 'rgba(74,155,79,0.15)'
                        : app.status === 'DENIED'
                          ? 'rgba(173,44,77,0.15)'
                          : app.status === 'NEEDS_INFO'
                            ? 'rgba(164,127,56,0.15)'
                            : 'var(--surface-container)',
                    color:
                      app.status === 'APPROVED'
                        ? 'var(--wa-success-dark)'
                        : app.status === 'DENIED'
                          ? 'var(--color-accent)'
                          : app.status === 'NEEDS_INFO'
                            ? 'var(--wa-gold-dark)'
                            : 'var(--color-on-surface-variant)',
                  }}
                >
                  {app.status.replace('_', ' ')}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              cell: (app) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={notes[app.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [app.id]: e.target.value }))}
                    style={{
                      padding: '0.5rem',
                      fontSize: '.875rem',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {STATUS_OPTIONS.filter((o) => o.value !== app.status).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusChange(app.id, opt.value)}
                        disabled={updatingId === app.id}
                        className="btn"
                        style={{
                          padding: '0.35rem 0.6rem',
                          fontSize: '.8rem',
                          background:
                            opt.value === 'APPROVED'
                              ? 'var(--wa-success)'
                              : opt.value === 'DENIED'
                                ? 'var(--color-accent)'
                                : 'var(--color-on-surface-variant)',
                          color: 'white',
                          border: 'none',
                        }}
                      >
                        {updatingId === app.id ? '…' : opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
      <ul className="admin-portal-card-list admin-member-review-cards" aria-label="Applications (mobile layout)">
        {applications.map((app) => (
          <li key={`card-${app.id}`} className="admin-portal-card">
            <div className="admin-portal-card__header">
              <strong>{app.user.fullName}</strong>
              <span
                className="admin-portal-card__badge"
                style={{
                  background:
                    app.status === 'APPROVED'
                      ? 'rgba(74,155,79,0.15)'
                      : app.status === 'DENIED'
                        ? 'rgba(173,44,77,0.15)'
                        : app.status === 'NEEDS_INFO'
                          ? 'rgba(164,127,56,0.15)'
                          : 'var(--surface-container)',
                }}
              >
                {app.status.replace('_', ' ')}
              </span>
            </div>
            <p className="admin-portal-card__meta">{app.user.email}</p>
            {app.user.phone && <p className="admin-portal-card__meta">{formatPhone(app.user.phone)}</p>}
            <p className="admin-portal-card__row">
              <span className="admin-portal-card__label">Program</span> {app.programInterest}
            </p>
            <p className="admin-portal-card__row">
              <span className="admin-portal-card__label">Submitted</span>{' '}
              {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '-'}
            </p>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes[app.id] ?? ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [app.id]: e.target.value }))}
              className="admin-portal-card__notes"
            />
            <div className="admin-portal-card__actions">
              {STATUS_OPTIONS.filter((o) => o.value !== app.status).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(app.id, opt.value)}
                  disabled={updatingId === app.id}
                  className="btn"
                  style={{
                    padding: '0.35rem 0.6rem',
                    fontSize: '.8rem',
                    background:
                      opt.value === 'APPROVED'
                        ? 'var(--wa-success)'
                        : opt.value === 'DENIED'
                          ? 'var(--color-accent)'
                          : 'var(--color-on-surface-variant)',
                    color: 'white',
                    border: 'none',
                  }}
                >
                  {updatingId === app.id ? '...' : opt.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
