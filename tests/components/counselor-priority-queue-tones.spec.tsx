import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CounselorPriorityQueue from '@/components/portal/counselor/CounselorPriorityQueue';
import type { PriorityBucket, PriorityQueueRow } from '@/lib/counselor/priorityQueue';

/**
 * WAP-137 follow-up (counselor audit §4.4): the priority queue's three buckets
 * paint from kit semantic tones (`.wa-kit-tone--alert|warn|ok`, the same
 * vocabulary as `StatusTag`), not from the pre-kit `gold` / `crimson` names.
 * Numbers stay neutral; only the bucket carries a tone; the legacy
 * `--color-gold` / `--color-green` / `--color-blue` variables (unmapped in dark
 * mode) never reach the rendered tree.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

const BUCKET_TONE: Record<PriorityBucket, 'alert' | 'warn' | 'ok'> = {
  critical: 'alert',
  warning: 'warn',
  ontrack: 'ok',
};

function row(bucket: PriorityBucket): PriorityQueueRow {
  return {
    memberId: `member-${bucket}`,
    memberName: `${bucket} member`,
    memberEmail: `${bucket}@example.com`,
    enrolledProgram: null,
    bucket,
    daysSinceLogin: 3,
    hoursWaitingReply: null,
    blockerReason: `${bucket} reason`,
    lastContactAt: null,
    flags: [],
    threadId: null,
  };
}

const ROWS = (['critical', 'warning', 'ontrack'] as const).map(row);
const TOTALS = { critical: 1, warning: 1, ontrack: 1, total: 3 };

describe('CounselorPriorityQueue bucket tones', () => {
  afterEach(cleanup);

  it.each(['critical', 'warning', 'ontrack'] as const)('%s tile and row carry the kit tone class only', (bucket) => {
    const { container } = render(<CounselorPriorityQueue rows={ROWS} totals={TOTALS} />);
    const tone = BUCKET_TONE[bucket];
    const [tile, queueRow] = Array.from(container.querySelectorAll<HTMLElement>(`[data-bucket="${bucket}"]`));
    expect(tile).toBeDefined();
    expect(queueRow).toBeDefined();

    // Tile: tone hook on the card, neutral value (no inline colour at all).
    expect(tile.classList.contains(`wa-kit-tone--${tone}`)).toBe(true);
    expect(tile.querySelector('.wa-kit-tone-icon')).not.toBeNull();
    const value = tile.querySelector<HTMLElement>('.wa-kit-stat-value');
    expect(value?.textContent).toBe('1');
    expect(value?.style.color).toBe('');

    // Row: toned edge + the StatusTag pill in the same tone.
    expect(queueRow.classList.contains(`wa-kit-tone--${tone}`)).toBe(true);
    expect(queueRow.classList.contains('wa-kit-tone-edge')).toBe(true);
    const pill = within(queueRow).getByText(
      bucket === 'critical' ? 'priorityQueueBucketCritical' : bucket === 'warning' ? 'priorityQueueBucketWarning' : 'priorityQueueBucketOnTrack',
    );
    expect(pill.className).toContain(`wa-kit-tag--${tone}`);

    // Every other tone class stays off this bucket.
    for (const other of Object.values(BUCKET_TONE).filter((t) => t !== tone)) {
      expect(tile.classList.contains(`wa-kit-tone--${other}`)).toBe(false);
      expect(queueRow.classList.contains(`wa-kit-tone--${other}`)).toBe(false);
      expect(queueRow.querySelector(`.wa-kit-tag--${other}`)).toBeNull();
    }
  });

  it('never paints from the legacy palette or from inline brand hues', () => {
    const { container } = render(<CounselorPriorityQueue rows={ROWS} totals={TOTALS} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/--color-gold|--color-green|--color-blue|--color-accent/);
    // Tone comes from the class hook, never from a hard-coded token on an element.
    expect(html).not.toMatch(/var\(--wa-(gold|success|accent|info|danger)\)/);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[style]'))) {
      expect(el.style.color, `inline colour on <${el.tagName.toLowerCase()} class="${el.className}">`).not.toMatch(
        /--wa-(gold|success|accent|info|danger)\b/,
      );
      expect(el.style.borderLeft).toBe('');
    }
  });

  it('tints a selected row from the tone hook, not a computed colour', () => {
    const { container, getByLabelText } = render(<CounselorPriorityQueue rows={ROWS} totals={TOTALS} />);
    const checkbox = getByLabelText('priorityQueueSelectMember:warning member') as HTMLInputElement;
    checkbox.click();
    const selectedRow = container.querySelector<HTMLElement>('[data-bucket="warning"][data-selected="true"]');
    expect(selectedRow).not.toBeNull();
    expect(selectedRow!.style.background).toBe('var(--wa-kit-tone-soft)');
  });
});
