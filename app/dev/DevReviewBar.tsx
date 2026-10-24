import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './review-navigation.module.css';

/** Fixture wayfinding; available screens do not imply authenticated actions work. */
export default function DevReviewBar({ notice }: { notice?: ReactNode }) {
  return (
    <nav aria-label="Preview review" className={styles.bar}>
      <details className={styles.previewDetails}>
        <summary className="wa-kit-focus">Sample data</summary>
        <p>{notice ?? 'Live actions require an approved test account.'}</p>
      </details>
      <Link href="/dev/portal-review" prefetch={false} className="wa-kit-focus">Review screens</Link>
    </nav>
  );
}
