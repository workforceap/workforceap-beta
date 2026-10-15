import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
import { makeScopedProxy } from '@/lib/tenant/scopeProxy';

const dbQueries = vi.hoisted(() => ({
  partner: { findMany: vi.fn(), count: vi.fn() },
  subgroup: { findMany: vi.fn() },
  partnerReferral: { groupBy: vi.fn(), count: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/app/seo', () => ({
  buildPageMetadataAsync: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(),
  withAdminPageScope: vi.fn(async (scope: { superAdmin: boolean; orgId: string }, fn: (db: unknown) => Promise<unknown>) =>
    fn(scope.superAdmin ? dbQueries : makeScopedProxy(scope.orgId, dbQueries))),
  inheritUserOrg: vi.fn(() => ({})),
  inheritMemberOrg: vi.fn(() => ({})),
  inheritLeaderOrg: vi.fn(() => ({})),
  inheritInvitedByOrg: vi.fn(() => ({})),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: dbQueries }));

vi.mock('@/components/admin/PartnersTableClient', () => ({
  default: vi.fn(() => null),
}));

vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// The default render is now the design-kit directory; stub it so the test
// exercises the page's auth + data-loading path without rendering the kit tree.
vi.mock('@/components/portal/kit/pages/admin-subviews/PartnersDirectoryKit', () => ({
  PartnersDirectoryKit: () => null,
}));

import AdminPartnersPage from '@/app/admin/partners/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import PartnersTableClient from '@/components/admin/PartnersTableClient';

function mockReferralPopulation() {
  const referrals = [
    { partnerId: 'own', partner: { organizationId: 'org-1' }, member: { organizationId: 'org-1', memberStatus: 'placed' } },
    { partnerId: 'own', partner: { organizationId: 'org-1' }, member: { organizationId: 'org-1', memberStatus: 'active' } },
    { partnerId: 'foreign', partner: { organizationId: 'org-2' }, member: { organizationId: 'org-2', memberStatus: 'placed' } },
    { partnerId: 'own', partner: { organizationId: 'org-1' }, member: { organizationId: 'org-2', memberStatus: 'placed' } },
    { partnerId: 'foreign', partner: { organizationId: 'org-2' }, member: { organizationId: 'org-1', memberStatus: 'placed' } },
  ];
  const partners = ['own', 'foreign'].map((id) => ({
    id, name: id === 'own' ? 'Own partner' : 'Foreign partner', slug: id, organizationId: id === 'own' ? 'org-1' : 'org-2',
    active: true, status: 'active', partnerType: 'community', referralCode: null, enrollmentPageEnabled: false, sponsoredEnrollment: false,
  }));
  dbQueries.partner.findMany.mockImplementation(async ({ where, select }: {
    where?: unknown; select: { _count: { select: { referrals: true | { where?: unknown } } } };
  }) => {
    const relationCount = select._count.select.referrals;
    const relationFilter = relationCount === true ? {} : relationCount.where ?? {};
    return partners.filter((partner) => matchesWhere(partner, where ?? {})).map((partner) => ({
      ...partner,
      _count: { counselors: 0, referrals: referrals.filter((referral) => referral.partnerId === partner.id && matchesWhere(referral, relationFilter)).length },
    }));
  });
  dbQueries.partner.count.mockImplementation(async (args?: { where?: unknown }) => partners.filter((partner) => matchesWhere(partner, args?.where ?? {})).length);
  dbQueries.subgroup.findMany.mockResolvedValue([]);
  dbQueries.partnerReferral.count.mockImplementation(async ({ where }: { where?: unknown }) =>
    referrals.filter((referral) => matchesWhere(referral, where ?? {})).length);
  dbQueries.partnerReferral.groupBy.mockImplementation(async ({ where }: { where?: unknown }) => {
    const counts = new Map<string, number>();
    for (const referral of referrals.filter((entry) => matchesWhere(entry, where ?? {}))) {
      counts.set(referral.partnerId, (counts.get(referral.partnerId) ?? 0) + 1);
    }
    return [...counts].map(([partnerId, count]) => ({ partnerId, _count: { _all: count } }));
  });
}

describe('AdminPartnersPage authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects authenticated non-admins before loading partner data', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: false });

    await expect(AdminPartnersPage({})).rejects.toThrow('REDIRECT:/dashboard');

    expect(prisma.partner.findMany).not.toHaveBeenCalled();
    expect(prisma.partnerReferral.groupBy).not.toHaveBeenCalled();
    expect(resolveAdminPageTenant).toHaveBeenCalledWith('user-1');
  });

  it('loads partner data for admins', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({
      ok: true,
      orgId: 'org-1',
      superAdmin: true,
    });
    vi.mocked(prisma.partner.findMany).mockResolvedValue([]);
    vi.mocked(prisma.partner.count).mockResolvedValue(0);
    vi.mocked(prisma.partnerReferral.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.partnerReferral.count).mockResolvedValue(0);

    await expect(AdminPartnersPage({})).resolves.toBeTruthy();

    expect(prisma.partner.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('keeps headline totals, partner cards and placement denominators consistent for superadmin=%s', async (superAdmin) => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin });
    mockReferralPopulation();

    const page = await AdminPartnersPage({});
    expect(page.props.totalReferrals).toBe(superAdmin ? 5 : 2);
    expect(page.props.totalPlaced).toBe(superAdmin ? 4 : 1);
    expect(page.props.partners[0].placed).toBe(superAdmin ? 2 : 1);
    expect(page.props.partners[0].referrals).toBe(superAdmin ? 3 : 2);
    expect(page.props.partners.reduce((sum: number, partner: { referrals: number }) => sum + partner.referrals, 0)).toBe(page.props.totalReferrals);
    expect(page.props.partners.reduce((sum: number, partner: { placed: number }) => sum + partner.placed, 0)).toBe(page.props.totalPlaced);
    expect(page.props.signupIntakeHref).toBe(superAdmin ? '/admin/partner-signups' : undefined);
    expect(dbQueries.partnerReferral.groupBy).toHaveBeenCalledOnce();
    expect(dbQueries.partnerReferral.count).toHaveBeenCalledTimes(2);
    const { PartnersDirectoryKit } = await vi.importActual<typeof import('@/components/portal/kit/pages/admin-subviews/PartnersDirectoryKit')>('@/components/portal/kit/pages/admin-subviews/PartnersDirectoryKit');
    const { container } = render(<PartnersDirectoryKit {...page.props} />);
    expect(screen.getByText('Referrals').parentElement?.querySelector('.wa-kit-stat-value')).toHaveTextContent(String(superAdmin ? 5 : 2));
    expect(screen.getByText('Avg placement rate').parentElement?.querySelector('.wa-kit-stat-value')).toHaveTextContent(`${superAdmin ? 80 : 50}%`);
    const ownCard = container.querySelector('a[href="/admin/partners/own"]')!;
    expect(ownCard).toHaveTextContent(`${superAdmin ? 3 : 2} referrals`);
    expect(ownCard).toHaveTextContent(`${superAdmin ? 67 : 50}% placement`);
  });

  it.each([false, true])('shows the legacy signup intake link only for superadmin=%s', async (superAdmin) => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin });
    mockReferralPopulation();
    const element = await AdminPartnersPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });
    const renderLegacy = element.type as (props: Record<string, unknown>) => Promise<React.ReactElement>;
    render(await renderLegacy(element.props));
    const partners = vi.mocked(PartnersTableClient).mock.calls[0][0].partners;
    expect(partners).toHaveLength(superAdmin ? 2 : 1);
    expect(partners[0]._count.referrals).toBe(superAdmin ? 3 : 2);
    expect(partners.reduce((sum, partner) => sum + partner._count.referrals, 0)).toBe(superAdmin ? 5 : 2);
    const link = screen.queryByRole('link', { name: 'Signup intake' });
    if (superAdmin) expect(link).toHaveAttribute('href', '/admin/partner-signups');
    else expect(link).not.toBeInTheDocument();
  });
});
