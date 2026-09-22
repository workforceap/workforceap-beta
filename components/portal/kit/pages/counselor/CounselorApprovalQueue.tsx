import Link from 'next/link';
import { ClipboardCheck, ShieldCheck, RotateCcw } from 'lucide-react';
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
 * Empty and failed states use the same KitEmptyState the Today groups use.
 * Pure and serializable: no clock reads, so a render test is deterministic.
 */

export interface CounselorApprovalQueueProps {
  queue: ApprovalQueue;
  /** True when the queue could not be loaded; the section shows a retry instead of rows. */
  loadError?: boolean;
  memberHrefBase?: string;
  retryHref?: string;
}

export const APPROVAL_QUEUE_TITLE = 'Waiting on your decision';
export const APPROVAL_QUEUE_EMPTY_TITLE = 'Nothing is waiting on you';

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

function ApprovalRow({ row, memberHrefBase }: { row: ApprovalQueueRow; memberHrefBase: string }) {
  const Icon = KIND_ICON[row.kind];
  const toned = row.tone !== 'muted';
  const tagTone: KitTone = row.tone;
  return (
    <li>
      <Link
        href={approvalReviewHref(row.memberId, memberHrefBase)}
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
}: CounselorApprovalQueueProps) {
  const headingId = 'today-approvals-title';
  const count = loadError ? 0 : queue.rows.length;
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
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id={headingId} className="wa-text-xl wa-font-extrabold" style={{ letterSpacing: '-0.02em', margin: 0 }}>
          {APPROVAL_QUEUE_TITLE}
        </h2>
        <StatusTag tone={countTone}>{plural(count, 'decision')}</StatusTag>
      </div>
      <p className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-muted)' }}>
        Applications and intake checks only you can move, oldest first. Past {plural(sla, 'business day')} they turn gold;
        past {plural(sla * 2, 'business day')}, red.
      </p>
      {loadError ? (
        <KitEmptyState
          title="Couldn't load the approval queue"
          description="The decisions list did not answer. The rest of Today is unaffected."
          headingAs="h3"
          action={
            <Link href={retryHref} className="wa-kit-cta">
              <RotateCcw size={14} aria-hidden style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Retry
            </Link>
          }
        />
      ) : count === 0 ? (
        <KitEmptyState
          title={APPROVAL_QUEUE_EMPTY_TITLE}
          description="Every application and intake check on your caseload has a decision."
          headingAs="h3"
        />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
          {queue.rows.map((row) => (
            <ApprovalRow key={row.key} row={row} memberHrefBase={memberHrefBase} />
          ))}
        </ul>
      )}
    </section>
  );
}
