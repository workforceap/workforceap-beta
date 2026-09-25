import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), referrals: vi.fn(), events: vi.fn(), eventCount: vi.fn(), placements: vi.fn(), unpaid: vi.fn(), attention: vi.fn() }));
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
  partnerReferral: { count: mocks.count, findMany: mocks.referrals },
  placementRecord: { count: mocks.count, findMany: mocks.placements },
  memberEvent: { findMany: mocks.events, count: mocks.eventCount },
} }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: ({ items }: { items: Array<{ label: string; value: string | number; subtitle?: string }> }) => (
    <dl>{items.map((i) => <div key={i.label} data-kpi={i.label}><dt>{i.label}</dt><dd>{String(i.value)}</dd><dd>{i.subtitle}</dd></div>)}</dl>
  ), PartnerAttentionCard: ({ title, body, href }: { title: string; body: string; href: string }) => (
    <a data-testid="attention-card" href={href}>{title} | {body}</a>
  ), PartnerAssistantAccordion: () => null,
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
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: mocks.attention }));
vi.mock('@/lib/partner/unpaidVerifiedPlacements', () => ({ countUnpaidVerifiedPlacements: mocks.unpaid }));
// The phone-width card list is a client component with its own translations; the desktop kit table is what these specs read.
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

/**
 * WAP-215: the overview's attention card opens the Attention queue and shows
 * its count; a failed count reads "Couldn't load", never zero.
 */
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
  mocks.events.mockResolvedValue([]);
  mocks.eventCount.mockResolvedValue(0);
  mocks.unpaid.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

async function card() {
  const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
  const match = html.match(/<a data-testid="attention-card" href="([^"]*)">(.*?)<\/a>/);
  if (!match) throw new Error('no attention card');
  return { href: match[1], text: match[2] };
}

describe('partner overview attention card (WAP-215)', () => {
  it('opens the Attention queue and carries its count', async () => {
    mocks.attention.mockResolvedValue(4);
    const { href, text } = await card();
    expect(href).toBe('/partner/attention');
    expect(text).toContain('nextActionAttention({&quot;count&quot;:4})');
    expect(mocks.attention).toHaveBeenCalledWith('partner-1', 'org-1');
  });

  it('says it could not load, not zero, when the count fails', async () => {
    mocks.attention.mockRejectedValue(new Error('db down'));
    const { href, text } = await card();
    expect(href).toBe('/partner/attention');
    expect(text).toContain('nextActionAttentionUnavailable');
    expect(text).not.toContain('&quot;count&quot;:0');
  });
});
