process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * Every member guided-tour step is shell chrome (`MemberWorkspaceShell`), so
 * the real default overview (`MemberHomeKit`, not only `?ui=legacy`) must
 * render none of the anchors itself — otherwise desktop would paint two
 * spotlights for one step. tests/tours/member-tour.spec.tsx renders the same
 * kit inside the real shell and asserts exactly one anchor per step.
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
import { getUser } from '@/lib/auth/server';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import { TOUR_REGISTRY } from '@/lib/tours/registry';

function anchors(html: string, target: string): number {
  return (html.match(new RegExp(`data-tour="${target}"`, 'g')) ?? []).length;
}

describe('member overview leaves every guided-tour anchor to the shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-user-1', email: 'maya@example.org' } as never);
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

  it('the default (kit) overview renders the real home and zero tour anchors of its own', async () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        {await DashboardPage({ searchParams: Promise.resolve({}) })}
      </NextIntlClientProvider>,
    );
    expect(loadMemberDashboardHome).toHaveBeenCalledTimes(1);
    expect(html).toContain('Certification path');
    expect(html).toContain('Application pipeline');
    expect(html).not.toContain('data-portal-error-state');
    for (const step of TOUR_REGISTRY['member.home'].steps) {
      expect(anchors(html, step.target), step.target).toBe(0);
    }
    expect(html).not.toMatch(/data-tour=/);
  });
});
