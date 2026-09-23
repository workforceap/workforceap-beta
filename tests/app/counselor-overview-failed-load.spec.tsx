import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import en from '@/messages/en.json';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';

/**
 * WAP-206: the Counselor Overview (`/counselor/overview`, kit path) must not
 * turn a failed read into zeros. When `getCounselorCommandCenter` rejects,
 * "Awaiting reply" is unknown — the tile shows "—" + "Couldn't load" and the
 * page offers Try again — never "0". When the attention queue rejects, the
 * risk / on-track tiles and the "Needs attention" list say the same instead
 * of "Nothing flagged" / "Nice work". A real zero stays a real zero, and a
 * real N stays N.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/counselor/overview',
  useSearchParams: () => new URLSearchParams(),
}));

const loaders = vi.hoisted(() => ({
  commandCenter: vi.fn(),
  attention: vi.fn(),
  assignedCount: vi.fn(async () => 0),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'counselor-user-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false), isCounselor: vi.fn(async () => true) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselor: { findFirst: vi.fn(async () => ({ id: 'counselor-1' })) },
    counselorAssignment: { count: loaders.assignedCount },
  },
}));
vi.mock('@/lib/counselor/commandCenter', () => ({ getCounselorCommandCenter: loaders.commandCenter }));
vi.mock('@/lib/attention/counselor', () => ({ getCounselorAttention: loaders.attention }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : `${ns}.${key}`;
  }),
}));

import CounselorPortalPage from '@/app/(portal)/counselor/overview/page';

const copy = en.empty.counselor.overviewUnavailable;

function center(needsReplyCount: number, slaBreachCount = 0) {
  return {
    needsReply: [],
    atRisk: [],
    interviewing: [],
    totals: { needsReplyCount, atRiskCount: 0, interviewingCount: 0, slaBreachCount },
  };
}

function attention(riskAlerts: number) {
  const queue = emptyAttentionQueue();
  queue.totals.byReason.risk_alert = riskAlerts;
  return queue;
}

async function renderOverview() {
  return render(<>{await CounselorPortalPage({ searchParams: Promise.resolve({}) })}</>);
}

/** The big number printed above a StatSparkTile's label. */
function tileValue(label: string): string {
  const value = screen.getByText(label).previousElementSibling;
  expect(value, `value above "${label}"`).not.toBeNull();
  return (value as HTMLElement).textContent ?? '';
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Counselor Overview — failed loads are not zeros (WAP-206)', () => {
  it('command center rejects: "Awaiting reply" shows the failed state and a Try again, never 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loaders.assignedCount.mockResolvedValueOnce(6);
    loaders.commandCenter.mockRejectedValueOnce(new Error('fixture database failure'));
    loaders.attention.mockResolvedValueOnce(attention(2));
    const { container } = await renderOverview();

    expect(tileValue('Awaiting reply')).toBe('—');
    expect(tileValue('Awaiting reply')).not.toMatch(/\d/);
    const tile = screen.getByText('Awaiting reply').closest('[data-testid="stat-spark-tile"]') as HTMLElement;
    expect(within(tile).getByText(copy.tileCaption)).toBeInTheDocument();

    const failed = screen.getByTestId('counselor-overview-counts-load-failed');
    expect(failed).toHaveAttribute('role', 'alert');
    expect(failed.dataset.kind).toBe('unavailable');
    expect(failed.dataset.tone).toBe('danger');
    expect(failed).toHaveTextContent(copy.countsTitle);
    expect(within(failed).getByRole('link', { name: copy.action })).toHaveAttribute('href', '/counselor/overview');

    // Recent interview practice came from the same read: unknown, not "none".
    expect(screen.getByTestId('counselor-overview-sessions-load-failed')).toHaveTextContent(copy.sessions);
    expect(screen.queryByText(/No member ran interview practice/)).toBeNull();
    // The audit marker stays for smokes.
    expect(container.querySelector('[data-portal-error-state="counselor-command-center-load-failed"]')).not.toBeNull();

    // The loads that succeeded still show their numbers.
    expect(tileValue('Assigned members')).toBe('6');
    expect(tileValue('Members with risk alerts')).toBe('2');
  });

  it('attention queue rejects: risk / on-track tiles and the list say "Couldn\'t load", not "Nothing flagged"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loaders.commandCenter.mockResolvedValueOnce(center(3));
    loaders.attention.mockRejectedValueOnce(new Error('fixture database failure'));
    const { container } = await renderOverview();

    expect(tileValue('Members with risk alerts')).toBe('—');
    expect(tileValue('On track')).toBe('—');
    expect(tileValue('Awaiting reply')).toBe('3');

    const queue = screen.getByTestId('counselor-overview-queue-load-failed');
    expect(queue).toHaveAttribute('role', 'alert');
    expect(queue).toHaveTextContent(copy.queueTitle);
    expect(within(queue).getByRole('link', { name: copy.action })).toHaveAttribute('href', '/counselor/overview');
    expect(screen.getByTestId('counselor-overview-breakdown-load-failed')).toHaveTextContent(copy.breakdown);
    expect(screen.queryByText(/Nothing flagged/)).toBeNull();
    expect(screen.queryByText(/no one.s waiting on you/)).toBeNull();
    expect(container.querySelector('[data-portal-error-state="counselor-priority-queue-load-failed"]')).not.toBeNull();
  });

  it('both loads succeed with zero: the honest zeros render and no failed state appears', async () => {
    loaders.commandCenter.mockResolvedValueOnce(center(0));
    loaders.attention.mockResolvedValueOnce(attention(0));
    const { container } = await renderOverview();

    expect(tileValue('Awaiting reply')).toBe('0');
    expect(tileValue('Members with risk alerts')).toBe('0');
    expect(tileValue('On track')).toBe('0');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(copy.tileCaption)).toBeNull();
    expect(screen.getByText('No member ran interview practice in the last 7 days.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing flagged/)).toBeInTheDocument();
    expect(container.querySelector('[data-portal-error-state]')).toBeNull();
  });

  it('both loads succeed with N: the tiles show N', async () => {
    loaders.assignedCount.mockResolvedValueOnce(9);
    loaders.commandCenter.mockResolvedValueOnce(center(4, 1));
    loaders.attention.mockResolvedValueOnce(attention(2));
    await renderOverview();

    expect(tileValue('Assigned members')).toBe('9');
    expect(tileValue('Awaiting reply')).toBe('4');
    expect(tileValue('Members with risk alerts')).toBe('2');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(copy.tileCaption)).toBeNull();
  });
});
