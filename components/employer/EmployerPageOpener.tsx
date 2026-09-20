import type { ReactNode } from 'react';
import { PageOpener } from '@/components/portal/kit/PageOpener';
import styles from './EmployerPageOpener.module.css';

/**
 * Employer page start: kicker + h1 + lede with the route's actions, composed
 * on the shared kit `PageOpener`. Per `docs/KIT_GUIDE.md` §6 the opener is
 * "not `PageHeader` breadcrumbs" — wayfinding lives in the kicker and in
 * explicit back links, never in a breadcrumb row above the title.
 */
export default function EmployerPageOpener({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.root}>
      <PageOpener
        className={styles.opener}
        kicker={kicker}
        title={title}
        lede={typeof subtitle === 'string' ? subtitle : undefined}
        action={action ? <div className={styles.actions}>{action}</div> : undefined}
      />
      {subtitle && typeof subtitle !== 'string' ? <p className="wa-page-opener-lede">{subtitle}</p> : null}
    </div>
  );
}
