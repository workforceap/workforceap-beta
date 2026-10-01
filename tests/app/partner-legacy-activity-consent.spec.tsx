import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ eventFindMany: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'partner-user' }) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: async () => ({ partnerId: 'partner-1', partner: { name: 'Fixture Partner', slug: 'fixture', partnerType: 'community', organizationId: 'org-1' } }),
  isSuperAdmin: async () => false,
}));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/tours/getTourOffer', () => ({ getTourOffer: async () => null }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  partner: { findUnique: async () => ({ name: 'Fixture Partner', slug: 'fixture', referralCode: 'fixture', status: 'active' }) },
  referralConversion: { count: async () => 0 },
  application: { findMany: async () => [] },
  memberEvent: { findMany: h.eventFindMany },
} }));
vi.mock('@/lib/partner/referralBundle', () => ({
  pendingPlacementWindowStart: () => new Date('2026-06-25T00:00:00Z'),
  loadPartnerReferralBundle: async () => ({
    members: [{ id: 'member-1', fullName: 'Fixture Member', enrolledAt: null, placementRecord: null }],
    pipelineMembers: [],
    pendingPlacements: [],
  }),
  toPartnerMembersListRows: () => [],
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PartnerMembersList', () => ({ default: () => null }));
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({ default: () => null }));
vi.mock('@/components/partner/PartnerReferralResourcesSection', () => ({ default: () => null }));
vi.mock('@/components/partner/PartnerReferralShare', () => ({ default: () => null }));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: () => null, PageOpener: () => null, DataTable: () => null,
  QueueRow: () => null, StatusTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

beforeEach(() => {
  vi.clearAllMocks();
  h.eventFindMany.mockResolvedValue([
    { id: 'safe', eventName: 'program_enrolled', createdAt: new Date('2026-09-20T12:00:00Z'), user: { fullName: 'Fixture Member' }, metadata: { label: 'SECRET_STAFF_NOTE' } },
    { id: 'private', eventName: 'counselor_followup_needed', createdAt: new Date('2026-09-19T12:00:00Z'), user: { fullName: 'Fixture Member' }, metadata: { label: 'SECRET_STAFF_NOTE' } },
  ]);
});

describe('legacy partner overview activity', () => {
  it('filters to milestones and renders fixed labels without raw events or metadata', async () => {
    const html = renderToStaticMarkup(await PartnerDashboardPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));
    const query = h.eventFindMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ userId: { in: ['member-1'] } });
    expect(query.where.eventName.in).toContain('program_enrolled');
    expect(query.where.eventName.in).not.toContain('counselor_followup_needed');
    expect(query.select).not.toHaveProperty('metadata');
    expect(html).toContain('Enrolled in a program');
    expect(html).not.toContain('program_enrolled');
    expect(html).not.toContain('counselor_followup_needed');
    expect(html).not.toContain('SECRET_STAFF_NOTE');
  });
});
