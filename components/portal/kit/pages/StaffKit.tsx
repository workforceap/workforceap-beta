import type { CSSProperties, ReactNode } from 'react';
import styles from './StaffKit.module.css';

/**
 * Small presentational pieces shared by the staff, admin, counselor, employer
 * and partner command views, so they read as one product with the member
 * portal: hairline cards, and the C3 task row (status dot, title, subline, right-aligned chip
 * or action; severity colour only on the dot and chip). No data, no
 * permissions and no queries live here.
 */

export type StaffTone = 'red' | 'yellow' | 'blue' | 'done' | 'neutral';

const DOT_CLASS: Record<StaffTone, string> = {
  red: styles.dotRed,
  yellow: styles.dotYellow,
  blue: styles.dotBlue,
  done: styles.dotDone,
  neutral: '',
};

/** Class names for the action pill, for callers that render their own link. */
export const staffPillClass = {
  base: styles.pill,
  dark: `${styles.pill} ${styles.pillDark}`,
  primary: `${styles.pill} ${styles.pillPrimary}`,
} as const;

/** Right-aligned card header link ("Manage", "View all"). */
export const staffLinkClass: string = styles.cardLink;

/**
 * The one greeting for a person-facing home (counselor, employer, partner,
 * and the member Home): "Welcome back, Alex." Workspace pages keep their own
 * title ("Command Center", "Students"). A page that translates passes its own
 * string through the kit's `welcomeTitle` prop; this is the English fallback
 * for the dev showcase and direct renders.
 */
export function staffWelcomeTitle(firstName: string): string {
  return `Welcome back, ${firstName.trim()}.`;
}

export function StaffCard({
  title,
  meta,
  action,
  id,
  flush = false,
  children,
  ...rest
}: {
  title: string;
  meta?: ReactNode;
  /** Right-aligned header link. */
  action?: ReactNode;
  id?: string;
  /** Rows run edge to edge (task lists) instead of inside the card padding. */
  flush?: boolean;
  children?: ReactNode;
  'data-tour'?: string;
}) {
  return (
    <section
      className={flush ? `${styles.card} ${styles.cardFlush}` : styles.card}
      aria-labelledby={id}
      {...rest}
    >
      <header className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>{title}</h2>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        {action}
      </header>
      {children}
    </section>
  );
}

export function StaffSplit({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.main}>{main}</div>
      <aside className={styles.rail}>{rail}</aside>
    </div>
  );
}

/** KPI strip wrapper: one hairline card around the shared tiles. */
export function StaffKpiGroup({ cols = 4, children }: { cols?: 4 | 5 | 6; children: ReactNode }) {
  return (
    <div className={styles.kpis} style={{ '--staff-kpi-cols': cols } as CSSProperties}>
      {children}
    </div>
  );
}

export function StaffTaskList({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className={styles.tasks} aria-label={label}>{children}</ul>;
}

export function StaffTaskRow({
  tone = 'neutral',
  title,
  subline,
  flag,
  flagTone,
  action,
}: {
  tone?: StaffTone;
  title: ReactNode;
  subline?: ReactNode;
  /** Short chip before the action, e.g. "Urgent". */
  flag?: string;
  flagTone?: 'red' | 'yellow' | 'neutral';
  /** A link or button; use `staffPillClass` for the pill look. */
  action?: ReactNode;
}) {
  const chipClass =
    flagTone === 'red'
      ? `${styles.chip} ${styles.chipRed}`
      : flagTone === 'yellow'
        ? `${styles.chip} ${styles.chipYellow}`
        : styles.chip;
  return (
    <li className={styles.task}>
      <span className={`${styles.dot} ${DOT_CLASS[tone]}`} aria-hidden />
      <span className={styles.taskCopy}>
        <span className={styles.taskTitle}>{title}</span>
        {subline ? <span className={styles.taskSub}>{subline}</span> : null}
      </span>
      {flag || action ? (
        <span className={styles.taskEnd}>
          {flag ? <span className={chipClass}>{flag}</span> : null}
          {action}
        </span>
      ) : null}
    </li>
  );
}

/** One sentence that is the main line of a card (body size, full ink). */
export function StaffLead({ children }: { children: ReactNode }) {
  return <p className={styles.lead}>{children}</p>;
}

/**
 * A collapsed "why" or "what happens next" under a one-line primary text.
 * Native details: works before hydration, keyboard and screen reader friendly,
 * 44px summary target. Children stay in the DOM while collapsed.
 */
export function StaffDisclosure({
  label,
  children,
  ...rest
}: {
  label: string;
  children: ReactNode;
  [dataAttr: `data-${string}`]: string | undefined;
}) {
  return (
    <details className={styles.disclosure} {...rest}>
      <summary className={`${styles.disclosureSummary} wa-kit-focus`}>{label}</summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

export function StaffEmpty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function StaffMeta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}
