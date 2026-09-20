import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
  inheritUserOrg: vi.fn(() => ({ user: { organizationId: 'org-1' } })),
  inheritMemberOrg: vi.fn(() => ({})),
  inheritLeaderOrg: vi.fn(() => ({})),
  inheritInvitedByOrg: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    placementSurvey: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('@/components/portal/kit/pages/admin-subviews/PlacementSurveysKit', () => ({
  PlacementSurveysKit: () => null,
}));
vi.mock('@/components/admin/PlacementSurveysWhatsThis', () => ({ default: () => null }));

import PlacementSurveysPage from '@/app/admin/placement-surveys/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';

const sentOnly = expect.objectContaining({ sentAt: { not: null } });

describe('admin placement surveys page sent-state policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
    vi.mocked(prisma.placementSurvey.findMany).mockResolvedValue([]);
    vi.mocked(prisma.placementSurvey.count).mockResolvedValue(0);
    vi.mocked(prisma.placementSurvey.aggregate).mockResolvedValue({ _avg: {} } as any);
  });

  it('lists and counts only surveys with an accepted delivery (sentAt not null), scoped to the admin org', async () => {
    await expect(PlacementSurveysPage({})).resolves.toBeTruthy();

    expect(prisma.placementSurvey.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.placementSurvey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sentAt: { not: null }, user: { organizationId: 'org-1' } }),
        orderBy: { sentAt: 'desc' },
      }),
    );

    // total, completed and pending counters all exclude pre-acceptance rows.
    const countWheres = vi.mocked(prisma.placementSurvey.count).mock.calls.map(([args]) => (args as any).where);
    expect(countWheres.length).toBeGreaterThanOrEqual(3);
    expect(countWheres[0]).toEqual(sentOnly);
    expect(countWheres[1]).toEqual(expect.objectContaining({ sentAt: { not: null }, completedAt: { not: null } }));
    expect(countWheres[2]).toEqual(expect.objectContaining({ sentAt: { not: null }, completedAt: null }));
    for (const where of countWheres) expect(where).toEqual(expect.objectContaining({ user: { organizationId: 'org-1' } }));
  });

  it('redirects non-admins before reading any survey rows', async () => {
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: false });

    await expect(PlacementSurveysPage({})).rejects.toThrow('REDIRECT:/dashboard');
    expect(prisma.placementSurvey.findMany).not.toHaveBeenCalled();
    expect(prisma.placementSurvey.count).not.toHaveBeenCalled();
  });
});
