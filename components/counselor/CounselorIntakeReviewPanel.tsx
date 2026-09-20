'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPortalDate, formatPortalDateTime } from '@/lib/formatDate';
import {
  COUNSELOR_WIOA_INTAKE_LABELS,
  COUNSELOR_WIOA_REVIEW_STATUSES,
  isCounselorWioaReviewStatus,
  wioaReviewLabel,
  type CounselorWioaReviewStatus,
} from '@/lib/wioa/wioaReview';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';

/**
 * Counselor approvals (Mike, 2026-09-19). Counselors review the member's
 * program application(s) and record WIOA intake verification from the
 * student page. Both actions call the same routes the admin review uses
 * (`/api/admin/members/[id]/status`, `/api/admin/members/[id]/wioa-review`),
 * which now admit active counselors for members assigned to them, so the
 * emails, audit trail and decision history behave identically.
 *
 * Wording rule: this panel says "intake verified" / "intake complete" —
 * never "eligible". The legal eligibility determination belongs to the
 * workforce board, not to WorkforceAP staff.
 */

type CounselorReviewableApplication = {
  id: string;
  status: string;
  programTitle: string;
  submittedAt: string | null;
};

type CounselorWioaIntakeState = {
  hasScreening: boolean;
  submittedAt: string | null;
  reviewStatus: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
};

type Props = {
  memberId: string;
  applications: CounselorReviewableApplication[];
  wioa: CounselorWioaIntakeState;
};

type Decision = 'APPROVED' | 'DENIED' | 'NEEDS_INFO';

const DECISIONS: Decision[] = ['APPROVED', 'DENIED', 'NEEDS_INFO'];

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  NEEDS_INFO: 'Needs more information',
};

const DECISION_BUTTON_LABEL: Record<Decision, string> = {
  APPROVED: 'Approve',
  DENIED: 'Deny',
  NEEDS_INFO: 'Request info',
};

const DECISION_CONFIRM_COPY: Record<Decision, string> = {
  APPROVED: 'Approving sends the member their enrollment confirmation email and records your decision.',
  DENIED: 'Denying sends the member a decision email and records your decision.',
  NEEDS_INFO: 'Marks the application as needing more information. No email is sent.',
};

const DECISION_DONE_COPY: Record<Decision, string> = {
  APPROVED: 'Application approved.',
  DENIED: 'Application denied.',
  NEEDS_INFO: 'Application marked as needing more information.',
};

const sectionStyle = {
  padding: '1rem',
  background: 'var(--color-light)',
  borderRadius: 'var(--radius-md)',
} as const;

const helpStyle = {
  fontSize: '0.85rem',
  color: 'var(--color-on-surface-variant)',
  lineHeight: 1.45,
  marginBottom: '0.75rem',
} as const;

const labelStyle = { display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' } as const;

const fieldStyle = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '6px',
  fontFamily: 'inherit',
  marginBottom: '0.75rem',
} as const;

export default function CounselorIntakeReviewPanel({ memberId, applications, wioa }: Props) {
  const router = useRouter();

  // ── Application decisions ──
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [pendingDecision, setPendingDecision] = useState<{ applicationId: string; decision: Decision } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState('');
  const [decisionDone, setDecisionDone] = useState('');

  const submitDecision = async (applicationId: string, decision: Decision) => {
    // WAP-184 G-3: a denial needs a written reason; the server enforces it too.
    if (isMissingDenialReason('application_decision', decision, notesById[applicationId])) {
      setDecisionError(DENIAL_REASON_REQUIRED_MESSAGE);
      return;
    }
    setBusyId(applicationId);
    setDecisionError('');
    setDecisionDone('');
    try {
      const res = await fetch(`/api/admin/members/${applicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decision,
          notes: notesById[applicationId]?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDecisionError(data.error ?? 'Could not save the decision. Please try again.');
        return;
      }
      setStatusById((prev) => ({ ...prev, [applicationId]: decision }));
      setPendingDecision(null);
      setDecisionDone(DECISION_DONE_COPY[decision]);
      router.refresh();
    } catch {
      setDecisionError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  // ── WIOA intake verification ──
  const initialIntakeStatus: CounselorWioaReviewStatus =
    wioa.reviewStatus && isCounselorWioaReviewStatus(wioa.reviewStatus) ? wioa.reviewStatus : 'pending';
  const adminOnlyStatus = wioa.reviewStatus && !isCounselorWioaReviewStatus(wioa.reviewStatus) ? wioa.reviewStatus : null;
  const [intakeStatus, setIntakeStatus] = useState<CounselorWioaReviewStatus>(initialIntakeStatus);
  const [intakeNotes, setIntakeNotes] = useState(wioa.reviewNotes ?? '');
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [intakeSavedAt, setIntakeSavedAt] = useState(wioa.reviewedAt);
  const [intakeSavedByYou, setIntakeSavedByYou] = useState(false);

  const saveIntake = async () => {
    setIntakeSaving(true);
    setIntakeError('');
    try {
      const res = await fetch(`/api/admin/members/${memberId}/wioa-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: intakeStatus,
          notes: intakeNotes.trim() || null,
          expectedSubmittedAt: wioa.submittedAt,
          expectedReviewedAt: intakeSavedAt,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; wioaReviewedAt?: string };
      if (!res.ok) {
        setIntakeError(data.error ?? 'Could not save the intake status. Please try again.');
        return;
      }
      if (data.wioaReviewedAt) setIntakeSavedAt(data.wioaReviewedAt);
      setIntakeSavedByYou(true);
      router.refresh();
    } catch {
      setIntakeError('Network error. Please try again.');
    } finally {
      setIntakeSaving(false);
    }
  };

  return (
    <section style={sectionStyle} data-testid="counselor-intake-review-panel">
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Application review</h2>
      <p style={helpStyle}>
        Approve, deny, or request more information on this member&apos;s program application. Decisions use the same
        emails and audit trail as the admin review, recorded under your name.
      </p>

      {applications.length === 0 ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
          No program application on file for this member yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          {applications.map((app) => {
            const current = statusById[app.id] ?? app.status;
            const pending = pendingDecision?.applicationId === app.id ? pendingDecision.decision : null;
            const busy = busyId === app.id;
            return (
              <li
                key={app.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--outline-variant)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{app.programTitle}</strong>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {APPLICATION_STATUS_LABEL[current] ?? current}
                  </span>
                </div>
                {app.submittedAt ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0.15rem 0 0.75rem' }}>
                    Submitted {formatPortalDate(app.submittedAt)}
                  </p>
                ) : (
                  <div style={{ height: '0.5rem' }} />
                )}

                <label htmlFor={`intake-decision-notes-${app.id}`} style={labelStyle}>
                  Decision notes (optional)
                </label>
                <textarea
                  id={`intake-decision-notes-${app.id}`}
                  value={notesById[app.id] ?? ''}
                  onChange={(e) => setNotesById((prev) => ({ ...prev, [app.id]: e.target.value }))}
                  rows={2}
                  maxLength={2000}
                  placeholder="Documents received, intake complete, follow-ups…"
                  style={fieldStyle}
                />

                {pending ? (
                  <div>
                    <p style={{ ...helpStyle, marginBottom: '0.5rem' }}>{DECISION_CONFIRM_COPY[pending]}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void submitDecision(app.id, pending)}
                        disabled={busy}
                        aria-busy={busy}
                      >
                        {busy ? 'Saving…' : `Confirm: ${DECISION_BUTTON_LABEL[pending]}`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setPendingDecision(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {DECISIONS.map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        className={decision === 'APPROVED' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                        onClick={() => setPendingDecision({ applicationId: app.id, decision })}
                        disabled={busy || current === decision}
                      >
                        {DECISION_BUTTON_LABEL[decision]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {decisionError ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '0.75rem 0 0' }}>
          {decisionError}
        </p>
      ) : null}
      {decisionDone ? (
        <p role="status" style={{ color: 'var(--color-green, #16a34a)', fontSize: '0.9rem', margin: '0.75rem 0 0' }}>
          {decisionDone}
        </p>
      ) : null}

      <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem', marginTop: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>WIOA intake verification</h3>
        <p style={helpStyle}>
          Record whether the member&apos;s WIOA intake paperwork is complete. This is an internal workflow status,
          not an eligibility determination — that stays with the workforce board.
        </p>

        {!wioa.hasScreening ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
            This member has not submitted the WIOA self-screening yet, so there is nothing to verify.
          </p>
        ) : (
          <>
            {adminOnlyStatus ? (
              <p style={helpStyle}>
                An administrator recorded this screening as <strong>{wioaReviewLabel(adminOnlyStatus)}</strong>.
                Saving below replaces that status.
              </p>
            ) : null}
            <label htmlFor="counselor-intake-status" style={labelStyle}>
              Intake status
            </label>
            <select
              id="counselor-intake-status"
              value={intakeStatus}
              onChange={(e) => setIntakeStatus(e.target.value as CounselorWioaReviewStatus)}
              style={{ ...fieldStyle, maxWidth: '320px' }}
            >
              {COUNSELOR_WIOA_REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COUNSELOR_WIOA_INTAKE_LABELS[s]}
                </option>
              ))}
            </select>

            <label htmlFor="counselor-intake-notes" style={labelStyle}>
              Internal notes
            </label>
            <textarea
              id="counselor-intake-notes"
              value={intakeNotes}
              onChange={(e) => setIntakeNotes(e.target.value)}
              rows={3}
              maxLength={8000}
              placeholder="Documents checked, AJC referral, follow-ups…"
              style={fieldStyle}
            />

            {intakeError ? (
              <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                {intakeError}
              </p>
            ) : null}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void saveIntake()}
              disabled={intakeSaving}
              aria-busy={intakeSaving}
            >
              {intakeSaving ? 'Saving…' : 'Save intake status'}
            </button>

            {intakeSavedAt ? (
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                Last saved {formatPortalDateTime(intakeSavedAt)}
                {intakeSavedByYou ? ' · You' : ''}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
