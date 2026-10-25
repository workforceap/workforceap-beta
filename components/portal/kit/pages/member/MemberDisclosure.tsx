import type { ReactNode } from 'react';
import { cx } from '@/components/portal/kit';
import styles from './memberPages.module.css';

/**
 * One line, plus a "what happens next" disclosure for the rest.
 *
 * The member pages keep the main line short (one idea, under 90 characters)
 * and tuck the explanation behind a native `<details>`: it works before
 * hydration, needs no state, and the full text stays in the document for
 * assistive tech and search. Server-safe (no hooks).
 */

export function MemberDisclosure({
  summary,
  children,
  className,
}: {
  /** The disclosure label, e.g. "What happens next". */
  summary: ReactNode;
  /** The full explanation. Plain text or inline markup. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cx(styles.disclosure, className)}>
      <summary className="wa-kit-focus">{summary}</summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

/** A page's context line with its explanation folded under a disclosure. */
export function MemberContextNote({
  line,
  moreLabel,
  more,
}: {
  line: ReactNode;
  moreLabel: ReactNode;
  more: ReactNode;
}) {
  return (
    <div className={styles.contextNote}>
      <p className={styles.contextLine}>{line}</p>
      <MemberDisclosure summary={moreLabel}>{more}</MemberDisclosure>
    </div>
  );
}
