import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

type SignupRow = { orgType: string; serveArea: string | null; expectedMonthly: string | null };
const state = vi.hoisted(() => ({
  findPartner: vi.fn(),
  signup: null as SignupRow | null,
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next/link', () => ({ default: ({ href, children }: React.ComponentProps<'a'>) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }) }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: async (_org: string, fn: (db: unknown) => unknown) => fn({
  partner: { findUnique: state.findPartner, findMany: async () => [] }, subgroup: { findMany: async () => [] },
}) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerSignupRequest: { findFirst: async () => state.signup },
  },
}));
vi.mock('@/components/admin/InvitePartnerUserButton', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerPayoutsPanel', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerDetailActions', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerApprovalActions', () => ({ PartnerApprovalActions: () => null }));
vi.mock('@/components/admin/PartnerEnrollmentFunnelStrip', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerSchoolConfigCard', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

import AdminPartnerDetailPage from '@/app/admin/partners/[id]/page';

beforeEach(() => {
  vi.clearAllMocks();
  state.signup = null;
});

describe('partner submitted organization type', () => {
  it.each([['Nonprofit', 'Nonprofit'], [null, 'Not recorded'], ['', 'Not recorded']])('displays %s without guessing an organization type', async (organizationType, expected) => {
    state.findPartner.mockResolvedValue({
      id: 'partner-1',
      name: 'Partner',
      organizationType,
      contactName: 'Ada',
      contactEmail: 'ada@example.org',
      contactPhone: '5125550100',
      status: 'active',
      active: true,
      partnerType: 'referral',
      stripeConnectId: null,
      counselors: [],
      referrals: [],
      programCatalog: [],
      _count: { counselors: 0, referrals: 0 },
    });
    render(await AdminPartnerDetailPage({ params: Promise.resolve({ id: 'partner-1' }) }));
    const details = screen.getByText('Partner details').closest('.wa-kit-card') as HTMLElement;
    expect(within(details).getByText('Organization type').nextElementSibling).toHaveTextContent(expected!);
  });

  it('renders Partner Intake Metadata from the signup request and prompts when contact is blank', async () => {
    state.findPartner.mockResolvedValue({
      id: 'partner-1',
      name: 'Workforce Solutions Capital Area',
      organizationType: null,
      contactName: null,
      contactEmail: 'partner@example.org',
      contactPhone: null,
      status: 'active',
      active: true,
      partnerType: 'referral',
      stripeConnectId: null,
      counselors: [],
      referrals: [],
      programCatalog: [],
      _count: { counselors: 0, referrals: 0 },
    });
    state.signup = {
      orgType: 'Workforce board',
      serveArea: 'Capital Area',
      expectedMonthly: '10–20',
    };
    render(await AdminPartnerDetailPage({ params: Promise.resolve({ id: 'partner-1' }) }));
    expect(screen.getByTestId('partner-contact-incomplete')).toHaveTextContent('Complete Partner Contact Info');
    const intake = screen.getByTestId('partner-intake-metadata');
    expect(within(intake).getByText('Service area').nextElementSibling).toHaveTextContent('Capital Area');
    expect(within(intake).getByText('Expected monthly referrals').nextElementSibling).toHaveTextContent('10–20');
  });
});
