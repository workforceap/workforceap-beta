import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn(), isSuperAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    job: { count: vi.fn(), findMany: vi.fn() },
    jobPostingApplication: { count: vi.fn(), findMany: vi.fn() },
    aIJobMatch: { findMany: vi.fn() },
    employerHiringIntent: { findMany: vi.fn() },
  },
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
vi.mock('@/components/employer/EmployerHiringIntentPanel', () => ({
  default: ({ initialIntents }: { initialIntents: Array<{ id: string; programSlug: string }> }) => (
    <div data-testid="hiring-intents">{initialIntents.map((i) => i.programSlug).join(',')}</div>
  ),
}));
vi.mock('@/components/portal/kit/pages/employer/EmployerHomeKit', () => ({
  EmployerHomeKit: ({ candidates }: { candidates: Array<{ id: string; appliedLabel?: string }> }) => (
    <ul>{candidates.map((c) => <li key={c.id}>{c.appliedLabel ?? '—'}</li>)}</ul>
  ),
}));

import EmployerDashboardPage from '@/app/(portal)/employer/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

/**
 * WAP-193: the cohort-sponsorship hiring-intent form used to render only on
 * /employer?ui=legacy. The default kit home now renders the same panel with
 * this employer's intents.
 */
describe('EmployerDashboardPage hiring intents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({
      employerId: 'emp-1',
      employer: { companyName: 'Fixture Co', status: 'active' },
    } as never);
    vi.mocked(prisma.job.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPostingApplication.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.jobPostingApplication.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.employerHiringIntent.findMany).mockResolvedValue([
      { id: 'hi-1', programSlug: 'it-support' },
    ] as never);
  });

  it('renders the hiring-intent panel on the default kit home, scoped to the employer', async () => {
    const html = renderToStaticMarkup(await EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-testid="hiring-intents"');
    expect(html).toContain('it-support');
    expect(prisma.employerHiringIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employerId: 'emp-1' } }),
    );
  });

  it('keeps the overview when the hiring-intent query fails, hiding only the panel', async () => {
    vi.mocked(prisma.employerHiringIntent.findMany).mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToStaticMarkup(await EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('data-testid="hiring-intents"');
    expect(html).toContain('<ul>');
  });
});
