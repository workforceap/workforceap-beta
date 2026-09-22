process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The partner guided tour's page steps (`tour-referral-link`, `tour-payouts`)
 * must be on the real default overview (the v2 kit), not only on `?ui=legacy`.
 * Same fixture as tests/app/partner-dashboard-dates.spec.tsx with the real kit.
 */
const mocks = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), partner: vi.fn(), count: vi.fn(), referrals: vi.fn(), events: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
// The phone-width card list is a client component with its own translations; the desktop kit table is what these specs read.
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: mocks.context, isSuperAdmin: async () => false }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partner: { findUnique: mocks.partner },
  partnerReferral: { count: mocks.count, findMany: mocks.referrals },
  placementRecord: { count: mocks.count },
  memberEvent: { findMany: mocks.events },
} }));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

function anchors(html: string, target: string): number {
  return (html.match(new RegExp(`data-tour="${target}"`, 'g')) ?? []).length;
}

function primePartner(partnerType: 'referral' | 'community') {
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.context.mockResolvedValue({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType, organizationId: 'org-1' },
  });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'community-code', status: 'active' });
  mocks.count.mockResolvedValue(0);
  mocks.referrals.mockResolvedValue([]);
  mocks.events.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
});
afterEach(() => vi.unstubAllEnvs());

describe('partner overview carries the guided-tour page anchors', () => {
  it('a referral partner sees one tour-referral-link anchor around the share panel and one tour-payouts anchor', async () => {
    primePartner('referral');
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={pickClientMessageSlice(en, 'portal')}>{await PartnerDashboardPage({ searchParams: Promise.resolve({}) })}</NextIntlClientProvider>);
    expect(anchors(html, 'tour-referral-link')).toBe(1);
    expect(html).toMatch(/data-tour="tour-referral-link"[^>]*>[\s\S]{0,600}?aria-label="Share your referral link"/);
    expect(html).toContain('community-code');
    expect(anchors(html, 'tour-payouts')).toBe(1);
    expect(html).toMatch(/data-tour="tour-payouts"[^>]*>[\s\S]{0,600}?Payout history/);
    for (const shellAnchor of ['tour-members', 'tour-attention', 'tour-exports', 'tour-messages', 'tour-help']) {
      expect(anchors(html, shellAnchor), shellAnchor).toBe(0);
    }
  });

  it('a community partner has no payouts surface, so the payouts step has nothing to anchor to and is skipped', async () => {
    primePartner('community');
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={pickClientMessageSlice(en, 'portal')}>{await PartnerDashboardPage({ searchParams: Promise.resolve({}) })}</NextIntlClientProvider>);
    expect(anchors(html, 'tour-referral-link')).toBe(1);
    expect(anchors(html, 'tour-payouts')).toBe(0);
    expect(html).not.toContain('Payout history');
  });
});
