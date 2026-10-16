import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ findPartner: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next/link', () => ({ default: ({ href, children }: React.ComponentProps<'a'>) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }) }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (_org: string, fn: (db: unknown) => unknown) => fn({
  partner: { findUnique: state.findPartner, findMany: async () => [] }, subgroup: { findMany: async () => [] },
}) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/components/admin/InvitePartnerUserButton', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerPayoutsPanel', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerDetailActions', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerApprovalActions', () => ({ PartnerApprovalActions: () => null }));
vi.mock('@/components/admin/PartnerEnrollmentFunnelStrip', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerSchoolConfigCard', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

import AdminPartnerDetailPage from '@/app/admin/partners/[id]/page';

beforeEach(() => vi.clearAllMocks());
describe('partner submitted organization type', () => {
  it.each([['Nonprofit', 'Nonprofit'], [null, 'Not recorded'], ['', 'Not recorded']])('displays %s without guessing an organization type', async (organizationType, expected) => {
    state.findPartner.mockResolvedValue({ id: 'partner-1', name: 'Partner', organizationType,
      status: 'active', active: true, partnerType: 'referral', stripeConnectId: null,
      counselors: [], referrals: [], programCatalog: [], _count: { counselors: 0, referrals: 0 },
    });
    render(await AdminPartnerDetailPage({ params: Promise.resolve({ id: 'partner-1' }) }));
    expect(screen.getByText('Organization type').nextElementSibling).toHaveTextContent(expected!);
  });
});
