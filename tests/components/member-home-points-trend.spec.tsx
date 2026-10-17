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

describe('the Points trend the loader computes stays off the refreshed home', () => {
  it('still buckets one point per rolling week', () => {
    const trend = buildMemberPointsTrend({ transactions: LEDGER });
    const spark = memberPointsSpark(trend);
    expect(spark?.series).toHaveLength(MEMBER_TREND_WEEKS);
    expect(spark?.delta).toBe(String(Math.abs(trend.thisWeek - trend.previousWeek)));
  });

  it('does not paint a Points tile or sparkline on Home', () => {
    const spark = memberPointsSpark(buildMemberPointsTrend({ transactions: LEDGER }));
    const { container } = renderHome({ pointsSpark: spark, pointsThisWeek: 40 });
    expect(container.querySelectorAll('[data-testid="stat-spark-tile"]')).toHaveLength(0);
    expect(sparklines(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="stat-trend-empty"]')).toHaveLength(0);
  });

  it('draws nothing for a member with no points history', () => {
    const empty = memberPointsSpark(buildMemberPointsTrend({ transactions: [] }));
    expect(empty).toBeUndefined();
    const { container } = renderHome({ pointsSpark: empty });
    expect(sparklines(container)).toHaveLength(0);
  });
});
