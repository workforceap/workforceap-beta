import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import {
  MEMBER_TREND_WEEKS,
  buildMemberPointsTrend,
  memberPointsSpark,
} from '@/lib/member/memberPointsTrend';

/**
 * The Points tile draws a real line, and only the Points tile does.
 *
 * The sparkline component shipped long ago behind a `series.length > 1` gate
 * and the only caller feeding it was the `/dev` mockup's hardcoded array. This
 * spec runs the real bucketing over a ledger and renders the real tile, so it
 * fails if either half stops working — not just if the source text changes.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const DAY_MS = 24 * 60 * 60 * 1000;

/** A member with two months of uneven activity, including a silent week. */
const LEDGER = [
  { points: 40, createdAt: new Date(Date.now() - 1 * DAY_MS) },
  { points: 5, createdAt: new Date(Date.now() - 4 * DAY_MS) },
  { points: 25, createdAt: new Date(Date.now() - 9 * DAY_MS) },
  // days 14–20: nothing at all
  { points: 75, createdAt: new Date(Date.now() - 24 * DAY_MS) },
  { points: 10, createdAt: new Date(Date.now() - 45 * DAY_MS) },
];

function renderHome(props: Record<string, unknown> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MemberHomeKit
        firstName="Maya"
        coursePercent={42}
        activeJobs={2}
        certs={1}
        points={640}
        programTitle="Google IT Support Certificate"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function sparklines(container: HTMLElement): SVGPolylineElement[] {
  return [...container.querySelectorAll('polyline')] as SVGPolylineElement[];
}

describe('the Points stat tile renders the weekly series the loader computes', () => {
  it('draws one line, with one point per rolling week', () => {
    const trend = buildMemberPointsTrend({ transactions: LEDGER });
    const spark = memberPointsSpark(trend);
    expect(spark?.series).toHaveLength(MEMBER_TREND_WEEKS);

    const { container } = renderHome({ pointsSpark: spark, pointsThisWeek: trend.thisWeek });
    const lines = sparklines(container);
    expect(lines).toHaveLength(1);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const points = (line.getAttribute('points') ?? '').trim().split(/\s+/);
      expect(points).toHaveLength(MEMBER_TREND_WEEKS);
    }
  });

  it('is the Points tile, and the other three tiles stay blank', () => {
    const spark = memberPointsSpark(buildMemberPointsTrend({ transactions: LEDGER }));
    const { container } = renderHome({ pointsSpark: spark });

    // The home tiles are the kit StatSparkTile (an Astryx Card, not `.wa-kit-card`).
    const tiles = [...container.querySelectorAll('[data-testid="stat-spark-tile"]')].filter((card) =>
      card.querySelector('polyline'),
    );
    expect(tiles).toHaveLength(1);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.textContent).toContain('Points');
      // Certifications deliberately never gets a line; the other two are a
      // later pass, and neither may borrow this one.
      expect(tile.textContent).not.toContain('Certifications');
      expect(tile.textContent).not.toContain('Active jobs');
    }
  });

  it('renders the week-over-week delta chip beside the number', () => {
    const trend = buildMemberPointsTrend({ transactions: LEDGER });
    const spark = memberPointsSpark(trend);
    expect(spark?.delta).toBe(String(Math.abs(trend.thisWeek - trend.previousWeek)));
    const { container } = renderHome({ pointsSpark: spark });
    expect(container.textContent).toContain(spark?.delta ?? 'missing delta');
  });

  it('fills the Points tile trend slot and leaves the other three on the empty placeholder', () => {
    // #2446 gave every tile without a series a muted "No trend yet" slot. The
    // Points tile is the first to have something real to put there; the other
    // three must keep the placeholder, not borrow this line.
    const spark = memberPointsSpark(buildMemberPointsTrend({ transactions: LEDGER }));
    const { container } = renderHome({ pointsSpark: spark });

    const placeholders = [...container.querySelectorAll('[data-testid="stat-trend-empty"]')];
    expect(placeholders).toHaveLength(3);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const placeholder of placeholders) {
      expect(placeholder.textContent).toBe('No trend yet');
      expect(placeholder.closest('[data-testid="stat-spark-tile"]')?.textContent).not.toContain('Points');
    }
    expect(sparklines(container)).toHaveLength(1);
  });

  it('draws nothing at all for a member with no points history', () => {
    const empty = memberPointsSpark(buildMemberPointsTrend({ transactions: [] }));
    expect(empty).toBeUndefined();
    const { container } = renderHome({ pointsSpark: empty });
    expect(sparklines(container)).toHaveLength(0);
    // A flat rule at zero would read as a real trend sitting at zero; the tile
    // falls back to the same empty slot its three neighbours use.
    expect(container.querySelectorAll('[data-testid="stat-trend-empty"]')).toHaveLength(4);
  });
});
