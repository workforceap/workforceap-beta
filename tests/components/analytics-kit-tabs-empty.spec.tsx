import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * /admin/analytics after the admin audit (2026-09-20): empty ranking panels
 * explain the reason and offer a next step (kit `KitEmptyState`, 13px floor,
 * tokens only) instead of a bare "No data for this period yet.", and the
 * metrics numbers mount as a second kit Tab, "Enrollment and outcomes",
 * opened by `?tab=enrollment`.
 */

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { AnalyticsKit } from '@/components/portal/kit/pages/admin-subviews/AnalyticsKit';
import { EnrollmentOutcomesPanel } from '@/components/portal/kit/pages/admin-subviews/EnrollmentOutcomesPanel';
import { buildEnrollmentOutcomesPanel } from '@/lib/admin/analyticsTabs';

afterEach(cleanup);

function assertKitTokensOnly(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
    const style = el.getAttribute('style') ?? '';
    expect(style, el.outerHTML.slice(0, 80)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(style, el.outerHTML.slice(0, 80)).not.toMatch(/rgba?\(/);
    const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(style);
    if (size) expect(Number(size[1]), el.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(13);
  }
}

describe('AnalyticsKit empty panels', () => {
  it('say why each ranking is empty and where to go next', () => {
    const { container } = render(<AnalyticsKit kpis={[]} />);
    expect(screen.queryByText('No data for this period yet.')).toBeNull();

    const tools = screen.getByRole('heading', { name: 'No AI tool results saved in the last 30 days' });
    expect(tools.closest('div')?.textContent).toMatch(/saved a result from/);
    expect(screen.getByRole('link', { name: /Open AI tools/ })).toHaveAttribute('href', '/admin/ai-tools');

    const programs = screen.getByRole('heading', { name: 'No weekly activity by program yet' });
    expect(programs.closest('div')?.textContent).toMatch(/enrolled program.*last 7 days/);
    expect(screen.getByRole('link', { name: /Open training progress/ })).toHaveAttribute('href', '/admin/students?view=training');

    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    assertKitTokensOnly(container);
  });

  it('renders the rankings, not the empty states, when data exists', () => {
    render(<AnalyticsKit kpis={[]} topTools={[{ label: 'Resume Studio', value: 4, pct: 100 }]} />);
    expect(screen.getByText('Resume Studio')).toBeInTheDocument();
    expect(screen.queryByText(/No AI tool results/)).toBeNull();
    expect(screen.getByText(/No weekly activity by program yet/)).toBeInTheDocument();
  });
});

const metrics = {
  totalMembers: 8, weeklyActiveMembers: 3, aiToolRuns: 12,
  placementStats: { enrolled: 8, placed: 2, certifications: 5, placementRate: 25 },
  enrollmentByProgram: [{ program: 'IT Support', count: 6 }, { program: 'Cyber', count: 2 }],
  careerOsMetrics: { completionEventsReceived: 4, actionsCreated: 3, actionsPending: 1, actionsCompleted: 2, followThroughRate: 67 },
};

describe('AnalyticsKit tabs', () => {
  it('renders alone without an enrollment panel', () => {
    render(<AnalyticsKit kpis={[]} />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('mounts Engagement and "Enrollment and outcomes" as kit tabs, both server-rendered, opening on ?tab=', () => {
    const { container } = render(
      <AnalyticsKit
        kpis={[{ label: 'WAU', value: 3 }]}
        initialTab="enrollment"
        enrollmentPanel={<EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel(metrics)} />}
      />,
    );
    const tablist = screen.getByRole('tablist', { name: 'Analytics views' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Engagement', 'Enrollment and outcomes']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

    const engagement = container.querySelector<HTMLElement>('#admin-analytics-panel-engagement');
    const enrollment = container.querySelector<HTMLElement>('#admin-analytics-panel-enrollment');
    expect(engagement?.hidden).toBe(true);
    expect(enrollment?.hidden).toBe(false);
    // Both panels are in the markup (no second fetch on switch).
    expect(within(engagement as HTMLElement).getByText('WAU')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByText('Enrollment by program')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByText('IT Support')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByText('6 · 75%')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByText('Placement rate')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByText('2 of 8 enrolled')).toBeInTheDocument();
    expect(within(enrollment as HTMLElement).getByRole('link', { name: /Open full charts/ })).toHaveAttribute('href', '/admin/metrics?ui=legacy');
    assertKitTokensOnly(container);
  });

  it('opens Engagement for a missing or unknown tab', () => {
    render(<AnalyticsKit kpis={[]} enrollmentPanel={<p>panel</p>} />);
    expect(screen.getByRole('tab', { name: 'Engagement' })).toHaveAttribute('aria-selected', 'true');
  });
});
