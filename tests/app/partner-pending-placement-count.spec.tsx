import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), pendingCount: vi.fn(), referrals: vi.fn(), events: vi.fn(), placements: vi.fn(), unpaid: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
// Keys with their values, so the heading's count is visible in the markup.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: mocks.context, isSuperAdmin: async () => false }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partner: { findUnique: mocks.partner },
  partnerReferral: {
    count: vi.fn((args: { where?: { member?: { memberEvents?: unknown } } }) =>
      args.where?.member?.memberEvents ? mocks.pendingCount(args) : mocks.count(args)),
    findMany: mocks.referrals,
  },
  placementRecord: { count: mocks.count, findMany: mocks.placements },
  memberEvent: { findMany: mocks.events, count: vi.fn() },
} }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: ({ items }: { items: Array<{ label: string; value: string | number; subtitle?: string }> }) => (
    <dl>{items.map((i) => <div key={i.label} data-kpi={i.label}><dt>{i.label}</dt><dd>{String(i.value)}</dd><dd>{i.subtitle}</dd></div>)}</dl>
  ), PartnerAttentionCard: () => null, PartnerAssistantAccordion: () => null,
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
  PageOpener: ({ title }: { title: string }) => <h1>{title}</h1>,
  DataTable: ({ rows }: { rows: Array<Record<string, unknown>> }) => (
    <ul>{rows.map((r, i) => <li key={i}>{String(r.referred ?? '')}</li>)}</ul>
  ),
  QueueRow: ({ title, meta }: { title?: string; meta?: string }) => <div data-testid="queue-row">{title} · {meta}</div>,
}));
vi.mock('@/lib/partner/unpaidVerifiedPlacements', () => ({ countUnpaidVerifiedPlacements: mocks.unpaid }));
// The phone-width card list is a client component with its own translations; the desktop kit table is what these specs read.
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

/**
 * WAP-214: the overview lists the latest 8 pending placement confirmations,
 * but its heading counts all of them, with the same 90-day window and member
 * population as /partner/outcomes.
 */
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.context.mockResolvedValue({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'community', organizationId: 'org-1' },
  });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'community-code', status: 'active' });
  mocks.count.mockResolvedValue(0);
  mocks.referrals.mockResolvedValue([]);
  mocks.placements.mockResolvedValue([]);
  mocks.unpaid.mockResolvedValue(0);
  const pending = Array.from({ length: 8 }, (_, i) => ({
    id: `ev-${i}`,
    userId: `member-${i}`,
    metadata: { label: 'SECRET_STAFF_NOTE', employerName: `Employer ${i}`, jobTitle: 'Analyst' },
    createdAt: new Date('2026-09-20T12:00:00Z'),
  }));
  mocks.events.mockImplementation(async (args: { take?: number }) => (args.take === 8 ? pending : []));
  mocks.pendingCount.mockResolvedValue(23);
});
afterEach(() => vi.unstubAllEnvs());

describe('partner overview pending placement count (WAP-214)', () => {
  it('heads the 8 listed members with the full unique-member count', async () => {
    const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('nextActionReviewPlacements({&quot;count&quot;:23})');
    expect(html).not.toContain('nextActionReviewPlacements({&quot;count&quot;:8})');
  });

  it('counts and lists the same pending members in this org and 90-day window', async () => {
    const before = Date.now();
    await PartnerDashboardPage({ searchParams: Promise.resolve({}) });
    const where = mocks.pendingCount.mock.calls[0][0].where;
    const listCall = mocks.events.mock.calls.find(([args]) => args.take === 8);
    const pendingMemberFilter = { ...where.member };
    delete pendingMemberFilter.memberEvents;
    expect(listCall?.[0].where.user).toMatchObject(pendingMemberFilter);
    expect(listCall?.[0].where.eventName).toEqual(where.member.memberEvents.some.eventName);
    expect(listCall?.[0].where.createdAt).toEqual(where.member.memberEvents.some.createdAt);
    expect(listCall?.[0].distinct).toEqual(['userId']);

    const days = (before - where.member.memberEvents.some.createdAt.gte.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
    expect(where.member).toMatchObject({
      deletedAt: null,
      organizationId: 'org-1',
      partnerReferrals: { some: { partnerId: 'partner-1', partner: { organizationId: 'org-1' } } },
      OR: [
        { placementRecord: { is: null } },
        { placementRecord: { is: { startDateVerified: false } } },
      ],
    });
  });

  it('uses fixed pending wording and does not select or render event metadata', async () => {
    const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const listCall = mocks.events.mock.calls.find(([args]) => args.take === 8);
    expect(listCall?.[0].select).not.toHaveProperty('metadata');
    expect(html).toContain('pendingVerification');
    expect(html).not.toContain('SECRET_STAFF_NOTE');
    expect(html).not.toContain('Employer 0');
  });
});
