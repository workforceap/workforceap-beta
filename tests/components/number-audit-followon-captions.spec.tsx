import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

import { EnrollmentOutcomesPanel } from '@/components/portal/kit/pages/admin-subviews/EnrollmentOutcomesPanel';
import { buildEnrollmentOutcomesPanel, type EnrollmentOutcomesSource } from '@/lib/admin/analyticsTabs';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import { PROGRAM_HEALTH_CAPTION } from '@/lib/admin/commandCenterHelpers';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { MemberPipelineTable } from '@/components/portal/kit/pages/member/MemberPipelineTable';
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

describe('2. member surfaces colour by state, not by column (WAP-99 / #2434)', () => {
  /** Legacy names and brand hues written inline — the tone hook is the sanctioned path. */
  const LEGACY_INLINE = /--color-|var\(--wa-(?:gold|info|success|danger)(?:-dark|-soft)?\)/;

  // Round 3 of the portal redesign moved the four stat tiles off Home onto the
  // Progress numbers strip (a flat KpiStrip: no icon chip, no sparkline) and the
  // application pipeline into MemberPipelineTable. The rule is unchanged: a tile
  // or a track paints only from a state tone, never from the column it sits in.
  // The stale-course nudge is a counselor row on Home now, not a tile tone.
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

  function renderProgress(props: Record<string, unknown> = {}) {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberProgressKit coursePercent={42} activeJobs={2} certs={1} points={640} {...props} />
      </NextIntlClientProvider>,
    );
  }

  function tiles(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.wa-kit-stat-tile'));
  }

  function tileFor(container: HTMLElement, label: string): HTMLElement {
    const tile = tiles(container).find((el) => el.querySelector('.wa-kit-stat-label')?.textContent === label);
    expect(tile, `stat tile "${label}"`).toBeTruthy();
    return tile!;
  }

  it('gives no Progress tile a tone just for being in its column', () => {
    const { container } = renderProgress();
    // 42% course, 2 applications, 1 certificate, 640 points: nothing is a
    // finished state, so nothing paints. No magenta-because-first, no gold-because-third.
    expect(tiles(container)).toHaveLength(4);
    for (const label of ['Course', 'Active applications', 'Certificates', 'Points']) {
      expect(tileFor(container, label).className).not.toMatch(/wa-kit-tone--/);
    }
  });

  it('paints the course tile from its value: ok only once finished', () => {
    const done = renderProgress({ coursePercent: 100 });
    expect(tileFor(done.container, 'Course').classList.contains(toneClass('ok')!)).toBe(true);
    cleanup();

    const fresh = renderProgress({ coursePercent: 0 });
    expect(tileFor(fresh.container, 'Course').className).not.toMatch(/wa-kit-tone--/);
  });

  it('keeps every tile number neutral', () => {
    const { container } = renderProgress();
    for (const tile of tiles(container)) {
      const value = tile.querySelector<HTMLElement>('.wa-kit-stat-value');
      expect(value, 'tile value').not.toBeNull();
      // Class-painted (--wa-text through .wa-kit-stat-value); no inline hue.
      expect(value!.getAttribute('style')).toBeNull();
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
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberPipelineTable
          rows={[{ role: 'Help Desk Analyst', company: 'Acme', stage: 'Interviewing', tone: 'warn', stageIndex: 2, stageTotal: 3 }]}
        />
      </NextIntlClientProvider>,
    );
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
