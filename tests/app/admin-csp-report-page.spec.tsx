import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn() }));

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error, debug: vi.fn() } }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cspViolationBucket: { findMany: mocks.findMany },
  },
}));

import AdminCspReportPage, { generateMetadata } from '@/app/admin/csp-report/page';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';

const hour = (iso: string) => new Date(iso);
const NOW_ISH = Date.now();
const hoursAgo = (h: number) => {
  const d = new Date(NOW_ISH - h * 3_600_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
};

function bucket(over: Partial<{ hourBucket: Date; directive: string; blockedHost: string | null; documentPath: string; disposition: string; count: number; firstSeenAt: Date; lastSeenAt: Date }>) {
  return {
    hourBucket: hoursAgo(2),
    directive: 'script-src-elem',
    blockedHost: 'inline',
    documentPath: '/dashboard',
    disposition: 'report',
    count: 1,
    firstSeenAt: hour('2026-09-21T10:05:00Z'),
    lastSeenAt: hour('2026-09-21T11:50:00Z'),
    ...over,
  };
}

describe('/admin/csp-report guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it('redirects unauthenticated visitors to login before reading anything', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(AdminCspReportPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/csp-report');
    expect(isSuperAdmin).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('sends authenticated non-super-admins back to /admin without a database read', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    await expect(AdminCspReportPage()).rejects.toThrow('REDIRECT:/admin');
    expect(isSuperAdmin).toHaveBeenCalledWith('admin-1');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('builds metadata for the route', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({ path: '/admin/csp-report', title: 'CSP violation reports' });
  });
});

describe('/admin/csp-report for a super admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'super-1' } as never);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
  });

  it('reads one 7-day window and shows 24h / 7d totals plus one row per directive + blocked host', async () => {
    mocks.findMany.mockResolvedValue([
      bucket({ hourBucket: hoursAgo(2), documentPath: '/dashboard', count: 5 }),
      bucket({ hourBucket: hoursAgo(3), documentPath: '/admin/members/:id', count: 3 }),
      bucket({ hourBucket: hoursAgo(4), documentPath: '/en/login', count: 2 }),
      bucket({ hourBucket: hoursAgo(5), documentPath: '/jobs/:id', count: 1 }),
      // Older than 24h but inside 7d: counts toward the week only.
      bucket({ hourBucket: hoursAgo(50), directive: 'connect-src', blockedHost: 'cdn.evil.example', documentPath: '/', count: 7, disposition: 'enforce' }),
    ]);

    render(await AdminCspReportPage());

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.findMany.mock.calls[0][0];
    expect(args.where.hourBucket.gte).toBeInstanceOf(Date);
    expect(Date.now() - args.where.hourBucket.gte.getTime()).toBeGreaterThanOrEqual(7 * 24 * 3_600_000 - 5_000);
    expect(args.take).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { level: 1, name: 'CSP violation reports' })).toBeInTheDocument();
    // KPI strip: 11 in the last 24h, 18 over the week, 2 sources, 7 enforced.
    expect(screen.getByText('Reports (24h)').parentElement).toHaveTextContent('11');
    expect(screen.getByText('Reports (7d)').parentElement).toHaveTextContent('18');
    expect(screen.getByText('Sources (7d)').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Enforced blocks (7d)').parentElement).toHaveTextContent('7');

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1); // drop header
    expect(rows).toHaveLength(2);
    // Most reports first: 11 inline script reports, then the 7 enforced connect-src ones.
    expect(rows[0]).toHaveTextContent('script-src-elem');
    expect(rows[0]).toHaveTextContent('inline');
    expect(rows[0]).toHaveTextContent('11');
    expect(rows[0]).toHaveTextContent('/dashboard');
    expect(rows[0]).toHaveTextContent('/admin/members/:id');
    expect(rows[0]).toHaveTextContent('/en/login');
    expect(rows[0]).not.toHaveTextContent('/jobs/:id'); // fourth path is beyond the sample of 3
    expect(rows[0]).toHaveTextContent('+1 more');
    expect(rows[0]).toHaveTextContent('report');
    expect(rows[1]).toHaveTextContent('connect-src');
    expect(rows[1]).toHaveTextContent('cdn.evil.example');
    expect(rows[1]).toHaveTextContent('enforce');

    // The Report-Only note and the pointer to the enforce flip.
    expect(screen.getByRole('heading', { level: 2, name: 'The policy is Report-Only' })).toBeInTheDocument();
    expect(screen.getByText(/docs\/SECURITY-HARDENING\.md/)).toBeInTheDocument();
    expect(screen.getByText(/older than 30 days are purged/)).toBeInTheDocument();
  });

  it('renders the empty state when nothing has been reported in the window', async () => {
    mocks.findMany.mockResolvedValue([]);
    render(await AdminCspReportPage());
    expect(screen.getByText('Reports (7d)').parentElement).toHaveTextContent('0');
    // The kit renders the empty state for both the table and the mobile-card layout.
    expect(screen.getAllByText('No violation reports in the last 7 days').length).toBeGreaterThanOrEqual(1);
  });
});
