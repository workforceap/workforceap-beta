import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';
import { ATTENTION_REASON_META } from '@/lib/attention/reasons';
import { MEMBER_REQUEST_FAILURE } from '@/lib/portal/memberRequestFailure';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));

/**
 * Counselor audit §3 item 3: the At-risk page showed "Loading at-risk
 * members…" forever. The dashboard now receives the server's rows as props
 * (no mount-time fetch), and every later request times out and fails in
 * plain language.
 */

const member = (id: string, overrides: Partial<AtRiskMember> = {}): AtRiskMember => ({
  userId: id, alertId: `alert-${id}`, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
  score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
  enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z',
  lastActivityAt: null, ...overrides,
});

const apiRow = (id: string, score: number) => ({
  alertId: `alert-${id}`, userId: id, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
  score, status: 'open', factors: null, enrolledProgram: null, enrolledAt: null,
  memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z', lastActivityAt: null,
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AtRiskDashboard first paint', () => {
  it('renders the server rows immediately without any client fetch', () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }));
    render(<AtRiskDashboard initialMembers={[member('a'), member('b', { score: 40, riskLevel: 'MEDIUM' })]} />);
    expect(screen.getByRole('button', { name: 'Member a' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Member b' })).toBeVisible();
    expect(screen.queryByText(/Loading at-risk members/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('labels every row with the attention model\'s "Risk alert" reason and its definition', () => {
    render(<AtRiskDashboard initialMembers={[member('a')]} />);
    const meta = ATTENTION_REASON_META.risk_alert;
    const chip = screen.getByLabelText(`${meta.label}: ${meta.definition}`);
    expect(chip).toHaveTextContent(meta.label);
    expect(chip).toHaveAttribute('title', meta.definition);
    expect(screen.getByText(/Counted here:/)).toBeVisible();
  });

  it('shows a caseload-empty state (not the filter-empty one) when the server returned no cases', () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }));
    render(<AtRiskDashboard initialMembers={[]} />);
    expect(screen.getByRole('heading', { name: 'No at-risk members on your caseload' })).toBeVisible();
    expect(screen.queryByText('No at-risk members match your filters')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Today' })).toHaveAttribute('href', '/counselor');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AtRiskDashboard failure states', () => {
  it('paints the server failure in plain language with a Try again button, and never a spinner', () => {
    const fetchMock = stubFetch(() => Response.json({ results: [] }));
    render(<AtRiskDashboard initialMembers={[]} initialError="We could not load at-risk members right now." />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'We couldn’t load at-risk members' })).toBeVisible();
    expect(within(alert).getByText('We could not load at-risk members right now.')).toBeVisible();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/Loading at-risk members/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Try again reloads with a timeout signal and replaces the failure with rows on success', async () => {
    const fetchMock = stubFetch(() => Response.json({ count: 1, threshold: 0, results: [apiRow('fresh', 55)] }));
    render(<AtRiskDashboard initialMembers={[]} initialError="Server failed" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Member fresh' })).toBeVisible();
    expect(screen.getByText('High')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/admin/members/at-risk?limit=100&threshold=0');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('Try again after a 500 reads as a plain sentence, not the server body', async () => {
    stubFetch(() => Response.json({ error: 'Failed to fetch at-risk members', details: 'ECONNREFUSED 10.0.0.1' }, { status: 500 }));
    render(<AtRiskDashboard initialMembers={[]} initialError="Server failed" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(MEMBER_REQUEST_FAILURE.unavailable)).toBeVisible();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('a dropped connection on Refresh keeps the last list and explains the failure inline', async () => {
    stubFetch(() => { throw new TypeError('Failed to fetch'); });
    render(<AtRiskDashboard initialMembers={[member('a')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh at-risk members' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(MEMBER_REQUEST_FAILURE.network);
    expect(alert).toHaveTextContent('Showing the last list we loaded.');
    expect(screen.getByRole('button', { name: 'Member a' })).toBeVisible();
  });

  it('a failed acknowledgement names the failure and leaves the alert open', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'PATCH' ? Response.json({ error: 'Failed to update alert' }, { status: 503 }) : Response.json({ results: [] }),
    );
    render(<AtRiskDashboard initialMembers={[member('a')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MEMBER_REQUEST_FAILURE.unavailable);
    expect(screen.getByText('Open')).toBeVisible();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a successful acknowledgement flips the row to Acknowledged without a full reload', async () => {
    const fetchMock = stubFetch(() => Response.json({ success: true }));
    render(<AtRiskDashboard initialMembers={[member('a')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ack' }));
    await waitFor(() => expect(screen.getByText('Acknowledged')).toBeVisible());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
  });
});
