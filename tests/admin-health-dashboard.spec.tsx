import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminHealthPage from '@/app/admin/health/page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// The portal reskin (#9588a888) made the kit-based `SystemHealthKit` view the
// default render and moved the detailed subsystem dashboard (overall banner,
// per-subsystem cards, related-page links) behind `?ui=legacy`. These tests
// assert that detailed view, which is still a supported code path, so we drive
// the legacy view explicitly via the search-params mock.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('ui=legacy'),
}));

vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {action && <div data-testid="header-actions">{action}</div>}
    </div>
  ),
}));

function mockHealthResponse(body: object) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  ) as unknown as typeof global.fetch;
}

function mockHealthError(status: number, errorText: string) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ error: errorText }),
    })
  ) as unknown as typeof global.fetch;
}

const healthyPayload = {
  status: 'healthy' as const,
  checks: {
    database: { status: 'ok' as const, latencyMs: 12 },
    redis: { status: 'ok' as const, latencyMs: 5 },
    prisma: { status: 'ok' as const },
    cronJobs: { status: 'ok' as const, lastRun: new Date().toISOString(), failures: 0 },
    webhooks: { status: 'ok' as const, pendingRetries: 2 },
    xapi: { status: 'ok' as const, pendingStatements: 150 },
    aiTools: { status: 'ok' as const, queueDepth: 0 },
    email: { status: 'ok' as const, backlog: 0 },
    emailDelivery: { status: 'ok' as const, sent24h: 12, failed24h: 0, bounced24h: 0, webhookConfigured: true, lastWebhookAt: null },
    discordNotifications: { status: 'ok' as const, configured: true, errors24h: 0, dropped24h: 0 },
    webPush: { status: 'ok' as const, configured: false, subscriptions: 0, errors24h: 0 },
  },
  generatedAt: new Date().toISOString(),
};

const degradedPayload = {
  status: 'degraded' as const,
  checks: {
    database: { status: 'ok' as const, latencyMs: 12 },
    redis: { status: 'ok' as const, latencyMs: 5 },
    prisma: { status: 'ok' as const },
    cronJobs: { status: 'degraded' as const, lastRun: new Date().toISOString(), failures: 3, note: '3 failures in 24h' },
    webhooks: { status: 'ok' as const, pendingRetries: 2 },
    xapi: { status: 'ok' as const, pendingStatements: 150 },
    aiTools: { status: 'ok' as const, queueDepth: 0 },
    email: { status: 'ok' as const, backlog: 0 },
    emailDelivery: { status: 'ok' as const, sent24h: 12, failed24h: 0, bounced24h: 0, webhookConfigured: true, lastWebhookAt: null },
    discordNotifications: { status: 'ok' as const, configured: true, errors24h: 0, dropped24h: 0 },
    webPush: { status: 'ok' as const, configured: false, subscriptions: 0, errors24h: 0 },
  },
  generatedAt: new Date().toISOString(),
};

describe('AdminHealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', () => {
    mockHealthResponse(healthyPayload);
    render(<AdminHealthPage />);
    expect(screen.getByText('Loading health data…')).toBeInTheDocument();
  });

  it('renders all subsystem cards when healthy', async () => {
    mockHealthResponse(healthyPayload);
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Overall: HEALTHY')).toBeInTheDocument());

    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('Prisma')).toBeInTheDocument();
    expect(screen.getByText('Cron Jobs')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.getByText('xAPI')).toBeInTheDocument();
    expect(screen.getByText('AI Tools')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows degraded status when a subsystem is degraded', async () => {
    mockHealthResponse(degradedPayload);
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Overall: DEGRADED')).toBeInTheDocument());

    const cronCard = screen.getByText('Cron Jobs').closest('.portal-card');
    expect(cronCard).toHaveTextContent('degraded');
  });

  it('shows alert for degraded subsystem', async () => {
    mockHealthResponse(degradedPayload);
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Overall: DEGRADED')).toBeInTheDocument());
    // The note intentionally renders in both the Cron Jobs card detail and the Active Alerts log
    await waitFor(() => expect(screen.getAllByText(/3 failures in 24h/)[0]).toBeInTheDocument());
  });

  it('shows error state on fetch failure', async () => {
    mockHealthError(500, 'Internal server error');
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText(/Error loading health data/)).toBeInTheDocument());
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('refetches when retry button clicked', async () => {
    mockHealthError(500, 'Internal server error');
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());

    mockHealthResponse(healthyPayload);
    await userEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('Overall: HEALTHY')).toBeInTheDocument());
  });

  it('shows related page links', async () => {
    mockHealthResponse(healthyPayload);
    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Overall: HEALTHY')).toBeInTheDocument());

    expect(screen.getByText('Cron Monitor')).toBeInTheDocument();
    expect(screen.getByText('Webhook Events')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Email & Crons')).toBeInTheDocument();
    expect(screen.getByText('Public Health JSON')).toBeInTheDocument();
  });
});
