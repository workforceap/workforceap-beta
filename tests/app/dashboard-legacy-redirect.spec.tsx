process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * WAP-195: /dashboard has one implementation (the kit home). The retired
 * `?ui=legacy` home and its `?tab=` switches are old bookmarks, so the page
 * redirects them to /dashboard before any member read, keeping a well-formed
 * `?program=<slug>` (a real kit feature since WAP-194). The page runs for
 * real; auth, headers and the loader are stubbed (same stubs as
 * tests/tours/member-overview-anchors.spec.tsx).
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  canBypassMemberAssessment: vi.fn(),
  getProfileRole: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/member/ensureAppUser', () => ({ ensureAppUserProvisioned: vi.fn() }));
vi.mock('@/lib/member/loadMemberDashboardHome', () => ({ loadMemberDashboardHome: vi.fn() }));
vi.mock('@/components/portal/MemberApprovalStatusCard', () => ({ default: () => null }));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));

import DashboardPage from '@/app/(portal)/dashboard/page';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';

type Params = { program?: string | string[]; tab?: string | string[]; ui?: string | string[] };
const page = (params: Params) => DashboardPage({ searchParams: Promise.resolve(params) });

describe('/dashboard retires ?ui=legacy and ?tab= (WAP-195)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-user-1', email: 'maya@example.org' } as never);
    vi.mocked(getMemberDashboardAccess).mockResolvedValue({
      portalRoles: [{ role: 'member', roleLabel: 'Member', homeHref: '/dashboard' }],
      superAdmin: false,
      redirectTo: null,
    });
    vi.mocked(loadMemberDashboardHome).mockResolvedValue({
      approvalStatus: {} as never,
      firstName: 'Maya',
      coursePercent: 42,
      programTitle: 'Google IT Support Certificate',
      programStatus: 'In progress',
      activeJobs: 2,
      certs: 1,
      points: 640,
      currentStreak: 3,
      longestStreak: 5,
      goals: [],
      nextLesson: 'Operating Systems',
      nextBadgeName: 'Networking basics',
      nextBadgePercent: 30,
      nextBadgeRemaining: '3 modules',
      pipeline: [{ role: 'Help Desk Analyst', company: 'Acme', stage: 'Applied', tone: 'muted', appliedLabel: 'Jun 2', stageIndex: 1, stageTotal: 3 }],
      certModulesDone: 3,
      certModulesTotal: 7,
      pointsLedger: [],
      programHref: '/dashboard/program',
      resumeHref: '/dashboard/program',
      coursesHref: '/dashboard/learning',
      toolkitHref: '/dashboard/ai-tools',
      jobsHref: '/dashboard/jobs',
      doThisNext: null,
      ungatedDigitalBasicsHref: '/dashboard/learning/digital-basics',
    } as never);
  });

  it.each([
    [{ ui: 'legacy' }, '/dashboard'],
    [{ tab: 'learning' }, '/dashboard'],
    [{ tab: 'opportunities' }, '/dashboard'],
    [{ ui: 'legacy', tab: 'home' }, '/dashboard'],
    [{ ui: 'legacy', program: 'google-it-support' }, '/dashboard?program=google-it-support'],
    [{ tab: 'learning', program: 'data-analytics-professional-certificate-google' }, '/dashboard?program=data-analytics-professional-certificate-google'],
    [{ ui: 'legacy', tab: 'learning', program: '../admin' }, '/dashboard'],
  ] as Array<[Params, string]>)('%j redirects to %s before any member read', async (params, target) => {
    await expect(page(params)).rejects.toThrow(`REDIRECT:${target}`);
    expect(redirect).toHaveBeenCalledWith(target);
    expect(loadMemberDashboardHome).not.toHaveBeenCalled();
  });

  it('still sends a signed-out visitor to login first', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(page({ ui: 'legacy', program: 'google-it-support' })).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard');
    expect(loadMemberDashboardHome).not.toHaveBeenCalled();
  });

  it.each(['/employer', '/partner', '/counselor', '/admin'])(
    'redirects a non-member-only account to %s before the home loader or provisioning',
    async (destination) => {
      vi.mocked(getMemberDashboardAccess).mockResolvedValue({
        portalRoles: [],
        superAdmin: false,
        redirectTo: destination,
      });

      await expect(page({})).rejects.toThrow(`REDIRECT:${destination}`);
      expect(loadMemberDashboardHome).not.toHaveBeenCalled();
      expect(ensureAppUserProvisioned).not.toHaveBeenCalled();
    },
  );

  it('stops before the home loader when role resolution fails', async () => {
    vi.mocked(getMemberDashboardAccess).mockRejectedValue(new Error('role lookup unavailable'));

    await expect(page({})).rejects.toThrow('role lookup unavailable');
    expect(loadMemberDashboardHome).not.toHaveBeenCalled();
    expect(ensureAppUserProvisioned).not.toHaveBeenCalled();
  });

  it.each([{}, { program: 'google-it-support' }, { ui: 'kit' }] as Params[])('%j renders the kit home with no redirect', async (params) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        {await page(params)}
      </NextIntlClientProvider>,
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(loadMemberDashboardHome).toHaveBeenCalledTimes(1);
    expect(html).toContain('Certification path');
    expect(html).not.toContain('data-portal-error-state');
  });
});
