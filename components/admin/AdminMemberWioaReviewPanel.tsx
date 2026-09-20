'use client';

import { useState } from 'react';
import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { barrierLabel, formatWioaReasons, publicAssistanceHelpLabel, publicAssistanceLabel, publicAssistanceProgramsLabel } from '@/lib/wioa/wioaQualification';
import { WIOA_REVIEW_LABELS, WIOA_REVIEW_STATUSES, type WioaReviewStatus } from '@/lib/wioa/wioaReview';
import type { WioaReviewSnapshotRow } from '@/lib/wioa/reviewSnapshot';

type Props = {
  memberId: string;
  snapshot: WioaQualificationSnapshot;
  reviewStatus: WioaReviewStatus | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewNotes: string | null;
  /** Immutable decision history — one row per WIOA review or application
   *  approve/deny, newest first. Read-only: this is the audit trail, not
   *  something the panel can edit. */
  decisionHistory: WioaReviewSnapshotRow[];
};

const SOURCE_LABEL: Record<string, string> = {
  wioa_review: 'WIOA staff review',
  application_decision: 'Application decision',
  enrollment_funding: 'Enrollment funding decision',
};

const AGE_LABEL: Record<string, string> = {
  under18: 'Under 18',
  '18_24': '18–24',
  '25_54': '25–54',
  '55_plus': '55+',
};

export default function AdminMemberWioaReviewPanel({
  memberId,
  snapshot,
  reviewStatus,
  reviewedAt,
  reviewerName,
  reviewNotes,
  decisionHistory,
}: Props) {
  const [status, setStatus] = useState<WioaReviewStatus>(reviewStatus ?? 'pending');
  const [notes, setNotes] = useState(reviewNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedAt, setSavedAt] = useState(reviewedAt);
  const [savedReviewer, setSavedReviewer] = useState(reviewerName);

  const onSave = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/members/${memberId}/wioa-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes: notes || null,
          expectedSubmittedAt: snapshot.submittedAt,
          expectedReviewedAt: savedAt,
        }),
      });
      const data = (await res.json()) as { error?: string; wioaReviewedAt?: string };
      if (!res.ok) {
        setErr(data.error ?? 'Save failed');
        return;
      }
      if (data.wioaReviewedAt) setSavedAt(data.wioaReviewedAt);
      setSavedReviewer('You');
    } catch {
      setErr('Network error');
    } finally {
      setSaving(false);
    }
  };

  const a = snapshot.answers;

  return (
    <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>WIOA self-screening</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.45 }}>
        Member-submitted questionnaire. Heuristic signal is not a legal determination. Use review status for internal workflow
        only.
      </p>

      <p style={{ marginBottom: '0.35rem' }}>
        <strong>Submitted:</strong> {new Date(snapshot.submittedAt).toLocaleString()}
      </p>
      <p style={{ marginBottom: '0.35rem' }}>
        <strong>Portal signal:</strong> {snapshot.signal}
      </p>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>County / ZIP:</strong> {a.countyOrZip?.trim() || '—'}
      </p>

      <ul style={{ fontSize: '0.9rem', marginBottom: '1rem', paddingLeft: '1.25rem', lineHeight: 1.5 }}>
        <li>
          <strong>Age group:</strong> {AGE_LABEL[a.ageBracket] ?? a.ageBracket}
        </li>
        <li>
          <strong>Primary barrier:</strong> {barrierLabel(a.primaryBarrier)}
        </li>
        <li>
          <strong>Dislocated worker:</strong> {a.dislocatedWorker ? 'Yes' : 'No'}
        </li>
        <li>
          <strong>Low income (self-reported):</strong> {a.lowIncomeSelfReport ? 'Yes' : 'No'}
        </li>
        <li>
          <strong>Receiving TANF / WIC / Food stamps (SNAP):</strong> {publicAssistanceLabel(a.publicAssistanceSelfReport)}
        </li>
        {a.publicAssistanceSelfReport === true ? (
          <>
            <li>
              <strong>Programs named (self-reported, unverified):</strong> {publicAssistanceProgramsLabel(a)}
            </li>
            <li>
              <strong>Wants help applying for benefits:</strong> {publicAssistanceHelpLabel(a)}
            </li>
          </>
        ) : null}
        <li>
          <strong>Training interest:</strong> {a.trainingInterest ? 'Yes' : 'No'}
        </li>
        <li>
          <strong>Intake complete (self-reported):</strong> {a.completedIntakeSelfReport ? 'Yes' : 'No'}
        </li>
      </ul>

      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Screening explanations (staff copy)</summary>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.88rem' }}>
          {formatWioaReasons(snapshot).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>

      <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem' }}>
        <label htmlFor="wioa-review-status" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
          Staff review status
        </label>
        <select
          id="wioa-review-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as WioaReviewStatus)}
          style={{ width: '100%', maxWidth: '320px', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: '6px' }}
        >
          {WIOA_REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WIOA_REVIEW_LABELS[s]}
            </option>
          ))}
        </select>

        <label htmlFor="wioa-review-notes" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
          Internal notes
        </label>
        <textarea
          id="wioa-review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Documentation, follow-ups, AJC referral, etc."
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '6px',
            fontFamily: 'inherit',
            marginBottom: '0.75rem',
          }}
        />

        {err ? (
          <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            {err}
          </p>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving} aria-busy={saving}>
          <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {saving ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
                Saving…
              </>
            ) : (
              'Save review'
            )}
          </span>
        </button>

        {savedAt && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            Last saved: {new Date(savedAt).toLocaleString()}
            {savedReviewer ? ` · ${savedReviewer}` : ''}
          </p>
        )}
      </div>

      {decisionHistory.length > 0 && (
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Decision history</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
            Immutable record — one row per WIOA review, application decision, or enrollment funding decision.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {decisionHistory.map((row) => (
              <li
                key={row.id}
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--outline-variant)',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{SOURCE_LABEL[row.source] ?? row.source}: {row.decision}</strong>
                  <span style={{ color: 'var(--color-on-surface-variant)' }}>
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                  {row.actorEmailSnapshot ?? 'unknown actor'}
                  {row.actorRoleSnapshot ? ` (${row.actorRoleSnapshot})` : ''}
                </div>
                {row.notes && <p style={{ margin: '0.35rem 0 0' }}>{row.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
