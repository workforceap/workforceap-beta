import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
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
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findMany: vi.fn(async () => []) } },
}));

vi.mock('@/lib/admin/jobReadyCandidates', () => ({
  loadJobReadyProgressPage: vi.fn(async () => ({ rows: [], total: 0 })),
}));

vi.mock('@/components/admin/AdminJobReadyTable', () => ({ default: () => null }));
vi.mock('@/components/admin/MembersListNav', () => ({ default: () => null }));

import AdminJobReadyPage from '@/app/admin/members/job-ready/page';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';
import { SUPPORTED_PROGRAM_STORAGE_VALUES } from '@/lib/content/programs';
import { JOB_READY_TRAINING_PCT } from '@/lib/member/trainingProgress';
import { loadJobReadyProgressPage } from '@/lib/admin/jobReadyCandidates';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';

describe('admin job-ready page query arguments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
  });

  it('pages the SQL cohort with every supported storage value (canonical slugs, titles and legacy aliases)', async () => {
    await expect(AdminJobReadyPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();

    expect(loadJobReadyProgressPage).toHaveBeenCalledTimes(1);
    expect(loadJobReadyProgressPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdmin: false,
      minimumPercent: JOB_READY_TRAINING_PCT,
      programStorageValues: SUPPORTED_PROGRAM_STORAGE_VALUES,
      limit: ADMIN_SSR_LIST_CAP,
      offset: 0,
    });
  });

  it('offsets by whole SSR pages and forwards super-admin scope', async () => {
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: true });
    vi.mocked(loadJobReadyProgressPage).mockResolvedValueOnce({ rows: [], total: ADMIN_SSR_LIST_CAP * 5 });

    await expect(AdminJobReadyPage({ searchParams: Promise.resolve({ page: '3' }) })).resolves.toBeTruthy();

    expect(loadJobReadyProgressPage).toHaveBeenCalledWith(
      expect.objectContaining({ superAdmin: true, offset: ADMIN_SSR_LIST_CAP * 2, limit: ADMIN_SSR_LIST_CAP }),
    );
  });

  it('redirects non-admins before paging', async () => {
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: false });
    await expect(AdminJobReadyPage({})).rejects.toThrow('REDIRECT:/dashboard');
    expect(loadJobReadyProgressPage).not.toHaveBeenCalled();
  });
});
