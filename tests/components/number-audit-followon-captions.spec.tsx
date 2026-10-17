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

describe('2. member home paints state, not position (WAP-99 / #2434)', () => {
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
          certModulesDone={3}
          certModulesTotal={7}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  }

  it('does not mount the four positional stat tiles', () => {
    const { container } = renderHome();
    expect(container.querySelectorAll('[data-testid="stat-spark-tile"]')).toHaveLength(0);
    expect(screen.queryByText('Course')).toBeNull();
    expect(screen.queryByText('Active jobs')).toBeNull();
  });

  it('paints the focus ring from its value: ok when finished, warn only once not-started has gone stale', () => {
    const done = renderHome({ coursePercent: 100, certModulesDone: 7, certModulesTotal: 7 });
    const okRing = done.container.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(okRing.classList.contains(toneClass('ok')!)).toBe(true);
    cleanup();

    const inProgress = renderHome({ coursePercent: 42, certModulesDone: 3, certModulesTotal: 7 });
    const ring = inProgress.container.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(ring.className).not.toMatch(/wa-kit-tone--/);
    cleanup();

    const unstarted = renderHome({ coursePercent: 0, certModulesDone: 0, certModulesTotal: 7, courseProgressStale: true });
    const warnRing = unstarted.container.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(warnRing.classList.contains(toneClass('warn')!)).toBe(true);
    cleanup();

    const noProgram = renderHome({ coursePercent: 0, courseProgressStale: true, programTitle: undefined, certModulesDone: undefined, certModulesTotal: undefined });
    expect(noProgram.container.querySelector(`.${toneClass('warn')}`)).toBeNull();
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
