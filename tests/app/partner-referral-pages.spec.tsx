import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), list: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: mocks.context, isSuperAdmin: async () => false }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partner: { findUnique: mocks.partner },
  partnerReferral: { count: mocks.count, findMany: mocks.list },
  placementRecord: { count: mocks.count },
  memberEvent: { findMany: mocks.list, count: mocks.count },
  application: { count: mocks.count },
  user: { count: mocks.count },
} }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: () => null, PartnerAttentionCard: () => null, PartnerAssistantAccordion: () => null,
  PartnerQuickActions: () => null, PartnerReferralFunnel: () => null, PartnerPayoutLedger: () => null,
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/kit', () => ({
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  PageOpener: ({ title }: { title: string }) => <h1>{title}</h1>,
  DataTable: () => null, QueueRow: () => null,
}));
// The phone-width card list is a client component with its own translations; the desktop kit table is what these specs read.
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));

import PartnerDashboardPage from '@/app/(portal)/partner/page';
import PartnerGuidePage from '@/app/(portal)/partner/guide/page';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.context.mockResolvedValue({
    partnerId: 'partner-1', partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'community', organizationId: 'org-1' },
  });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'community-code', status: 'active' });
  mocks.count.mockResolvedValue(0);
  mocks.list.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('partner default referral journey', () => {
  it('renders the attributed link and copy action on the default overview without legacy mode', async () => {
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const share = screen.getByRole('region', { name: 'Share your referral link' });
    fireEvent.click(within(share).getByText('View link and referral code'));
    expect(within(share).getByRole('link')).toHaveAttribute('href', 'https://training.example.invalid/apply?ref=community-code');
    expect(within(share).getByRole('button', { name: 'Copy referral link' })).toBeVisible();
  });

  it('keeps the guide application CTA and share tools attributed', async () => {
    render(await PartnerGuidePage());
    expect(screen.getByRole('link', { name: 'Open your attributed application link' })).toHaveAttribute('href', 'https://training.example.invalid/apply?ref=community-code');
    expect(screen.getByRole('button', { name: 'Copy email text' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy caption' })).toBeVisible();
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href') === '/apply')).toHaveLength(0);
  });

  it('falls back to the linked partner slug when the optional code is empty', async () => {
    mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: null, referralCode: ' ', status: 'active' });
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const share = screen.getByRole('region', { name: 'Share your referral link' });
    fireEvent.click(within(share).getByText('View link and referral code'));
    expect(within(share).getByRole('link')).toHaveAttribute('href', 'https://training.example.invalid/apply?ref=community-slug');
  });
});
