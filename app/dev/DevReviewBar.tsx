import Link from 'next/link';
import styles from './review-navigation.module.css';

/** Fixture wayfinding; available screens do not imply authenticated actions work. */
export default function DevReviewBar() {
  return (
    <nav aria-label="Preview review" className={styles.bar}>
      <Link href="/dev/portal-review" prefetch={false} className="wa-kit-focus">Review screens & flows</Link>
      <span>Sample data</span>
    </nav>
  );
}
