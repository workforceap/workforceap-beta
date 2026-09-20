import Link from 'next/link';

/**
 * Shown when an admin Server Component fails to load data (DB timeout, etc.).
 * Kit card on `--wa-*` with the page's single h1 and two real next steps
 * (docs/KIT_GUIDE.md §6a, "Empty / loading / error").
 */
export default function AdminDataLoadError({
  title = 'Could not load this page',
  message = 'There was a problem loading data. This is often temporary — try again in a moment.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section
      data-portal-error-state="admin-data-load"
      role="alert"
      className="wa-kit-card wa-kit-card--sm wa-kit-load-error"
    >
      <h1 className="wa-kit-load-error__title">{title}</h1>
      <p className="wa-kit-lede" style={{ margin: 0 }}>{message}</p>
      <div className="wa-kit-load-error__actions">
        <Link href="/admin" className="wa-kit-cta wa-kit-focus">
          Admin home
        </Link>
        <Link href="/admin/jobs" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
          Jobs
        </Link>
      </div>
    </section>
  );
}
