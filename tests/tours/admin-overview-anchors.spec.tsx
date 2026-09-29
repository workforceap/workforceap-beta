process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * Every admin guided-tour step is shell chrome (`AdminPortalShell`), so the
 * real default admin home (the Command Center at /admin, not `?ui=legacy`)
 * must render none of the anchors itself — otherwise desktop would paint two
 * spotlights for one step. tests/tours/admin-tour.spec.tsx renders the same
 * kit inside the real shell and asserts exactly one anchor per step.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  withAuthGuc: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(),
  withAdminPageScope: vi.fn(),
  inheritUserOrg: vi.fn(),
  inheritMemberOrg: vi.fn(),
  inheritLeaderOrg: vi.fn(),
  inheritInvitedByOrg: vi.fn(),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    placementRecord: { findMany: vi.fn(async () => [{ placedAt: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 15)) }]) },
    workflowDiagnostic: { count: vi.fn(async () => 0) },
    cronExecution: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/admin/triageDigest', () => ({ getTriageDigest: vi.fn() }));
vi.mock('@/lib/admin/commandCenter', () => ({ getAdminCommandCenter: vi.fn() }));
vi.mock('@/lib/admin/loadAdminApprovalQueue', async () => {
  const { emptyAdminApprovalQueue } = await import('@/lib/admin/adminApprovalQueue');
  return { loadAdminApprovalQueue: vi.fn(async () => emptyAdminApprovalQueue()) };
});
vi.mock('@/lib/attention/admin', () => ({ getAdminAttention: vi.fn() }));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({ countThreadsWithSlaBreach: vi.fn(async () => 0) }));

import AdminTodayPage from '@/app/admin/page';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getAdminCommandCenter } from '@/lib/admin/commandCenter';
import { getAdminAttention } from '@/lib/attention/admin';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { TOUR_REGISTRY } from '@/lib/tours/registry';

function anchors(html: string, target: string): number {
  return (html.match(new RegExp(`data-tour="${target}"`, 'g')) ?? []).length;
}

describe('admin Today leaves every guided-tour anchor to the shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-user-1', email: 'owner@example.org' } as never);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: true } as never);
    vi.mocked(getAdminAttention).mockResolvedValue(emptyAttentionQueue());
    vi.mocked(getAdminCommandCenter).mockResolvedValue({
      needsReply: [],
      atRisk: [],
      interviewing: [],
      applicationsPending: [],
      programHealth: [{ label: 'Google IT Support Certificate', count: 12, pct: 60 }],
      totals: {
        needsReplyCount: 2,
        atRiskCount: 1,
        interviewingCount: 3,
        applicationsPendingCount: 4,
        certificationsPendingCount: 1,
        oldestPendingApplicationDays: 6,
      },
    } as never);
  });

  it('the default (kit) home renders the real Today and zero tour anchors of its own', async () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        {await AdminTodayPage({ searchParams: Promise.resolve({}) })}
      </NextIntlClientProvider>,
    );
    expect(getAdminCommandCenter).toHaveBeenCalledTimes(1);
    expect(html).toContain('<h1 class="h-font">Today</h1>');
    expect(html).toContain('Waiting on your decision');
    expect(html).toContain('What needs you today');
    expect(html).toContain('Enrollment share by program');
    expect(html).not.toContain('data-portal-error-state');
    for (const step of TOUR_REGISTRY['admin.home'].steps) {
      expect(anchors(html, step.target), step.target).toBe(0);
    }
    expect(html).not.toMatch(/data-tour=/);
  });
});
