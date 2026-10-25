process.env.TZ = 'UTC';

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
    user: { findUnique: vi.fn() },
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
vi.mock('@/components/portal/kit/pages/employer/EmployerHomeKit', () => ({
  EmployerHomeKit: ({ candidates, firstName }: { candidates: Array<{ id: string; appliedLabel?: string }>; firstName?: string }) => (
    <>
      <p data-testid="first-name">{firstName ?? 'no-first-name'}</p>
      <ul>{candidates.map((c) => <li key={c.id}>{c.appliedLabel ?? '—'}</li>)}</ul>
    </>
  ),
}));

import EmployerDashboardPage from '@/app/(portal)/employer/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

describe('EmployerDashboardPage applied dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({
      employerId: 'emp-1',
      employer: { companyName: 'Fixture Co', status: 'active' },
    } as never);
    vi.mocked(prisma.job.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPostingApplication.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.jobPostingApplication.findMany).mockResolvedValue([
      {
        id: 'app-1', jobId: 'job-1', studentId: 'member-1', status: 'pending', appliedAt: INSTANT,
        job: { title: 'Fixture Role' }, student: { fullName: 'Fixture Candidate' },
      },
    ] as never);
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: 'Jordan Lee' } as never);
  });

  it('labels the kit candidate row with the Central calendar day', async () => {
    const html = renderToStaticMarkup(await EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Sep 18, 2026');
    expect(html).not.toContain('Sep 19');
  });

  it('reads the greeting name inside the same batch as the kit counts, scoped to the signed-in user', async () => {
    let release!: (row: { fullName: string }) => void;
    vi.mocked(prisma.user.findUnique).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }) as never);
    const pending = EmployerDashboardPage({ searchParams: Promise.resolve({}) });
    // The name read is still open while the first count has already started: they overlap.
    await vi.waitFor(() => expect(prisma.job.count).toHaveBeenCalled());
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'employer-user-1' }, select: { fullName: true } });
    release({ fullName: 'Jordan Lee' });
    expect(renderToStaticMarkup(await pending)).toContain('Jordan');
  });

  it('falls back to the workspace title when the name read fails, and never reads it before the role guard', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('db down'));
    const html = renderToStaticMarkup(await EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('no-first-name');

    vi.mocked(prisma.user.findUnique).mockClear();
    vi.mocked(getEmployerForUser).mockResolvedValue(null as never);
    await expect(EmployerDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
