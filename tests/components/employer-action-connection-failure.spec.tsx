/**
 * Employer-portal actions that call `fetch()` must not fail silently when the
 * connection drops or the platform answers with an HTML error page. Before the
 * fix, `TierCheckoutForm`, `ImportJobClient` (single and bulk import) and
 * `EmployerJobQuickActions` wrapped their request in `try { … } finally { … }`
 * with no `catch`: a TypeError from `fetch()` or a SyntaxError from
 * `res.json()` escaped as an unhandled rejection, the button re-enabled and the
 * employer read nothing. Quick actions also swallowed a JSON `{ error }` 4xx.
 *
 * Each case asserts the translated `common.connectionError` sentence (never the
 * browser's raw text) and that the real error still reaches the console.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import TierCheckoutForm from '@/app/(portal)/employer/billing/TierCheckoutForm';
import ImportJobClient from '@/app/(portal)/employer/jobs/import/ImportJobClient';
import EmployerJobQuickActions from '@/components/employer/EmployerJobQuickActions';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/employer/jobs',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics/events', () => ({
  trackEmployerImport: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));
vi.mock('@/components/employer/JobForm', () => ({ default: () => <div data-testid="job-form" /> }));

const CONNECTION_COPY = messages.common.connectionError;
const RAW_BROWSER_TEXT = /Failed to fetch|Unexpected token|not valid JSON/;

const fetchMock = vi.fn<typeof fetch>();
let consoleError: ReturnType<typeof vi.spyOn>;

const droppedConnection = () => new TypeError('Failed to fetch');
const htmlErrorPage = () =>
  new Response('<!doctype html><html><body><h1>500 Internal Server Error</h1></body></html>', {
    status: 500,
    headers: { 'content-type': 'text/html' },
  });
const jsonError = (error: string, status = 400) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

function withMessages(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>,
  );
}

async function expectAlert() {
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  return screen.getByRole('alert');
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TierCheckoutForm', () => {
  const props = {
    tierKey: 'growth',
    currentTierKey: 'basic',
    upgradeLabel: 'Upgrade',
    downgradeLabel: 'Downgrade',
    switchLabel: 'Switch',
  };

  it('shows the translated connection message when the connection drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<TierCheckoutForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-tier-checkout'), expect.any(TypeError));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upgrade' })).toBeEnabled());
  });

  it('shows the translated connection message for an HTML error page', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    withMessages(<TierCheckoutForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
  });
});

describe('ImportJobClient', () => {
  it('single import: shows the translated connection message when the connection drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<ImportJobClient companyName="Acme" programSlugs={[]} />);
    fireEvent.change(screen.getByLabelText('Job URL'), { target: { value: 'https://example.com/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build draft from this job' }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-job-import'), expect.any(TypeError));
  });

  it('bulk import: shows the translated connection message for an HTML error page', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    withMessages(<ImportJobClient companyName="Acme" programSlugs={[]} />);
    fireEvent.change(screen.getByPlaceholderText('https://yourcompany.com/careers'), {
      target: { value: 'https://example.com/careers' },
    });
    fireEvent.click(screen.getByRole('button', { name: /import from careers page/i }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
  });
});

describe('EmployerJobQuickActions', () => {
  it('shows the translated connection message when pausing fails on the network', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<EmployerJobQuickActions jobId="job-1" title="Support Specialist" status="live" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled());
  });

  it('keeps a server rejection visible instead of silently doing nothing', async () => {
    fetchMock.mockResolvedValue(jsonError('Only active or paused jobs can be closed'));
    vi.stubGlobal('confirm', () => true);
    withMessages(<EmployerJobQuickActions jobId="job-1" title="Support Specialist" status="approved" />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const alert = await expectAlert();
    expect(alert).toHaveTextContent('Only active or paused jobs can be closed');
    expect(refresh).not.toHaveBeenCalled();
  });
});
