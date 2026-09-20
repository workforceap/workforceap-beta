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
}));

vi.mock('@/lib/admin/cohortAnalytics', () => ({
  getAiToolsCohortStats: vi.fn(async () => []),
  getAiToolUsageCounts: vi.fn(async () => []),
}));

vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/portal/kit/pages/admin-subviews/AiToolsAdminKit', () => ({ AiToolsAdminKit: () => null }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: () => null }));

import AdminAiToolsPage from '@/app/admin/ai-tools/page';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getAiToolsCohortStats, getAiToolUsageCounts } from '@/lib/admin/cohortAnalytics';

const legacy = { searchParams: Promise.resolve({ ui: 'legacy' }) };

describe('admin AI tools page tenant-aware access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends signed-out visitors to login before resolving any tenant scope or analytics', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    await expect(AdminAiToolsPage({})).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/ai-tools');
    expect(resolveAdminPageTenant).not.toHaveBeenCalled();
    expect(getAiToolUsageCounts).not.toHaveBeenCalled();
    expect(getAiToolsCohortStats).not.toHaveBeenCalled();
  });

  it('sends non-admins to the dashboard after resolving their scope and before loading analytics', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: false });

    await expect(AdminAiToolsPage({})).rejects.toThrow('REDIRECT:/dashboard');
    await expect(AdminAiToolsPage(legacy)).rejects.toThrow('REDIRECT:/dashboard');
    expect(resolveAdminPageTenant).toHaveBeenCalledWith('member-1');
    expect(getAiToolUsageCounts).not.toHaveBeenCalled();
    expect(getAiToolsCohortStats).not.toHaveBeenCalled();
  });

  it('passes an ordinary admin org to both analytics loaders, after the auth and scope checks', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-a', superAdmin: false });

    await expect(AdminAiToolsPage({})).resolves.toBeTruthy();
    expect(getAiToolUsageCounts).toHaveBeenCalledWith('org-a');
    expect(getAiToolsCohortStats).not.toHaveBeenCalled();

    await expect(AdminAiToolsPage(legacy)).resolves.toBeTruthy();
    expect(getAiToolsCohortStats).toHaveBeenCalledWith('org-a');

    const [userOrder] = vi.mocked(getUser).mock.invocationCallOrder;
    const [scopeOrder] = vi.mocked(resolveAdminPageTenant).mock.invocationCallOrder;
    const [usageOrder] = vi.mocked(getAiToolUsageCounts).mock.invocationCallOrder;
    expect(userOrder).toBeLessThan(scopeOrder);
    expect(scopeOrder).toBeLessThan(usageOrder);
    // Scope is resolved once per render, never re-checked or skipped.
    expect(resolveAdminPageTenant).toHaveBeenCalledTimes(2);
  });

  it('keeps a super admin cross-tenant (no org passed to analytics)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'super-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-a', superAdmin: true });

    await expect(AdminAiToolsPage({})).resolves.toBeTruthy();
    await expect(AdminAiToolsPage(legacy)).resolves.toBeTruthy();
    expect(getAiToolUsageCounts).toHaveBeenCalledWith(undefined);
    expect(getAiToolsCohortStats).toHaveBeenCalledWith(undefined);
  });
});
