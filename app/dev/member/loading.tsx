import styles from '../review-navigation.module.css';

export default function Loading() {
  return <section className={styles.loading} role="status" aria-live="polite"><h2>Opening screen…</h2><p>The local preview may take longer the first time a page opens.</p></section>;
}
