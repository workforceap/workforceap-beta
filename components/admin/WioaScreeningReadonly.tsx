import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { barrierLabel, formatWioaReasons, publicAssistanceHelpLabel, publicAssistanceLabel, publicAssistanceProgramsLabel } from '@/lib/wioa/wioaQualification';
import { wioaReviewLabel } from '@/lib/wioa/wioaReview';
import styles from './staffReadonly.module.css';

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

/**
 * Staff read-only view of a member's WIOA self-screening (admin member detail,
 * counselor student detail Profile tab). Kit `.wa-kit-card` with the section
 * h2 + `.wa-kit-meta` captions from staffReadonly.module.css — no inline sizes.
 */
export default function WioaScreeningReadonly({ snapshot, reviewStatus, reviewedAt, reviewerName, reviewNotes }: Props) {
  const a = snapshot.answers;
  return (
    <section className="wa-kit-card">
      <h2 className={styles.title}>WIOA self-screening</h2>
      <p className={`wa-kit-meta ${styles.lede}`}>
        Submitted {new Date(snapshot.submittedAt).toLocaleString()} · Portal signal: <strong>{snapshot.signal}</strong>
      </p>
      <ul className={`${styles.body} ${styles.facts}`}>
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
      </ul>
      <details className={`${styles.body} ${styles.disclosure}`}>
        <summary className={styles.summary}>Screening explanations (staff copy)</summary>
        <ul className={styles.reasons}>{formatWioaReasons(snapshot).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      </details>
      {(reviewStatus || reviewNotes) && (
        <div className={`${styles.body} ${styles.review}`}>
          <p>
            <strong>Staff status:</strong> {wioaReviewLabel(reviewStatus)}
          </p>
          {reviewedAt && (
            <p className="wa-kit-meta">
              Reviewed {new Date(reviewedAt).toLocaleString()}
              {reviewerName ? ` · ${reviewerName}` : ''}
            </p>
          )}
          {reviewNotes ? (
            <p className={styles.reviewNotes}>
              <strong>Notes:</strong> {reviewNotes}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
