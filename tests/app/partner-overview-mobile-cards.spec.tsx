import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartnerMemberRow } from '@/components/partner/PartnerReferredMembersMobile';

/**
 * Scout 2026-09-22 M9: at 390px the /partner "Referred members" section was
 * a 600px three-column table behind a horizontal drag. The overview now
 * renders the /partner/referred-members card list below the `md` breakpoint
 * and the kit table from `md` up, both fed from the same recent referrals.
 */

const mocks = vi.hoisted(() => ({ referrals: vi.fn(), user: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(async () => ({
    partnerId: 'partner-1',
    partner: { name: 'Synthetic Community', slug: 'community-slug', partnerType: 'community', organizationId: 'org-1' },
  })),
  isSuperAdmin: async () => false,
}));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: async () => '/dashboard' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: async () => 0 }));
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
  Avatar: () => null,
  StageTrack: () => null,
}));
vi.mock('@/components/partner/PartnerReferredMembersMobile', async (importOriginal) => {
  const { default: MemberCards } = await importOriginal<typeof import('@/components/partner/PartnerReferredMembersMobile')>();
  return {
    default: ({ rows }: { rows: PartnerMemberRow[] }) => (
      <div data-testid="referred-members-cards"><MemberCards rows={rows} /></div>
    ),
  };
});

import PartnerDashboardPage from '@/app/(portal)/partner/page';
import { prisma } from '@/lib/db/prisma';

const REFERRED_AT = new Date('2026-09-10T15:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 'partner-user' });
  mocks.referrals.mockResolvedValue([
    { id: 'ref-1', referredAt: REFERRED_AT, member: { id: 'm-placed', fullName: 'Keisha Washington', enrolledAt: REFERRED_AT, enrolledProgram: 'it-support', courseEnrollments: [], placementRecord: { startDateVerified: true } } },
    { id: 'ref-2', referredAt: REFERRED_AT, member: { id: 'm-enrolled', fullName: 'Jordan Williams', enrolledAt: REFERRED_AT, enrolledProgram: null, courseEnrollments: [], placementRecord: null } },
    { id: 'ref-3', referredAt: REFERRED_AT, member: { id: 'm-referred', fullName: 'Angela Davis', enrolledAt: null, enrolledProgram: null, courseEnrollments: [], placementRecord: null } },
    { id: 'ref-4', referredAt: REFERRED_AT, member: { id: 'm-pending', fullName: 'Sam Rivera', enrolledAt: REFERRED_AT, enrolledProgram: 'it-support', courseEnrollments: [], placementRecord: { startDateVerified: false } } },
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

    const tableNames = within(table).getAllByRole('cell').map((td) => td.textContent);
    expect(tableNames).toEqual(['Keisha Washington', 'Jordan Williams', 'Angela Davis', 'Sam Rivera']);
    expect(within(cards).getAllByRole('link')).toHaveLength(tableNames.length);
    for (const name of tableNames) {
      expect(within(cards).getByRole('link', { name: new RegExp(name!) })).toBeVisible();
    }
  });

  it('preserves enrollment and verified/pending placement badges on the mounted cards', async () => {
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const cards = within(screen.getByTestId('referred-members-cards'));
    expect(within(cards.getByRole('link', { name: /Keisha Washington/ })).getByText('Placed – verified')).toBeVisible();
    expect(within(cards.getByRole('link', { name: /Jordan Williams/ })).getByText('Enrolled')).toBeVisible();
    expect(within(cards.getByRole('link', { name: /Angela Davis/ })).getByText('Referred')).toBeVisible();
    expect(within(cards.getByRole('link', { name: /Sam Rivera/ })).getByText('Placement reported, pending verification')).toBeVisible();
  });

  it('counts only verified placements in the default overview', async () => {
    await PartnerDashboardPage({ searchParams: Promise.resolve({}) });
    expect(vi.mocked(prisma.placementRecord.count).mock.calls[0][0]?.where).toMatchObject({
      startDateVerified: true,
      user: { organizationId: 'org-1' },
    });
  });
});

describe('/partner overview canonical enrollment display', () => {
  const PRIMARY_PROGRAM = 'it-support-professional-certificate-ibm';
  const LEGACY_PROGRAM = 'core-construction-training-certificate';
  const PRIMARY_TITLE = 'IT Support Professional Certificate (IBM)';
  const LEGACY_TITLE = 'Core Construction';

  function referral(enrolledProgram: string | null, courseEnrollments: Array<{
    programSlug: string; curriculumVersion: string; isPrimary: boolean;
  }>) {
    return [{
      id: 'ref-synthetic', referredAt: REFERRED_AT,
      member: {
        id: 'member-synthetic', fullName: 'Synthetic Enrollee', enrolledAt: REFERRED_AT,
        enrolledProgram, courseEnrollments, placementRecord: null,
      },
    }];
  }

  it.each([null, LEGACY_PROGRAM])('shows the primary program when the legacy pointer is %s', async (legacy) => {
    mocks.referrals.mockResolvedValue(referral(legacy, [
      { programSlug: LEGACY_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: false },
      { programSlug: PRIMARY_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true },
    ]));
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const card = screen.getByRole('link', { name: /Synthetic Enrollee/ });
    expect(card).toHaveTextContent(PRIMARY_TITLE);
    expect(card).not.toHaveTextContent(LEGACY_TITLE);
    expect(within(card).getByText('Enrolled')).toBeVisible();
    expect(card).toHaveAttribute('href', '/partner/referred-members/member-synthetic');
  });

  it('keeps the legacy-only program label for an unmigrated member', async () => {
    mocks.referrals.mockResolvedValue(referral(LEGACY_PROGRAM, []));
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const card = screen.getByRole('link', { name: /Synthetic Enrollee/ });
    expect(card).toHaveTextContent(LEGACY_TITLE);
    expect(within(card).getByText('Enrolled')).toBeVisible();
  });

  it('leaves an ambiguous assignment unnamed without changing its enrollment stage', async () => {
    mocks.referrals.mockResolvedValue(referral(LEGACY_PROGRAM, [
      { programSlug: PRIMARY_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: false },
    ]));
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));
    const card = screen.getByRole('link', { name: /Synthetic Enrollee/ });
    expect(within(card).getByText(/^— · Referred/)).toBeVisible();
    expect(card).not.toHaveTextContent(LEGACY_TITLE);
    expect(within(card).getByText('Enrolled')).toBeVisible();
  });

  it('loads enrollment labels only through this partner’s visible tenant members', async () => {
    await PartnerDashboardPage({ searchParams: Promise.resolve({}) });
    expect(mocks.referrals.mock.calls[0][0]).toMatchObject({
      where: {
        partnerId: 'partner-1', partner: { organizationId: 'org-1' },
        member: { organizationId: 'org-1', deletedAt: null },
      },
      select: {
        member: {
          select: {
            courseEnrollments: {
              where: { organizationId: 'org-1' },
              select: { programSlug: true, curriculumVersion: true, isPrimary: true },
            },
          },
        },
      },
    });
  });

  it('redirects an anonymous visitor before reading partner or member data', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(PartnerDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/login?redirectTo=/partner');
    expect(vi.mocked(prisma.partner.findUnique)).not.toHaveBeenCalled();
    expect(mocks.referrals).not.toHaveBeenCalled();
  });
});
