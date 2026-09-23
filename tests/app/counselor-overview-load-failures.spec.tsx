import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';

/**
 * WAP-206: a failed load on the counselor Overview is unknown, not zero.
 * The command center feeds "Awaiting reply" and the sessions card; the
 * attention queue feeds the risk / on-track tiles, "Needs attention" and the
 * bucket breakdown. Each failure shows "Couldn't load" in its own sections and
 * never a 0 tile or the "no one's waiting on you" state.
 */

const loaders = vi.hoisted(() => ({
  commandCenter: vi.fn(),
  attention: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'counselor-user-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isCounselor: vi.fn(async () => true),
  isAdmin: vi.fn(async () => false),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselor: { findFirst: vi.fn(async () => ({ id: 'counselor-1' })) },
    counselorAssignment: { count: vi.fn(async () => 7) },
  },
}));
vi.mock('@/lib/counselor/commandCenter', () => ({ getCounselorCommandCenter: loaders.commandCenter }));
vi.mock('@/lib/attention/counselor', () => ({ getCounselorAttention: loaders.attention }));

import CounselorOverviewPage from '@/app/(portal)/counselor/overview/page';

function attentionWith(riskAlerts: number, onTrack: number) {
  const queue = emptyAttentionQueue();
  queue.totals.byReason.risk_alert = riskAlerts;
  queue.onTrack = Array.from({ length: onTrack }, (_, i) => ({
    memberId: `member-${i}`,
    memberName: `Member ${i}`,
  })) as never;
  queue.totals.onTrack = onTrack;
  return queue;
}

const center = {
  needsReply: [],
  atRisk: [],
  interviewing: [{ memberId: 'member-9', memberName: 'Riley Park', role: 'Cloud Support Associate', lastRunAt: new Date() }],
  totals: { needsReplyCount: 4, atRiskCount: 0, interviewingCount: 1, slaBreachCount: 1 },
};

async function renderPage() {
  render(await CounselorOverviewPage({ searchParams: Promise.resolve({}) }));
}

function tile(label: string) {
  const labelNode = screen.getByText(label);
  const tileNode = labelNode.closest('[data-testid="stat-spark-tile"]');
  if (!tileNode) throw new Error(`no tile for ${label}`);
  return tileNode as HTMLElement;
}

describe('counselor Overview load failures (WAP-206)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loaders.commandCenter.mockResolvedValue(center);
    loaders.attention.mockResolvedValue(attentionWith(2, 3));
  });

  it('shows the real counts when both loads succeed', async () => {
    await renderPage();
    expect(within(tile('Awaiting reply')).getByText('4')).toBeInTheDocument();
    expect(within(tile('Members with risk alerts')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Assigned members')).getByText('7')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load")).toBeNull();
    expect(screen.getByText('Riley Park')).toBeInTheDocument();
  });

  it('says "Couldn\'t load" instead of 0 awaiting reply when the command center fails', async () => {
    loaders.commandCenter.mockRejectedValue(new Error('db down'));
    await renderPage();

    const awaiting = tile('Awaiting reply');
    expect(within(awaiting).queryByText('0')).toBeNull();
    expect(within(awaiting).getByText('—')).toBeInTheDocument();
    expect(within(awaiting).getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load recent interview-prep sessions/)).toBeInTheDocument();
    expect(screen.queryByText(/No interview-prep sessions run this week/)).toBeNull();

    // The attention queue still loaded, so its tiles keep their numbers.
    expect(within(tile('Members with risk alerts')).getByText('2')).toBeInTheDocument();
  });

  it('never says "no one\'s waiting on you" when the attention queue fails', async () => {
    loaders.attention.mockRejectedValue(new Error('db down'));
    await renderPage();

    for (const label of ['Members with risk alerts', 'On track']) {
      const node = tile(label);
      expect(within(node).queryByText('0')).toBeNull();
      expect(within(node).getByText("Couldn't load")).toBeInTheDocument();
    }
    expect(screen.queryByText(/no one.s waiting on you/i)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load who needs you/i);
    expect(screen.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/counselor/today');
    expect(screen.getByText(/Couldn.t load the caseload breakdown/)).toBeInTheDocument();

    // The command center still loaded.
    expect(within(tile('Awaiting reply')).getByText('4')).toBeInTheDocument();
  });
});
