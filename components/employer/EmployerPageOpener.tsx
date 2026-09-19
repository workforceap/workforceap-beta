import type { ReactNode } from 'react';
import PortalBreadcrumb, { type PortalBreadcrumbItem } from '@/components/portal/PortalBreadcrumb';
import { PageOpener } from '@/components/portal/kit/PageOpener';
import styles from './EmployerPageOpener.module.css';

/** Employer wayfinding and actions composed around the shared portal page heading. */
export default function EmployerPageOpener({
  kicker,
  title,
  subtitle,
  action,
  breadcrumbs,
}: {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  breadcrumbs?: PortalBreadcrumbItem[];
}) {
  return (
    <div className={styles.root}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className={styles.breadcrumbs}><PortalBreadcrumb items={breadcrumbs} /></div>
      ) : null}
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
