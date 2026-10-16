'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
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
 *
 * Admin Today (/admin) uses the same list over the whole organization with
 * filter chips (All / Overdue red / Overdue gold / WIOA) and 25-row pagination
 * over the loaded slice (UI-07). Server still caps the slice; truncation notes
 * remain when `total` exceeds loaded rows.
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

/** Page size for the decision list (UI-07). Independent of kit table page size. */
export const APPROVAL_QUEUE_PAGE_SIZE = 25;

type ApprovalFilter = 'all' | 'alert' | 'warn' | 'intake';

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

function matchesFilter(row: ApprovalQueueRow, filter: ApprovalFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'alert':
      return row.tone === 'alert';
    case 'warn':
      return row.tone === 'warn';
    case 'intake':
      return row.kind === 'intake';
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
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
  const [filter, setFilter] = useState<ApprovalFilter>('all');
  const [page, setPage] = useState(1);

  const loadedCount = loadError ? 0 : queue.rows.length;
  // An empty list is an empty queue: a count read a moment before the last
  // decision landed must not print "3 decisions" over "Nothing is waiting".
  const waiting = loadError || loadedCount === 0 ? 0 : Math.max(loadedCount, total ?? loadedCount);
  const truncated = waiting > loadedCount;
  const countTone: KitTone = loadedCount === 0
    ? 'muted'
    : queue.totals.overDoubleSla > 0
      ? 'alert'
      : queue.totals.overSla > 0
        ? 'warn'
        : 'info';
  const sla = queue.slaBusinessDays;

  const filterCounts = useMemo(() => {
    const rows = queue.rows;
    return {
      all: rows.length,
      alert: rows.filter((r) => r.tone === 'alert').length,
      warn: rows.filter((r) => r.tone === 'warn').length,
      intake: rows.filter((r) => r.kind === 'intake').length,
    };
  }, [queue.rows]);

  const filteredRows = useMemo(
    () => queue.rows.filter((row) => matchesFilter(row, filter)),
    [queue.rows, filter],
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / APPROVAL_QUEUE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice(
    (safePage - 1) * APPROVAL_QUEUE_PAGE_SIZE,
    safePage * APPROVAL_QUEUE_PAGE_SIZE,
  );

  const selectFilter = (next: ApprovalFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="today-approval-queue"
      data-count={loadedCount}
      data-total={waiting}
      data-filter={filter}
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
      ) : loadedCount === 0 ? (
        <KitEmptyState
          kind="clear"
          title={APPROVAL_QUEUE_EMPTY_TITLE}
          description={emptyDescription}
          headingAs="h3"
        />
      ) : (
        <>
          <div className="wa-kit-view-chips" data-testid="approval-queue-filters">
            <SegmentedControl
              value={filter}
              onChange={(v) => selectFilter(v as ApprovalFilter)}
              label="Decision filters"
              size="sm"
              layout="hug"
            >
              <SegmentedControlItem value="all" label={`All · ${filterCounts.all}`} />
              <SegmentedControlItem value="alert" label={`Overdue >${sla * 2}d · ${filterCounts.alert}`} />
              <SegmentedControlItem value="warn" label={`Overdue >${sla}d · ${filterCounts.warn}`} />
              <SegmentedControlItem value="intake" label={`WIOA pending · ${filterCounts.intake}`} />
            </SegmentedControl>
          </div>
          {filteredRows.length === 0 ? (
            <KitEmptyState
              kind="clear"
              title="No decisions in this filter"
              description="Try All, or another urgency chip."
              headingAs="h3"
            />
          ) : (
            <>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {pageRows.map((row) => (
                  <ApprovalRow key={row.key} row={row} href={rowHrefs?.[row.key] ?? approvalReviewHref(row.memberId, memberHrefBase)} />
                ))}
              </ul>
              {filteredRows.length > APPROVAL_QUEUE_PAGE_SIZE ? (
                <nav
                  aria-label="Decision queue pagination"
                  data-testid="approval-queue-pagination"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}
                >
                  <p className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-muted)' }}>
                    Showing {(safePage - 1) * APPROVAL_QUEUE_PAGE_SIZE + 1}–
                    {Math.min(safePage * APPROVAL_QUEUE_PAGE_SIZE, filteredRows.length)} of {plural(filteredRows.length, 'decision')}
                    {filter !== 'all' ? ' in this filter' : ''}.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </nav>
              ) : null}
            </>
          )}
          {truncated ? (
            <p className="wa-kit-meta" data-testid="approval-queue-truncated" style={{ margin: 0, color: 'var(--wa-muted)' }}>
              Showing the {loadedCount} oldest of {plural(waiting, 'decision')}.
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
