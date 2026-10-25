import type { CSSProperties, ElementType, ReactNode } from 'react';
import Link from 'next/link';
import type { LinkProps } from 'next/link';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { cx } from '@/components/portal/kit';
import styles from './MemberTaskRow.module.css';

/**
 * Row building blocks for the member home "This week" card. They sit on the
 * shared kit recipe (`.wa-kit-task-row`, css/portal-kit.css) and only add what
 * the home needs on top of it: a row with inline controls, a row that is one
 * big link, and the "What happens next" disclosure that keeps the long
 * explanation off the main line.
 *
 * All three render `<li>`, so they must sit inside the card's `<ol>`.
 */

export type TaskRowState = 'todo' | 'current' | 'done';

/** The decorative round dot / check at the start of a row. */
export function TaskRowCheck({ done = false }: { done?: boolean }) {
  return (
    <span className="wa-kit-task-row__check" aria-hidden="true">
      {done ? <Check /> : null}
    </span>
  );
}

/**
 * Split a long line into a one-line lead and the rest, on the first sentence
 * end. Nothing is dropped: the caller shows `lead` on the row and `rest` in a
 * disclosure. A body that is short enough, or has no clean sentence break
 * inside `max` characters, comes back whole with an empty `rest`.
 */
export function splitLead(text: string, max = 90): { lead: string; rest: string } {
  const body = text.trim();
  if (body.length <= max) return { lead: body, rest: '' };
  const match = body.match(/^([\s\S]+?[.!?])\s+([\s\S]+)$/);
  if (match && match[1].length <= max && match[2].trim()) {
    return { lead: match[1], rest: match[2].trim() };
  }
  return { lead: body, rest: '' };
}

/**
 * Inline controls under a row's text (Yes / Not yet, the check-in answers).
 * Pass `labelledBy` (the id of the question the buttons answer) when the
 * buttons' own names do not carry the question, so assistive tech reads the
 * answers as one group under it.
 */
export function TaskRowActions({ children, labelledBy, style }: { children: ReactNode; labelledBy?: string; style?: CSSProperties }) {
  return (
    <div className={styles.actions} role={labelledBy ? 'group' : undefined} aria-labelledby={labelledBy} style={style}>
      {children}
    </div>
  );
}

/** "What happens next": a quiet disclosure for the long explanation. */
export function WhatNext({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={styles.more}>
      <summary className={cx('wa-kit-focus', styles.moreSummary)}>
        {label}
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </summary>
      <div className={styles.moreBody}>{children}</div>
    </details>
  );
}

/**
 * A row that holds its own controls (buttons, a CTA pill, a disclosure). The
 * title and subline are plain text; `children` render under the subline, and
 * `trailing` is the right-aligned action (or a `.wa-kit-date-chip`).
 */
export function MemberTaskRow({
  state = 'todo',
  title,
  titleAs: Title = 'p',
  sub,
  trailing,
  children,
  testId,
  live = false,
}: {
  state?: TaskRowState;
  title: ReactNode;
  titleAs?: ElementType;
  sub?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  testId?: string;
  /** Announce the row's text when it appears or changes (an acknowledgement). */
  live?: boolean;
}) {
  return (
    <li
      className={cx('wa-kit-task-row', styles.row, !trailing && styles.noTrailing, children ? styles.tall : undefined)}
      data-state={state}
      data-testid={testId}
    >
      <TaskRowCheck done={state === 'done'} />
      <div className="wa-kit-task-row__body" role={live ? 'status' : undefined}>
        <Title className={cx('wa-kit-task-row__title', styles.title)}>{title}</Title>
        {sub ? <p className="wa-kit-task-row__sub">{sub}</p> : null}
        {children}
      </div>
      {trailing}
    </li>
  );
}

/**
 * A row that is one big link: tap anywhere to go. `cta` is the right-aligned
 * text action.
 */
export function MemberTaskLinkRow({
  href,
  state = 'todo',
  title,
  sub,
  cta,
  testId,
  dataAttrs,
}: {
  href: LinkProps['href'];
  state?: TaskRowState;
  title: ReactNode;
  sub?: ReactNode;
  cta: ReactNode;
  testId?: string;
  /** Extra `data-*` hooks on the link (tests, analytics). */
  dataAttrs?: Record<`data-${string}`, string>;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cx('wa-kit-task-row wa-kit-task-row--link wa-kit-focus', styles.linkRow)}
        data-state={state}
        data-testid={testId}
        {...dataAttrs}
      >
        <TaskRowCheck done={state === 'done'} />
        <span className="wa-kit-task-row__body">
          <span className={cx('wa-kit-task-row__title', styles.title, styles.block)}>{title}</span>
          {sub ? <span className={cx('wa-kit-task-row__sub', styles.block, styles.clamp)}>{sub}</span> : null}
        </span>
        <span className={styles.action}>
          <span className={styles.actionLabel}>{cta}</span> <ArrowRight size={14} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}
