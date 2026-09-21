/**
 * Regression guard for the member dashboard's "the graphs don't show on
 * mobile" report.
 *
 * The four home tiles (Course / Active jobs / Certs / Points) never had a
 * sparkline on the live page: `app/(portal)/dashboard/page.tsx` passes no
 * `*Spark` prop and `MemberDashboardHomeView` carries no per-tile series, so
 * `spark.series.length > 1` was false at every viewport and the trend slot
 * rendered `null`. It looked like a graph that failed to paint at 390px, where
 * the tiles are a 2x2 block and the empty lower third is the whole first
 * screen.
 *
 * The fix is presentational and invents no data: with nothing to draw the tile
 * renders `TrendPlaceholder` — a muted, translated "No trend yet" line that
 * reserves the sparkline's own height — so the absence reads as deliberate and
 * a row of tiles keeps one baseline.
 *
 * The slot is opt-in on the shared kit tile, which nine live surfaces use for
 * pure counts that never implied a trend; only the four member home tiles Mike
 * reported turn it on.
 *
 * These cases pin both halves: no series => a visible trend slot and no
 * polyline; a real series => the sparkline and no placeholder. A future change
 * that drops the slot back to `null` fails here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { BookOpen } from 'lucide-react';
import messages from '@/messages/en.json';
import { MemberHomeKit, type MemberHomeKitProps } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { StatSparkTile } from '@/components/portal/kit/CommandCenter';

/** The member tile reads this from the `dashboard` catalogue; assert the shipped copy. */
const NO_TREND_LABEL = messages.dashboard.noTrendYet;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

function renderKit(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

/** Exactly what `/dashboard` hands the kit for a member with no history. */
const liveProps: MemberHomeKitProps = {
  firstName: 'Mike',
  coursePercent: 0,
  activeJobs: 1,
  certs: 0,
  points: 100,
  programTitle: 'IT Support Professional Certificate (IBM)',
  programStatus: 'In progress',
  currentStreak: 0,
  longestStreak: 0,
  goals: [],
  pipeline: [],
  pointsLedger: [],
  certModulesDone: 0,
  certModulesTotal: 9,
  programHref: '/dashboard/program',
  resumeHref: '/dashboard/program',
  coursesHref: '/dashboard/program',
  toolkitHref: '/dashboard/toolkit',
  jobsHref: '/dashboard/jobs',
  doThisNext: null,
  ungatedDigitalBasicsHref: null,
};

/** The tile's trend line — the only 100x28 viewBox on the page. */
function sparklines(container: HTMLElement): NodeListOf<SVGElement> {
  return container.querySelectorAll<SVGElement>('svg[viewBox="0 0 100 28"]');
}

function placeholders(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.wa-kit-meta')].filter(
    (el) => el.textContent?.trim() === NO_TREND_LABEL
  );
}

describe('member home stat tiles — trend slot', () => {
  it('shows a deliberate trend slot on every tile when no series is supplied', () => {
    const { container } = renderKit(<MemberHomeKit {...liveProps} />);

    // The bug: the slot rendered nothing at all, at every width.
    expect(sparklines(container)).toHaveLength(0);
    expect(placeholders(container)).toHaveLength(4);
  });

  it('reserves the sparkline height so a row of tiles keeps one baseline', () => {
    const { container } = renderKit(<MemberHomeKit {...liveProps} />);

    // A 2x2 grid at 390px only reads as deliberate if the tiles match: the
    // placeholder must occupy the 28px the sparkline would have.
    const slots = placeholders(container);
    // Prove the selector matched before asserting a property of every match —
    // the loop below passes vacuously on an empty list.
    expect(slots).toHaveLength(4);
    for (const el of slots) {
      expect(el.style.minHeight).toBe('28px');
    }
  });

  it('still draws the real sparkline when a series exists', () => {
    const series = [70, 71, 72, 74, 74, 76, 78];
    const { container } = renderKit(
      <MemberHomeKit {...liveProps} courseSpark={{ series, delta: '4%', direction: 'up' }} />
    );

    const drawn = sparklines(container);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].querySelector('polyline')?.getAttribute('points')).toBeTruthy();
    // The other three tiles still have nothing to draw.
    expect(placeholders(container)).toHaveLength(3);
  });

  it('does not contradict a delta chip that arrives without a series', () => {
    const { container } = renderKit(
      <MemberHomeKit {...liveProps} pointsSpark={{ delta: '85', direction: 'up' }} />
    );

    // The chip must actually be on the page, or "no placeholder next to it" is
    // proving nothing.
    expect(within(container).getByText('85')).toBeTruthy();
    expect(placeholders(container)).toHaveLength(3);
  });
});

describe('shared kit StatSparkTile — the empty slot is opt-in', () => {
  // Nine live surfaces render this tile for pure counts ("Jobs Posted 12",
  // "In this view 7"). A default empty slot would promise them a trend
  // nothing upstream computes and add 28px to each, so the slot only appears
  // when a caller passes copy for it. No live caller does today.
  it('renders no slot for a series-less tile that did not opt in', () => {
    const { container } = render(
      <StatSparkTile icon={<BookOpen size={16} />} label="Jobs Posted" value={12} />
    );

    expect(sparklines(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="stat-trend-empty"]')).toHaveLength(0);
  });

  it('renders the slot with the caller-supplied copy when it opts in', () => {
    const { container } = render(
      <StatSparkTile
        icon={<BookOpen size={16} />}
        label="Open roles"
        value={3}
        emptyTrendLabel={NO_TREND_LABEL}
      />
    );

    expect(sparklines(container)).toHaveLength(0);
    expect(within(container).getByText(NO_TREND_LABEL)).toBeTruthy();
  });

  it('draws the sparkline when a series is supplied, opted in or not', () => {
    const { container } = render(
      <StatSparkTile
        icon={<BookOpen size={16} />}
        label="Open roles"
        value={3}
        spark={{ series: [1, 2, 3, 4] }}
        emptyTrendLabel={NO_TREND_LABEL}
      />
    );

    expect(sparklines(container)).toHaveLength(1);
    expect(placeholders(container)).toHaveLength(0);
  });
});
