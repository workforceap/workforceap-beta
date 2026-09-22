import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

import { EnrollmentOutcomesPanel } from '@/components/portal/kit/pages/admin-subviews/EnrollmentOutcomesPanel';
import { buildEnrollmentOutcomesPanel, type EnrollmentOutcomesSource } from '@/lib/admin/analyticsTabs';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import { PROGRAM_HEALTH_CAPTION } from '@/lib/admin/commandCenterHelpers';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { toneClass } from '@/components/portal/kit';

/**
 * The three leftovers from the number audit (#2425) and the reporting-hub
 * consolidation (#2438). All three are captions and colours; no number,
 * threshold or query moves.
 *
 *  1. `/admin/metrics`' "since midnight / degraded slices" qualification was
 *     lost with the card #2438 deleted — it is on the reporting hub's
 *     Overview tab now.
 *  2. The member home stat tiles / progress ring coloured by column; they
 *     speak the kit tone palette #2434 introduced (WAP-99).
 *  3. The Command Center's program-health figure prints the definition of
 *     what it counts, in the member-only population #2425 settled.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const METRICS: EnrollmentOutcomesSource = {
  totalMembers: 128,
  weeklyActiveMembers: 41,
  aiToolRuns: 612,
  placementStats: { enrolled: 96, placed: 23, certifications: 57, placementRate: 24 },
  enrollmentByProgram: [{ program: 'IT Support (IBM)', count: 44 }],
  careerOsMetrics: {
    completionEventsReceived: 212,
    actionsCreated: 180,
    actionsPending: 38,
    actionsCompleted: 121,
    followThroughRate: 67,
  },
};

describe('1. reporting hub Overview qualifies the metrics numbers (S29 follow-on)', () => {
  it('says the daily-activity buckets are calendar days, not a rolling 24 hours', () => {
    const { container } = render(<EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel(METRICS)} />);
    const note = container.querySelector('[data-charts-note]');
    expect(note).not.toBeNull();
    expect(note).toHaveTextContent(/midnight to midnight in server time/);
    // The zone is not pinned by the code (Node TZ + Postgres session TZ, and
    // the repo defaults to Central elsewhere), so the caption must not name one.
    expect(note).not.toHaveTextContent(/UTC/);
    expect(note).toHaveTextContent(/not a rolling 24 hours/);
  });

  it('warns, and names the slices, only when a slice was zero-filled', () => {
    const { container, rerender } = render(<EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel(METRICS)} />);
    expect(container.querySelector('[data-metrics-degraded]')).toBeNull();

    rerender(
      <EnrollmentOutcomesPanel
        data={buildEnrollmentOutcomesPanel({ ...METRICS, degradedSlices: ['placementStats'] })}
      />,
    );
    const warning = container.querySelector('[data-metrics-degraded]');
    expect(warning).not.toBeNull();
    expect(warning).toHaveTextContent(/showing 0 \(placementStats\)/);
    expect(warning).toHaveAttribute('role', 'status');
  });

  it('prints the same numbers whether or not a slice degraded (captions only)', () => {
    const { container } = render(
      <EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel({ ...METRICS, degradedSlices: ['dailyActivity'] })} />,
    );
    expect(container).toHaveTextContent('128');
    expect(container).toHaveTextContent('24%');
    expect(container).toHaveTextContent('23 of 96 enrolled');
  });
});

describe('2. member home tiles colour by state, not by column (WAP-99 / #2434)', () => {
  /** Legacy names and brand hues written inline — the tone hook is the sanctioned path. */
  const LEGACY_INLINE = /--color-|var\(--wa-(?:gold|info|success|danger)(?:-dark|-soft)?\)/;

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
          nextBadgeName="Networking basics"
          nextBadgePercent={30}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  }

  function tileFor(container: HTMLElement, label: string): HTMLElement {
    const labelEl = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.childElementCount === 0 && el.textContent === label,
    );
    expect(labelEl, `stat tile "${label}"`).toBeTruthy();
    return labelEl!.closest('.wa-kit-card') as HTMLElement;
  }

  it('gives no tile a tone just for being in its column', () => {
    const { container } = renderHome();
    // 42% course, 2 jobs, 1 cert, 640 points: only the two "you have some"
    // states paint. Nothing is magenta-because-first or gold-because-third.
    expect(tileFor(container, 'Course').querySelector('[class*="wa-kit-tone--"]')).toBeNull();
    expect(tileFor(container, 'Points').querySelector('[class*="wa-kit-tone--"]')).toBeNull();
    expect(tileFor(container, 'Active jobs').querySelector(`.${toneClass('ok')}`)).not.toBeNull();
    expect(tileFor(container, 'Certs').querySelector(`.${toneClass('ok')}`)).not.toBeNull();
  });

  it('paints the course tile from its value: ok when finished, warn only once not-started has gone stale', () => {
    const done = renderHome({ coursePercent: 100 });
    expect(tileFor(done.container, 'Course').querySelector(`.${toneClass('ok')}`)).not.toBeNull();
    cleanup();

    // Enrolled and not started is only worth a nudge once the shared
    // staleness threshold has passed; 0% an hour after enrolling is not.
    const fresh = renderHome({ coursePercent: 0 });
    expect(tileFor(fresh.container, 'Course').querySelector('[class*="wa-kit-tone--"]')).toBeNull();
    cleanup();

    const unstarted = renderHome({ coursePercent: 0, courseProgressStale: true });
    expect(tileFor(unstarted.container, 'Course').querySelector(`.${toneClass('warn')}`)).not.toBeNull();
    cleanup();

    // No program to be behind on, so nothing to warn about.
    const noProgram = renderHome({ coursePercent: 0, courseProgressStale: true, programTitle: undefined });
    expect(noProgram.container.querySelector(`.${toneClass('warn')}`)).toBeNull();
  });

  it('keeps the icon chip and trend line on the tone hook, never an inline hue', () => {
    const { container } = renderHome({ activeJobsSpark: { series: [1, 2, 3], delta: '1' } });
    const chips = container.querySelectorAll<HTMLElement>('.wa-kit-tone-icon');
    // Guard the loop: with no chips in the tree it would pass vacuously.
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.getAttribute('style')).toBeNull();
    }
    const strokes = Array.from(container.querySelectorAll('polyline')).map((p) => p.getAttribute('stroke'));
    expect(strokes.length).toBeGreaterThan(0);
    for (const stroke of strokes) expect(stroke === 'var(--wa-kit-tone)' || stroke === 'var(--wa-accent)').toBe(true);
  });

  it('keeps every tile number neutral', () => {
    const { container } = renderHome();
    for (const label of ['Course', 'Active jobs', 'Certs', 'Points']) {
      const tile = tileFor(container, label);
      const value = tile.querySelector<HTMLElement>('div[style*="font-size: 26px"]');
      expect(value, `value of "${label}"`).not.toBeNull();
      expect(value!.style.color).toBe('var(--wa-text)');
    }
  });

  it('rings and segment bars paint from the tone hook too', () => {
    const inProgress = renderHome({ coursePercent: 42 });
    const ring = inProgress.container.querySelector<HTMLElement>('[role="progressbar"][aria-label="Course completion"]')!;
    expect(ring.className).not.toMatch(/wa-kit-tone--/);
    cleanup();

    const finished = renderHome({ coursePercent: 100 });
    const okRing = finished.container.querySelector<HTMLElement>('[role="progressbar"][aria-label="Course completion"]')!;
    expect(okRing.classList.contains(toneClass('ok')!)).toBe(true);

    const badge = finished.container.querySelector<HTMLElement>(
      '[role="progressbar"][aria-label="Networking basics badge progress"]',
    )!;
    // Progress toward a badge has no good/bad state; it stays on the accent.
    expect(badge.className).not.toMatch(/wa-kit-tone--/);
    const badgeSegments = badge.querySelectorAll<HTMLElement>('span');
    expect(badgeSegments.length).toBeGreaterThan(0);
    for (const segment of badgeSegments) {
      expect(segment.getAttribute('style')).not.toMatch(LEGACY_INLINE);
    }
  });

  it('paints the pipeline stage track from the row tone instead of a named hue', () => {
    const { container } = renderHome({
      pipeline: [{ role: 'Help Desk Analyst', company: 'Acme', stage: 'Interviewing', tone: 'warn', stageIndex: 2, stageTotal: 3 }],
    });
    const track = container.querySelector<HTMLElement>(`.${toneClass('warn')}.wa-flex.wa-items-center.wa-gap-1`);
    expect(track).not.toBeNull();
    const trackSegments = track!.querySelectorAll<HTMLElement>('span');
    expect(trackSegments.length).toBeGreaterThan(0);
    for (const segment of trackSegments) {
      expect(segment.getAttribute('style')).not.toMatch(LEGACY_INLINE);
    }
  });
});

describe('3. Command Center says what the program-health figure counts (S21 follow-on)', () => {
  // No colour: a share of enrolled students has no ok/warn/alert reading, so
  // the bars take the kit's neutral accent (see program-health-tone.spec.tsx).
  const ROWS = [{ label: 'Cloud & IT', value: '312 enrolled', pct: 37 }];

  it('prints the member-only definition and the share meaning under the heading', () => {
    render(<CommandCenterKit programHealth={ROWS} programHealthCaption={PROGRAM_HEALTH_CAPTION} />);
    const caption = document.querySelector('[data-program-health-caption]');
    expect(caption).not.toBeNull();
    expect(caption).toHaveTextContent(/member accounts only, staff and test accounts excluded/);
    expect(caption).toHaveTextContent(/share of enrolled students/);
    expect(caption).toHaveTextContent(/not a completion or health score/);
  });

  it('prints nothing when no caption is supplied, and never changes the row values', () => {
    const { container } = render(<CommandCenterKit programHealth={ROWS} />);
    expect(container.querySelector('[data-program-health-caption]')).toBeNull();
    expect(screen.getByText('312 enrolled')).toBeInTheDocument();
  });
});
