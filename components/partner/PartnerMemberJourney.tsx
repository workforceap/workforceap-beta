import { Check } from 'lucide-react';
import styles from './PartnerMemberDetail.module.css';

export interface PartnerJourneyStep {
  key: string;
  label: string;
  detail: string;
  /** Preformatted date (portal timezone) or null when there is no signal yet. */
  date: string | null;
  done: boolean;
  /** Reported but not yet verified (placement only). */
  pending?: boolean;
}

/**
 * Numbered milestone timeline for the partner member detail page. The first
 * step that is not done is marked current so the partner sees where the
 * member is right now.
 */
export default function PartnerMemberJourney({ steps }: { steps: PartnerJourneyStep[] }) {
  const currentIdx = steps.findIndex((step) => !step.done);
  return (
    <ol className={styles.journey}>
      {steps.map((step, idx) => {
        const state = step.done ? 'done' : step.pending ? 'pending' : idx === currentIdx ? 'current' : 'upcoming';
        const stateClass =
          state === 'done'
            ? styles.stepDone
            : state === 'pending'
              ? styles.stepPending
              : state === 'current'
                ? styles.stepCurrent
                : '';
        const srState =
          state === 'done'
            ? 'Completed: '
            : state === 'pending'
              ? 'Pending verification: '
              : state === 'current'
                ? 'Current step: '
                : 'Not yet reached: ';
        return (
          <li key={step.key} className={`${styles.step} ${stateClass}`} data-state={state}>
            <span className={styles.node} aria-hidden>
              {step.done ? <Check size={16} strokeWidth={3} /> : idx + 1}
            </span>
            <div className={styles.stepBody}>
              <div className={styles.stepHead}>
                <p className={styles.stepLabel}>
                  <span className="wa-sr-only">{srState}</span>
                  {step.label}
                </p>
                {step.date ? <p className={styles.stepDate}>{step.date}</p> : null}
              </div>
              <p className={styles.stepDetail}>{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
