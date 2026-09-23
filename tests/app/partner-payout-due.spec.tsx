import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), referrals: vi.fn(), events: vi.fn(), placements: vi.fn(), unpaid: vi.fn() }));
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
  // findMany: the Payout due tile's verified-unpaid placements (WAP-213).
  placementRecord: { count: mocks.count, findMany: mocks.placements },
  memberEvent: { findMany: mocks.events },
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
  QueueRow: ({ meta }: { meta?: string }) => <div data-testid="queue-row">{meta}</div>,
}));
vi.mock('@/lib/partner/unpaidVerifiedPlacements', () => ({ countUnpaidVerifiedPlacements: mocks.unpaid }));
// The phone-width card list is a client component with its own translations; the desktop kit table is what these specs read.
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

/**
 * WAP-213: "Payout due" is what POST /api/partner/payout would pay now —
 * verified, unpaid placements × the rate — not every placement ever × $500.
 */
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.context.mockResolvedValue({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'referral', organizationId: 'org-1' },
  });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'community-code', status: 'active' });
  // 9 placements recorded in total — the old tile multiplied this by the rate.
  mocks.count.mockResolvedValue(9);
  mocks.referrals.mockResolvedValue([]);
  mocks.events.mockResolvedValue([]);
  mocks.placements.mockResolvedValue([]);
  mocks.unpaid.mockResolvedValue(2);
});
afterEach(() => vi.unstubAllEnvs());

async function payoutTile() {
  const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
  const match = html.match(/<div data-kpi="Payout due">(.*?)<\/div>/);
  if (!match) throw new Error('no Payout due tile');
  return match[1];
}

describe('partner overview Payout due (WAP-213)', () => {
  it('multiplies verified unpaid placements, not every placement, by the configured rate', async () => {
    vi.stubEnv('PARTNER_PLACEMENT_PAYOUT_USD', '300');
    const tile = await payoutTile();
    expect(tile).toContain('$600');
    expect(tile).not.toContain('$2,700');
    expect(tile).toContain('2 verified placements not yet paid');
    expect(tile).not.toContain('estimated rate');
    expect(mocks.unpaid).toHaveBeenCalledWith('partner-1', 'org-1');
  });

  it('says the rate is estimated when it is the built-in fallback', async () => {
    vi.stubEnv('PARTNER_PLACEMENT_PAYOUT_USD', '');
    vi.stubEnv('NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD', '');
    const tile = await payoutTile();
    expect(tile).toContain('$1,000');
    expect(tile).toContain('estimated rate');
  });
});
