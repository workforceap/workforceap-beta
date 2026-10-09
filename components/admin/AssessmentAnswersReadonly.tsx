import type { AssessmentReviewRow } from '@/lib/assessment/reviewRows';
import { mostRepeatedAnswerCount, STRAIGHT_LINE_MIN_SAME } from '@/lib/assessment/answerPattern';
import styles from './staffReadonly.module.css';

type Props = {
  rows: AssessmentReviewRow[];
  score: number | null;
  scorePct: number | null;
  completedAt: Date | string | null;
  programInterest?: string | null;
  /** Section heading; defaults to the member-facing name of the check. */
  title?: string;
};

/**
 * Staff-facing preassessment answer sheet (admin member detail, counselor
 * student detail). Rows come from the server-only review helper so the
 * answer key never reaches the browser. Kit `.wa-kit-card` with the section
 * h2 + `.wa-kit-meta` caption from staffReadonly.module.css; the ✓ / ✗ marks
 * paint from the kit tone hooks (`ok` / `danger`), not `--color-*`.
 */
export default function AssessmentAnswersReadonly({
  rows,
  score,
  scorePct,
  completedAt,
  programInterest,
  title = 'Training preassessment (skills check)',
}: Props) {
  const completed = completedAt ? new Date(completedAt) : null;
  const correctCount = rows.filter((r) => r.correct).length;
  // Ops (10/9/26): results saved before the same-letter guard (e.g. "A" for
  // all 35) are not a skills measure. Say so where staff read the score.
  const chosen = Object.fromEntries(rows.flatMap((r) => (r.answer ? [[r.id, r.answer]] : [])));
  const sameLetter = mostRepeatedAnswerCount(chosen);
  const unreliable = sameLetter >= STRAIGHT_LINE_MIN_SAME;
  return (
    <section className="wa-kit-card">
      <h2 className={styles.title}>{title}</h2>
      <p className={`wa-kit-meta ${styles.lede}`}>
        {completed ? `Submitted ${completed.toLocaleString()}` : 'Submitted'}
        {score != null ? ` · Score ${score} (${scorePct ?? 0}%)` : ''}
        {` · ${correctCount}/${rows.length} correct`}
        {programInterest ? ` · Interest: ${programInterest}` : ''}
      </p>
      {unreliable ? (
        <p className={`wa-kit-tone--danger ${styles.unreliable}`} role="note" data-testid="assessment-unreliable">
          <strong>Score not reliable:</strong> {sameLetter} of {rows.length} answers are the same letter, which usually means the
          member clicked through. Ask them to retake it before using this score for WIOA review.
        </p>
      ) : null}
      <details className={styles.body}>
        <summary className={styles.summary}>
          Full answer sheet ({rows.length} questions)
        </summary>
        <ol className={styles.answers}>
          {rows.map((r) => (
            <li key={r.id} className={styles.answer}>
              <span>{r.question}</span>
              {' — '}
              <strong>{r.answer ? `${r.answer}: ${r.answerLabel ?? ''}` : 'not answered'}</strong>{' '}
              <span
                aria-label={r.correct ? 'correct' : 'incorrect'}
                className={`${styles.mark} ${r.correct ? 'wa-kit-tone--ok' : 'wa-kit-tone--danger'}`}
              >
                {r.correct ? '✓' : '✗'}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
