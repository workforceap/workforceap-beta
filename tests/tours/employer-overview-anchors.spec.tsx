process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The employer guided tour's page step (`tour-post-job`) must be on the real
 * default overview (the v2 kit), not only on `?ui=legacy`. Same fixture as
 * tests/app/employer-dashboard-dates.spec.tsx, with the real EmployerHomeKit.
 */
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
  },
}));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));

import EmployerDashboardPage from '@/app/(portal)/employer/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

function anchors(html: string, target: string): number {
  return (html.match(new RegExp(`data-tour="${target}"`, 'g')) ?? []).length;
}

describe('employer overview carries the guided-tour page anchor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({
      employerId: 'emp-1',
      employer: { companyName: 'Fixture Co', status: 'active' },
    } as never);
    vi.mocked(prisma.job.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPostingApplication.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.jobPostingApplication.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([] as never);
  });

  it('the default (kit) overview renders exactly one tour-post-job anchor around the Post a role action', async () => {
    const html = renderToStaticMarkup(await EmployerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(anchors(html, 'tour-post-job')).toBe(1);
    expect(html).toMatch(/data-tour="tour-post-job"[^>]*>[\s\S]{0,400}?href="\/employer\/jobs\/new"/);
    expect(html).toContain('Post a role');
    // The other steps are shell anchors (nav rail + Help), never duplicated on the page.
    for (const shellAnchor of ['tour-overview', 'tour-applicants', 'tour-pipeline', 'tour-messages', 'tour-settings', 'tour-help']) {
      expect(anchors(html, shellAnchor), shellAnchor).toBe(0);
    }
  });
});
