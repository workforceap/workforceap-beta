process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), referrals: vi.fn(), events: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: mocks.context, isSuperAdmin: async () => false }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partner: { findUnique: mocks.partner },
  partnerReferral: { count: mocks.count, findMany: mocks.referrals },
  placementRecord: { count: mocks.count },
  memberEvent: { findMany: mocks.events },
} }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: () => null, PartnerAttentionCard: () => null, PartnerAssistantAccordion: () => null,
  PartnerQuickActions: () => null, PartnerReferralFunnel: () => null,
  PartnerPayoutLedger: ({ rows }: { rows: Array<{ id: string; period: string }> }) => (
    <ul data-testid="ledger">{rows.map((r) => <li key={r.id}>{r.period}</li>)}</ul>
  ),
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/kit', () => ({
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  DataTable: ({ rows }: { rows: Array<Record<string, unknown>> }) => (
    <ul>{rows.map((r, i) => <li key={i}>{String(r.referred ?? '')}</li>)}</ul>
  ),
  QueueRow: ({ meta }: { meta?: string }) => <div data-testid="queue-row">{meta}</div>,
}));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.context.mockResolvedValue({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'referral', organizationId: 'org-1' },
  });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'community-code', status: 'active' });
  mocks.count.mockResolvedValue(1);
  mocks.referrals.mockResolvedValue([
    { id: 'ref-1', referredAt: INSTANT, member: { id: 'member-1', fullName: 'Fixture Member', enrolledAt: null } },
  ]);
  // Readers query the canonical name plus historical aliases (WAP-39).
  const reads = (args: { where?: { eventName?: string | { in?: string[] } } }, name: string) => {
    const filter = args?.where?.eventName;
    return typeof filter === 'string' ? filter === name : Boolean(filter?.in?.includes(name));
  };
  mocks.events.mockImplementation(async (args: { where?: { eventName?: string | { in?: string[] } } }) =>
    reads(args, 'placement_confirmation_submitted')
      ? [{ id: 'ev-1', userId: 'member-1', metadata: { label: 'Fixture placement' }, createdAt: INSTANT }]
      : reads(args, 'partner_payout_sent')
        ? [{ id: 'pay-1', createdAt: INSTANT, metadata: { partnerId: 'partner-1', amountCents: 50000 }, user: { fullName: 'Fixture Member' } }]
        : []);
});
afterEach(() => vi.unstubAllEnvs());

describe('PartnerDashboardPage kit dates', () => {
  it('renders referral, pending-review and payout dates on the Central calendar day', async () => {
    const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Sep 18, 2026');
    expect(html).not.toContain('9/19/2026');
    expect(html).not.toContain('Sep 19');
    expect(html).toContain('Fixture M. · Sep 18, 2026');
  });
});
