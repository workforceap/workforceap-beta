import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AdminHealthPage from '@/app/admin/health/page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Default kit view (no ?ui=legacy) — UI-21 callout lives on SystemHealthKit.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const degradedPayload = {
  status: 'degraded' as const,
  checks: {
    database: { status: 'ok' as const, latencyMs: 18 },
    redis: { status: 'degraded' as const, note: 'UPSTASH_REDIS_REST_URL unset; in-memory fallback' },
    prisma: { status: 'ok' as const },
    cronJobs: { status: 'ok' as const, failures: 0 },
    webhooks: { status: 'ok' as const, pendingRetries: 0 },
    xapi: { status: 'ok' as const, pendingStatements: 0 },
    aiTools: { status: 'ok' as const, queueDepth: 0 },
    email: { status: 'ok' as const, backlog: 0 },
    emailDelivery: {
      status: 'ok' as const,
      sent24h: 0,
      failed24h: 0,
      bounced24h: 0,
      webhookConfigured: false,
      lastWebhookAt: null,
    },
    discordNotifications: { status: 'ok' as const, configured: false, errors24h: 0, dropped24h: 0 },
    webPush: { status: 'ok' as const, configured: false, subscriptions: 0, errors24h: 0 },
  },
  generatedAt: new Date().toISOString(),
};

const healthyPayload = {
  ...degradedPayload,
  status: 'healthy' as const,
  checks: {
    ...degradedPayload.checks,
    redis: { status: 'ok' as const, latencyMs: 4 },
  },
};

describe('Admin health kit UI-21 degraded callout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('lists the exact failing check when App is Degraded', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(degradedPayload),
      }),
    ) as unknown as typeof fetch;

    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByTestId('health-degraded-callout')).toBeInTheDocument());
    const callout = screen.getByTestId('health-degraded-callout');
    expect(callout).toHaveTextContent('App is degraded — failing checks');
    expect(callout).toHaveTextContent('Redis cache');
    expect(callout).toHaveTextContent('Degraded');
    expect(callout).toHaveTextContent('UPSTASH_REDIS_REST_URL unset');
    // App tile also shows Degraded under the roll-up KPI.
    expect(screen.getAllByText('Degraded').length).toBeGreaterThan(0);
  });

  it('hides the callout when overall status is healthy', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(healthyPayload),
      }),
    ) as unknown as typeof fetch;

    render(<AdminHealthPage />);

    await waitFor(() => expect(screen.getByText('Operational')).toBeInTheDocument());
    expect(screen.queryByTestId('health-degraded-callout')).toBeNull();
  });
});
