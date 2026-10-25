import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { getScoreBreakdownSafeResult } from '@/lib/readiness/score';
import { getMemberReadinessSections } from '@/lib/readiness/memberReadinessSections';
import { SCREENSHOT_MEMBER_BREAKDOWN } from '@/lib/readiness/progressView.fixtures';
import { loadProgressMetrics, type ProgressMetrics } from '@/lib/member/loadProgressMetrics';
import DashboardReadinessPage from '@/app/(portal)/dashboard/readiness/page';

/**
 * `/dashboard/readiness` hands the member numbers (course %, applications,
 * certificates, points, streak, ledger) to the Progress kit, and does it
 * without serialising them behind the score or checklist loads. A `null` from
 * the loader is "unknown", so the kit must receive `undefined` (it leaves that
 * tile or block out), never `0`.
 */

const kitProps = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/readiness/score', () => ({ getScoreBreakdownSafeResult: vi.fn() }));
vi.mock('@/lib/readiness/memberReadinessSections', () => ({ getMemberReadinessSections: vi.fn() }));
vi.mock('@/lib/member/loadProgressMetrics', () => ({
  loadProgressMetrics: vi.fn(),
  UNKNOWN_PROGRESS_METRICS: {
    coursePercent: null,
    activeApplications: null,
    certificates: null,
    points: null,
    pointsThisWeek: null,
    ledger: null,
    currentStreak: null,
    longestStreak: null,
  },
}));
vi.mock('@/components/portal/kit/pages/member/MemberProgressKit', () => ({
  MemberProgressKit: (props: Record<string, unknown>) => {
    kitProps(props);
    return <div data-testid="progress-kit" />;
  },
}));
vi.mock('@/components/portal/ReadinessProgressSummary', () => ({
  ReadinessProgressSummary: () => <div data-testid="summary" />,
}));

const FULL: ProgressMetrics = {
  coursePercent: 78,
  activeApplications: 4,
  certificates: 2,
  points: 1240,
  pointsThisWeek: 85,
  ledger: [{ label: 'Completed a course', amount: 40, color: 'accent' }],
  currentStreak: 12,
  longestStreak: 20,
};

const lastKitProps = () => kitProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe('/dashboard/readiness member numbers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as Awaited<ReturnType<typeof getUser>>);
    vi.mocked(headers).mockResolvedValue(new Headers() as Awaited<ReturnType<typeof headers>>);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({ breakdown: SCREENSHOT_MEMBER_BREAKDOWN, loadFailed: false });
    vi.mocked(getMemberReadinessSections).mockResolvedValue([]);
    vi.mocked(loadProgressMetrics).mockResolvedValue(FULL);
  });

  it('loads the numbers for the signed-in member only and passes each one to the kit', async () => {
    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    expect(loadProgressMetrics).toHaveBeenCalledTimes(1);
    expect(loadProgressMetrics).toHaveBeenCalledWith('member-1');
    expect(lastKitProps()).toMatchObject({
      coursePercent: 78,
      activeJobs: 4,
      certs: 2,
      points: 1240,
      pointsThisWeek: 85,
      pointsLedger: FULL.ledger,
      currentStreak: 12,
      longestStreak: 20,
    });
  });

  it('maps unknown (null) to undefined so the kit leaves the tile out, and never invents a zero', async () => {
    vi.mocked(loadProgressMetrics).mockResolvedValue({
      ...FULL,
      coursePercent: null,
      certificates: null,
      points: null,
      pointsThisWeek: null,
      ledger: null,
      currentStreak: null,
      longestStreak: null,
    });
    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    const props = lastKitProps();
    for (const key of ['coursePercent', 'certs', 'points', 'pointsThisWeek', 'pointsLedger', 'currentStreak', 'longestStreak']) {
      expect(props[key], key).toBeUndefined();
    }
    expect(props.activeJobs, 'a known count still reaches the kit').toBe(4);
  });

  it('keeps a real zero as a zero (nothing earned yet is not unknown)', async () => {
    vi.mocked(loadProgressMetrics).mockResolvedValue({
      coursePercent: 0,
      activeApplications: 0,
      certificates: 0,
      points: 0,
      pointsThisWeek: 0,
      ledger: [],
      currentStreak: 0,
      longestStreak: 0,
    });
    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    expect(lastKitProps()).toMatchObject({
      coursePercent: 0,
      activeJobs: 0,
      certs: 0,
      points: 0,
      pointsThisWeek: 0,
      pointsLedger: [],
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  it('starts the numbers read without waiting for the score or the checklist', async () => {
    let releaseScore: (value: Awaited<ReturnType<typeof getScoreBreakdownSafeResult>>) => void = () => {};
    vi.mocked(getScoreBreakdownSafeResult).mockReturnValue(
      new Promise((resolve) => {
        releaseScore = resolve;
      }),
    );
    const pending = DashboardReadinessPage({ searchParams: Promise.resolve({}) });
    // Let the page run up to its first await on the loads.
    await vi.waitFor(() => expect(getScoreBreakdownSafeResult).toHaveBeenCalled());
    expect(loadProgressMetrics, 'issued while the score is still loading').toHaveBeenCalledWith('member-1');
    releaseScore({ breakdown: SCREENSHOT_MEMBER_BREAKDOWN, loadFailed: false });
    render(await pending);
    expect(lastKitProps().points).toBe(1240);
  });

  it('still shows the numbers when the readiness score failed to load', async () => {
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({ breakdown: SCREENSHOT_MEMBER_BREAKDOWN, loadFailed: true });
    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    expect(lastKitProps()).toMatchObject({ loadFailed: true, coursePercent: 78, points: 1240 });
  });

  it('does not take the page down if the numbers loader rejects', async () => {
    vi.mocked(loadProgressMetrics).mockRejectedValue(new Error('unexpected'));
    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    const props = lastKitProps();
    expect(props.coursePercent).toBeUndefined();
    expect(props.points).toBeUndefined();
    expect(props.readinessScore).toBeDefined();
  });

  it('skips the three reads on the legacy view, which does not show the numbers', async () => {
    // The element tree is enough: the page decides what to read before it renders.
    await DashboardReadinessPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });

    expect(loadProgressMetrics).not.toHaveBeenCalled();
    expect(getScoreBreakdownSafeResult).toHaveBeenCalledWith('member-1');
  });

  it('redirects signed-out visitors before reading anything', async () => {
    vi.mocked(getUser).mockResolvedValue(null as Awaited<ReturnType<typeof getUser>>);
    await expect(DashboardReadinessPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/readiness');
    expect(loadProgressMetrics).not.toHaveBeenCalled();
    expect(getScoreBreakdownSafeResult).not.toHaveBeenCalled();
  });
});
