import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Scout 2026-09-22 M9: at 390px the /partner "Referred members" section was
 * a 600px three-column table behind a horizontal drag. The overview now
 * renders the /partner/referred-members card list below the `md` breakpoint
 * and the kit table from `md` up, both fed from the same recent referrals.
 */

const mocks = vi.hoisted(() => ({ referrals: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'partner-user' })) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(async () => ({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'community', organizationId: 'org-1' },
  })),
  isSuperAdmin: async () => false,
}));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findUnique: vi.fn(async () => ({ name: 'Synthetic Community', slug: 'community-slug', referralCode: 'code', status: 'active' })) },
    partnerReferral: { count: vi.fn(async () => 2), findMany: mocks.referrals },
    placementRecord: { count: vi.fn(async () => 1) },
    memberEvent: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  },
}));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: () => null, PartnerAttentionCard: () => null, PartnerAssistantAccordion: () => null,
  PartnerQuickActions: () => null, PartnerReferralFunnel: () => null, PartnerPayoutLedger: () => null,
}));
vi.mock('@/components/onboarding/PortalEntryClient', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/kit', () => ({
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  PageOpener: ({ title }: { title: string }) => <h1>{title}</h1>,
  StatusTag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  DataTable: ({ rows }: { rows: Array<{ id: string; name: string }> }) => (
    <table data-testid="referred-members-table">
      <tbody>{rows.map((row) => <tr key={row.id}><td>{row.name}</td></tr>)}</tbody>
    </table>
  ),
  QueueRow: () => null,
}));
vi.mock('@/components/partner/PartnerReferredMembersMobile', () => ({
  default: ({ rows }: { rows: Array<{ id: string; fullName: string | null; stageLabel: string; placementVerified?: boolean | null }> }) => (
    <ul data-testid="referred-members-cards">
      {rows.map((row) => (
        <li key={row.id}>{row.fullName} · {row.stageLabel}{row.placementVerified ? ' · Verified' : ''}</li>
      ))}
    </ul>
  ),
}));

import PartnerDashboardPage from '@/app/(portal)/partner/page';
import { prisma } from '@/lib/db/prisma';

const REFERRED_AT = new Date('2026-09-10T15:00:00Z');

beforeEach(() => {
  mocks.referrals.mockResolvedValue([
    { id: 'ref-1', referredAt: REFERRED_AT, member: { id: 'm-placed', fullName: 'Keisha Washington', enrolledAt: REFERRED_AT, enrolledProgram: 'it-support', placementRecord: { startDateVerified: true } } },
    { id: 'ref-2', referredAt: REFERRED_AT, member: { id: 'm-enrolled', fullName: 'Jordan Williams', enrolledAt: REFERRED_AT, enrolledProgram: null, placementRecord: null } },
    { id: 'ref-3', referredAt: REFERRED_AT, member: { id: 'm-referred', fullName: 'Angela Davis', enrolledAt: null, enrolledProgram: null, placementRecord: null } },
    { id: 'ref-4', referredAt: REFERRED_AT, member: { id: 'm-pending', fullName: 'Sam Rivera', enrolledAt: REFERRED_AT, enrolledProgram: 'it-support', placementRecord: { startDateVerified: false } } },
  ]);
});

describe('/partner referred members at phone width', () => {
  it('renders the card list below md and the table from md up, with the same members', async () => {
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));

    const cards = screen.getByTestId('referred-members-cards');
    const table = screen.getByTestId('referred-members-table');
    // Same responsive pair the other portals use (`md` = 768px): the card list
    // is the only one shown on a phone, the table the only one on a desktop.
    expect(cards.parentElement).toHaveClass('wa-block', 'md:wa-hidden');
    expect(table.parentElement).toHaveClass('wa-hidden', 'md:wa-block');
    expect(cards.parentElement).not.toHaveClass('wa-hidden');
    expect(table.parentElement).not.toHaveClass('wa-block');

    const cardNames = within(cards).getAllByRole('listitem').map((li) => li.textContent?.split(' · ')[0]);
    const tableNames = within(table).getAllByRole('cell').map((td) => td.textContent);
    expect(cardNames).toEqual(['Keisha Washington', 'Jordan Williams', 'Angela Davis', 'Sam Rivera']);
    expect(tableNames).toEqual(cardNames);
  });

  it('labels each card with the coarse referred → enrolled → placed stage the lean overview knows', async () => {
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const items = within(screen.getByTestId('referred-members-cards')).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Keisha Washington · Placed · Verified',
      'Jordan Williams · Enrolled',
      'Angela Davis · Applied',
      'Sam Rivera · Enrolled',
    ]);
  });

  it('counts only verified placements in the default overview', async () => {
    await PartnerDashboardPage({ searchParams: Promise.resolve({}) });
    expect(vi.mocked(prisma.placementRecord.count).mock.calls[0][0]?.where).toMatchObject({
      startDateVerified: true,
      user: { organizationId: 'org-1' },
    });
  });
});
