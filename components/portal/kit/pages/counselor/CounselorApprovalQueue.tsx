import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { KitEmptyState, StatusTag, type KitTone } from '@/components/portal/kit';
import { cx } from '@/components/portal/kit/base';
import { toneClass } from '@/components/portal/kit/tokens';
import {
  APPROVAL_REVIEW_ANCHOR,
  type ApprovalDecisionKind,
  type ApprovalQueue,
  type ApprovalQueueRow,
} from '@/lib/counselor/approvalQueue';
import { programDisplayTitle } from '@/lib/content/programTitle';

/**
 * Counselor Today — "Waiting on your decision".
 *
 * Every application and intake check that only this counselor can move,
 * oldest first, with an age clock (lib/counselor/approvalQueue.ts). Rows
 * over the SLA carry the kit `warn` tone, rows over twice the SLA `alert`;
 * both paint through the `.wa-kit-tone--*` hooks, never a literal colour.
 * The whole row is a link to the Application review panel on the member's
 * page (`#counselor-intake-review-panel`), where the decision is recorded.
 *
 * Empty and failed states use the same KitEmptyState the Today groups use:
 * an empty queue is `clear` (zero decisions is the goal), a failed load is
 * `unavailable` + danger (role="alert") with a Retry, never a confirmed empty.
 * Pure and serializable: no clock reads, so a render test is deterministic.
 *
 * The admin Today page (/admin, WAP-190) renders the same list over the
 * whole organization: `rowHrefs` sends each row to the admin screen that
 * records that decision, `description` / `emptyDescription` swap the
 * caseload wording, and `total` + `moreLinks` say honestly when the list is
 * the oldest slice of a longer queue ("Showing the 50 oldest of 75").
 */

export interface CounselorApprovalQueueProps {
  queue: ApprovalQueue;
  /** True when the queue could not be loaded; the section shows a retry instead of rows. */
  loadError?: boolean;
  memberHrefBase?: string;
  retryHref?: string;
  /**
   * `row.key` → where that row opens. Rows without an entry open the counselor
   * review panel under `memberHrefBase`. Plain data, so the prop serializes.
   */
  rowHrefs?: Readonly<Record<string, string>>;
  /** Line under the heading; defaults to the counselor caseload wording. */
  description?: ReactNode;
  /** Empty-state description; defaults to the counselor caseload wording. */
  emptyDescription?: string;
  /**
   * Every decision waiting when `queue.rows` is only the oldest slice. The
   * count chip prints this number and a note says how many rows are shown.
   */
  total?: number;
  /** Where the rest of a truncated queue lives, printed after the note. */
  moreLinks?: ReadonlyArray<{ label: string; href: string }>;
}

export const APPROVAL_QUEUE_TITLE = 'Waiting on your decision';
export const APPROVAL_QUEUE_EMPTY_TITLE = 'Nothing is waiting on you';
export const APPROVAL_QUEUE_LOAD_FAILED_TITLE = "Couldn't load the approval queue";

const KIND_ICON: Record<ApprovalDecisionKind, LucideIcon> = {
  application: ClipboardCheck,
  intake: ShieldCheck,
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function approvalReviewHref(memberId: string, memberHrefBase = '/counselor/students'): string {
  return `${memberHrefBase}/${encodeURIComponent(memberId)}#${APPROVAL_REVIEW_ANCHOR}`;
}

function rowMeta(row: ApprovalQueueRow): string {
  const parts = [row.awaiting];
  if (row.programInterest) parts.push(programDisplayTitle(row.programInterest) || row.programInterest);
  if (row.detail) parts.push(row.detail);
  parts.push(row.memberEmail);
  return parts.join(' · ');
}

function ApprovalRow({ row, href }: { row: ApprovalQueueRow; href: string }) {
  const Icon = KIND_ICON[row.kind];
  const toned = row.tone !== 'muted';
  const tagTone: KitTone = row.tone;
  return (
    <li>
      <Link
        href={href}
        className={cx('wa-kit-card wa-kit-card--sm wa-kit-focus', toned && toneClass(row.tone), 'wa-kit-tone-edge')}
        data-testid="approval-row"
        data-kind={row.kind}
        data-tone={row.tone}
        aria-label={`${row.awaiting} for ${row.memberName}, ${row.ageLabel}`}
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}
      >
        <span className="wa-kit-tone-icon">
          <Icon size={16} aria-hidden />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <strong style={{ color: 'var(--wa-text)' }}>{row.memberName}</strong>
          <span className="wa-kit-meta" style={{ color: 'var(--wa-muted)' }}>{rowMeta(row)}</span>
        </span>
        <StatusTag tone={tagTone} style={{ flexShrink: 0 }}>{row.ageLabel}</StatusTag>
      </Link>
    </li>
  );
}

export function CounselorApprovalQueue({
  queue,
  loadError = false,
  memberHrefBase = '/counselor/students',
  retryHref = '/counselor/today',
  rowHrefs,
  description,
  emptyDescription = 'Every application and intake check on your caseload has a decision.',
  total,
  moreLinks,
}: CounselorApprovalQueueProps) {
  const headingId = 'today-approvals-title';
  const count = loadError ? 0 : queue.rows.length;
  // An empty list is an empty queue: a count read a moment before the last
  // decision landed must not print "3 decisions" over "Nothing is waiting".
  const waiting = loadError || count === 0 ? 0 : Math.max(count, total ?? count);
  const truncated = waiting > count;
  const countTone: KitTone = count === 0
    ? 'muted'
    : queue.totals.overDoubleSla > 0
      ? 'alert'
      : queue.totals.overSla > 0
        ? 'warn'
        : 'info';
  const sla = queue.slaBusinessDays;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="today-approval-queue"
      data-count={count}
      data-total={waiting}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id={headingId} className="wa-text-xl wa-font-extrabold" style={{ letterSpacing: '-0.02em', margin: 0 }}>
          {APPROVAL_QUEUE_TITLE}
        </h2>
        <StatusTag tone={countTone}>{plural(waiting, 'decision')}</StatusTag>
      </div>
      <p className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-muted)' }}>
        {description ?? 'Applications and intake checks only you can move, oldest first.'} Past {plural(sla, 'business day')} they turn gold;
        past {plural(sla * 2, 'business day')}, red.
      </p>
      {loadError ? (
        <KitEmptyState
          kind="unavailable"
          tone="danger"
          title={APPROVAL_QUEUE_LOAD_FAILED_TITLE}
          description="The decisions list did not answer. The rest of Today is unaffected."
          headingAs="h3"
          primaryAction={{ label: 'Retry', href: retryHref }}
        />
      ) : count === 0 ? (
        <KitEmptyState
          kind="clear"
          title={APPROVAL_QUEUE_EMPTY_TITLE}
          description={emptyDescription}
          headingAs="h3"
        />
      ) : (
        <>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {queue.rows.map((row) => (
              <ApprovalRow key={row.key} row={row} href={rowHrefs?.[row.key] ?? approvalReviewHref(row.memberId, memberHrefBase)} />
            ))}
          </ul>
          {truncated ? (
            <p className="wa-kit-meta" data-testid="approval-queue-truncated" style={{ margin: 0, color: 'var(--wa-muted)' }}>
              Showing the {count} oldest of {plural(waiting, 'decision')}.
              {moreLinks && moreLinks.length > 0 ? (
                <>
                  {' '}The rest are in{' '}
                  {moreLinks.map((link, index) => (
                    <span key={link.href}>
                      {index > 0 ? (index === moreLinks.length - 1 ? ' and ' : ', ') : null}
                      <Link href={link.href} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                        {link.label}
                      </Link>
                    </span>
                  ))}
                  .
                </>
              ) : null}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
