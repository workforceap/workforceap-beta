import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAdminPageTenant: vi.fn(),
  isCounselor: vi.fn(),
  isAdmin: vi.fn(),
  deniedPortalHomeHref: vi.fn(),
  getAdminAttention: vi.fn(),
  getCounselorAttention: vi.fn(),
  getCounselorApprovalQueue: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    const error = new Error(`REDIRECT:${href}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${href};307;`;
    throw error;
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/i18n/pickRootClientMessages', () => ({ pickAdminClientMessages: () => ({}) }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser, withAuthGuc: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  isCounselor: mocks.isCounselor,
  isAdmin: mocks.isAdmin,
  isSuperAdmin: vi.fn(),
}));
vi.mock('@/lib/auth/portalGuards', () => ({ deniedPortalHomeHref: mocks.deniedPortalHomeHref }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: mocks.resolveAdminPageTenant,
  withAdminPageScope: vi.fn(),
  inheritUserOrg: vi.fn(),
  inheritMemberOrg: vi.fn(),
  inheritLeaderOrg: vi.fn(),
  inheritInvitedByOrg: vi.fn(),
}));
vi.mock('@/lib/attention/admin', () => ({ getAdminAttention: mocks.getAdminAttention }));
vi.mock('@/lib/attention/counselor', () => ({ getCounselorAttention: mocks.getCounselorAttention }));
vi.mock('@/lib/counselor/loadApprovalQueue', () => ({ getCounselorApprovalQueue: mocks.getCounselorApprovalQueue }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import AdminLayout from '@/app/admin/layout';
import AdminTodayPage from '@/app/admin/page';
import CounselorLayout from '@/app/(portal)/counselor/layout';
import CounselorRootPage from '@/app/(portal)/counselor/page';
import CounselorOverviewPage from '@/app/(portal)/counselor/overview/page';
import CounselorTodayPage from '@/app/(portal)/counselor/today/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'actor-1' });
  mocks.resolveAdminPageTenant.mockResolvedValue({ ok: false });
  mocks.isCounselor.mockResolvedValue(false);
  mocks.isAdmin.mockResolvedValue(false);
});

describe('root portal guards during parallel layout and page renders', () => {
  it.each(['/dashboard', '/counselor', '/employer', '/partner', '/'])
    ('sends a denied admin visitor consistently to %s', async (home) => {
      mocks.deniedPortalHomeHref.mockResolvedValue(home);
      const results = await Promise.allSettled([
        AdminLayout({ children: null }),
        AdminTodayPage({ searchParams: Promise.resolve({}) }),
      ]);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') expect(result.reason).toHaveProperty('message', `REDIRECT:${home}`);
      }
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledTimes(2);
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledWith('actor-1', 'admin');
      expect(mocks.getAdminAttention).not.toHaveBeenCalled();
    });

  it.each(['/dashboard', '/admin', '/employer', '/partner', '/'])
    ('sends a denied counselor visitor consistently to %s', async (home) => {
      mocks.deniedPortalHomeHref.mockResolvedValue(home);
      const results = await Promise.allSettled([
        CounselorLayout({ children: null }),
        CounselorTodayPage(),
      ]);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') expect(result.reason).toHaveProperty('message', `REDIRECT:${home}`);
      }
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledTimes(2);
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledWith('actor-1', 'counselor');
      expect(mocks.getCounselorAttention).not.toHaveBeenCalled();
      expect(mocks.getCounselorApprovalQueue).not.toHaveBeenCalled();
    });

  it.each([undefined, 'legacy'])
    ('sends a denied counselor root visitor to their home before forwarding ui=%s', async (ui) => {
      mocks.deniedPortalHomeHref.mockResolvedValue('/employer');
      const results = await Promise.allSettled([
        CounselorLayout({ children: null }),
        CounselorRootPage({ searchParams: Promise.resolve(ui ? { ui } : {}) }),
      ]);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') expect(result.reason).toHaveProperty('message', 'REDIRECT:/employer');
      }
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledTimes(2);
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledWith('actor-1', 'counselor');
    });

  it.each([undefined, 'legacy'])
    ('denies a direct counselor overview visit before loading data with ui=%s', async (ui) => {
      mocks.deniedPortalHomeHref.mockResolvedValue('/partner');
      await expect(CounselorOverviewPage({ searchParams: Promise.resolve(ui ? { ui } : {}) }))
        .rejects.toThrow('REDIRECT:/partner');
      expect(mocks.deniedPortalHomeHref).toHaveBeenCalledWith('actor-1', 'counselor');
      expect(mocks.getCounselorAttention).not.toHaveBeenCalled();
    });

  it.each([
    [undefined, '/counselor/today'],
    ['legacy view', '/counselor/overview?ui=legacy%20view'],
  ] as const)('preserves the root forwarding for an authorized counselor with ui=%s', async (ui, expected) => {
    mocks.isCounselor.mockResolvedValue(true);
    await expect(CounselorRootPage({ searchParams: Promise.resolve(ui ? { ui } : {}) }))
      .rejects.toThrow(`REDIRECT:${expected}`);
    expect(mocks.deniedPortalHomeHref).not.toHaveBeenCalled();
  });
});
