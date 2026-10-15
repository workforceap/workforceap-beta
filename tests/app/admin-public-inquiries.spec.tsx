import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeScopedProxy } from '@/lib/tenant/scopeProxy';

const mocks = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), findMany: vi.fn(), count: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: mocks.scope,
  withAdminPageScope: async (scope: { orgId: string; superAdmin: boolean }, fn: (db: unknown) => Promise<unknown>) => {
    const db = { publicInquiry: { findMany: mocks.findMany, count: mocks.count } };
    return fn(scope.superAdmin ? db : makeScopedProxy(scope.orgId, db));
  },
}));

import PublicInquiriesPage from '@/app/admin/public-inquiries/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 'admin-a' });
  mocks.scope.mockResolvedValue({ ok: true, orgId: 'org-a', superAdmin: false });
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe('public inquiry admin inbox', () => {
  it('guards anonymous and non-admin access before reading inquiries', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(PublicInquiriesPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/admin/public-inquiries');
    expect(mocks.findMany).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: 'member' });
    mocks.scope.mockResolvedValue({ ok: false });
    await expect(PublicInquiriesPage()).rejects.toThrow('REDIRECT:/dashboard');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('bounds both reads to the admin tenant, paginates, and distinguishes provider acceptance from delivery', async () => {
    mocks.findMany.mockResolvedValue([{
      id: 'inquiry-a', organizationId: 'org-a', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.net', phone: null,
      kind: 'sponsorship', topic: 'Sponsorship inquiry', message: '<script>unsafe</script>', organizationName: 'Analytical Engines',
      interestArea: 'Bronze', seats: 5, roleTitle: null, smsPreferred: false, notificationStatus: 'accepted', createdAt: new Date('2026-10-15T12:00:00Z'),
    }]);
    mocks.count.mockResolvedValue(51);
    render(await PublicInquiriesPage({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' }, skip: 25, take: 25 }));
    expect(mocks.count).toHaveBeenCalledWith({ where: { organizationId: 'org-a' } });
    expect(screen.getByText('Provider accepted')).toBeInTheDocument();
    expect(screen.getByText(/does not confirm inbox delivery/)).toBeInTheDocument();
    expect(screen.getByText(/180 days/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/admin/public-inquiries?page=1');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/admin/public-inquiries?page=3');
  });

  it('normalizes malformed page values instead of issuing an unbounded query', async () => {
    await PublicInquiriesPage({ searchParams: Promise.resolve({ page: '-100' }) });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
  });
});
