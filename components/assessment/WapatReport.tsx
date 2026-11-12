import { formatWapatPct, WAPAT_FULL_NAME, type WapatResult } from '@/lib/assessment/wapat';
import styles from './WapatReport.module.css';

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
        {rows.map((s) => (
          <li key={s.key} data-testid={`wapat-${s.key}`} className={`${styles.row} ${s.key === 'total' ? styles.total : ''}`}>
            <span className={styles.label}>
              {s.label} <span className={styles.range}>({s.range})</span>
            </span>
            <span className={styles.num}>{s.available ? `${s.correct}/${s.total}` : '—'}</span>
            <span className={styles.num}>{formatWapatPct(s)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
