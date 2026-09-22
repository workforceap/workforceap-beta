'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import type { JobPostingApplicationStatus } from '@prisma/client';
import { employerJobPostingApplicationStatusLabel } from '@/lib/employer/jobPostingApplicationStatus';

type Applicant = {
  id: string;
  status: JobPostingApplicationStatus;
  appliedAt: string;
  employerNotes: string | null;
  student: {
    id: string;
    fullName: string | null;
    email: string;
  };
};

const STATUSES: JobPostingApplicationStatus[] = [
  'pending',
  'reviewing',
  'interview',
  'offered',
  'hired',
  'rejected',
];

export default function JobApplicantsClient({
  jobId,
  initialApplicants,
}: {
  jobId: string;
  initialApplicants: Applicant[];
}) {
  const [applicants, setApplicants] = useState(initialApplicants);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchStatus = useCallback(async (applicantId: string, status: JobPostingApplicationStatus) => {
    setBusyId(applicantId);
    setError(null);
    try {
      const res = await fetch(`/api/employer/jobs/${jobId}/applicants?applicantId=${applicantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Update failed');
        return;
      }
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? { ...a, status: data.application?.status ?? status } : a))
      );
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
    }
  }, [jobId]);

  if (applicants.length === 0) {
    return (
      <div className="portal-card portal-card--flat" style={{ padding: '2rem', textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline-variant)', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">
          inbox
        </span>
        <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
          No applicants yet
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
          When candidates apply to this job, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="portal-card portal-card--flat" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(140,15,55,0.06)', color: 'var(--color-accent)' }} role="alert">
          {error}
        </div>
      )}
      {/* Mobile cards */}
      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
        {applicants.map((app) => {
          const studentName = app.student.fullName?.trim() || app.student.email;
          return (
            <div key={app.id} className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '9999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                  }}
                >
                  {studentName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)' }} className="wa-truncate">
                    {studentName}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }} className="wa-truncate">
                    {app.student.email}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  Applied {new Date(app.appliedAt).toLocaleDateString()}
                </span>
                <select
                  className="employer-app-status-select"
                  value={app.status}
                  disabled={busyId === app.id}
                  aria-label={`Update application status for ${studentName}`}
                  onChange={(e) => patchStatus(app.id, e.target.value as JobPostingApplicationStatus)}
                  style={{ fontSize: '0.8125rem', padding: '0.375rem 0.5rem' }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {employerJobPostingApplicationStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <div className="wa-hidden md:wa-block">
        <div className="portal-card portal-card--flat" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <caption className="sr-only">
              Job applicants with candidate name, application date, current status, and review actions.
            </caption>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Candidate
                </th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Applied
                </th>
                <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((app) => {
                const studentName = app.student.fullName?.trim() || app.student.email;
                return (
                  <tr key={app.id} style={{ borderBottom: '1px solid var(--surface-container)' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '9999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.8125rem',
                          }}
                        >
                          {studentName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <Link
                            href={`/employer/candidates/${app.student.id}?jobId=${encodeURIComponent(jobId)}`}
                            style={{ fontWeight: 700, color: 'var(--color-on-surface)', textDecoration: 'none' }}
                          >
                            {studentName}
                          </Link>
                          <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                            {app.student.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(app.appliedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <select
                        className="employer-app-status-select"
                        value={app.status}
                        disabled={busyId === app.id}
                        aria-label={`Update application status for ${studentName}`}
                        onChange={(e) => patchStatus(app.id, e.target.value as JobPostingApplicationStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {employerJobPostingApplicationStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
