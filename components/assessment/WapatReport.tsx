import { formatWapatPct, WAPAT_FULL_NAME, type WapatResult, type WapatScore } from '@/lib/assessment/wapat';
import WapatScoreBar from './WapatScoreBar';
import styles from './WapatReport.module.css';

/**
 * Plain meaning of each section, in the student's own words. These describe
 * this assessment only: they claim no outside test or program equivalence.
 */
const SECTION_MEANING: Partial<Record<WapatScore['key'], string>> = {
  vocabulary: 'Word meaning across the first 10 questions.',
  reading: 'Reading a passage and answering questions 11 to 24.',
  math: 'Numbers and reasoning across questions 25 to 35.',
};

/**
 * The WAPAT report: four scores from the same 35 answers. Client-safe (props
 * only, no answer key). Unavailable scores say so; they are never shown as 0.
 */
export default function WapatReport({ result, heading = WAPAT_FULL_NAME }: { result: WapatResult; heading?: string }) {
  const rows = [...result.sections, result.total];
  return (
    <section aria-label="WAPAT report" data-testid="wapat-report">
      <h3 className={styles.heading}>{heading}</h3>
      <ul className={styles.list}>
        {rows.map((s) => {
          const meaning = SECTION_MEANING[s.key];
          return (
            <li key={s.key} data-testid={`wapat-${s.key}`} className={`${styles.row} ${s.key === 'total' ? styles.total : ''}`}>
              <span className={styles.label}>
                {s.label} <span className={styles.range}>({s.range})</span>
                {meaning ? <span className={styles.meaning}>{meaning}</span> : null}
              </span>
              {s.available && s.pct !== null && s.key !== 'total'
                ? <WapatScoreBar label={s.label} value={s.pct} />
                : <span className={styles.barGap} aria-hidden="true" />}
              <span className={styles.num}>{s.available ? `${s.correct}/${s.total}` : '—'}</span>
              <span className={styles.num}>{formatWapatPct(s)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
