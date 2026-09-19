import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { barrierLabel, formatWioaReasons, publicAssistanceLabel } from '@/lib/wioa/wioaQualification';
import { wioaReviewLabel } from '@/lib/wioa/wioaReview';

const AGE_LABEL: Record<string, string> = {
  under18: 'Under 18',
  '18_24': '18–24',
  '25_54': '25–54',
  '55_plus': '55+',
};

type Props = {
  snapshot: WioaQualificationSnapshot;
  reviewStatus: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewNotes: string | null;
};

export default function WioaScreeningReadonly({ snapshot, reviewStatus, reviewedAt, reviewerName, reviewNotes }: Props) {
  const a = snapshot.answers;
  return (
    <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>WIOA self-screening</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
        Submitted {new Date(snapshot.submittedAt).toLocaleString()} · Portal signal: <strong>{snapshot.signal}</strong>
      </p>
      <ul style={{ fontSize: '0.9rem', marginBottom: '0.75rem', paddingLeft: '1.25rem', lineHeight: 1.5 }}>
        <li>
          <strong>Age:</strong> {AGE_LABEL[a.ageBracket] ?? a.ageBracket}
        </li>
        <li>
          <strong>Location:</strong> {a.countyOrZip?.trim() || '—'}
        </li>
        <li>
          <strong>Barrier:</strong> {barrierLabel(a.primaryBarrier)}
        </li>
        <li>
          <strong>Dislocated worker:</strong> {a.dislocatedWorker ? 'Yes' : 'No'}
        </li>
        <li>
          <strong>Receiving TANF / WIC / Food stamps (SNAP):</strong> {publicAssistanceLabel(a.publicAssistanceSelfReport)}
        </li>
      </ul>
      <details style={{ marginBottom: '0.75rem' }}>
        <summary>Screening explanations (staff copy)</summary>
        <ul>{formatWioaReasons(snapshot).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      </details>
      {(reviewStatus || reviewNotes) && (
        <div style={{ fontSize: '0.9rem', paddingTop: '0.5rem', borderTop: '1px solid var(--outline-variant)' }}>
          <p style={{ marginBottom: '0.25rem' }}>
            <strong>Staff status:</strong> {wioaReviewLabel(reviewStatus)}
          </p>
          {reviewedAt && (
            <p style={{ marginBottom: '0.25rem', color: 'var(--color-on-surface-variant)' }}>
              Reviewed {new Date(reviewedAt).toLocaleString()}
              {reviewerName ? ` · ${reviewerName}` : ''}
            </p>
          )}
          {reviewNotes ? (
            <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
              <strong>Notes:</strong> {reviewNotes}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
