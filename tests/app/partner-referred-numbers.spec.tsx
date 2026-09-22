import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { matchesWhere } from '../helpers/prismaWhereMatches';

/**
 * Rendered pin for the scout defect D1 (2026-09-22) on `/partner`: the
 * "Members referred" KPI and the "Referred members" table draw on the same
 * member-only population (lib/admin/memberOnlyWhere.ts), so the tile count
 * equals the number of table rows, and a staff-by-profile account or a
 * seeded fixture (`referral-member-*`) that the tile excludes never gets a
 * row whose detail page then renders notFound.
 *
 * The Prisma fakes evaluate the page's real `where` clauses against one
 * seeded referral roster (tests/helpers/prismaWhereMatches.ts), so the tile
 * and the table each print whatever population their own query admits.
 * Dropping the member predicate from the table query puts the staff row and
 * the fixture row back on screen while the tile still says 2.
 */

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
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
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({
  PartnerKpiGrid: ({ items }: { items: Array<{ label: string; value: string | number }> }) => (
    <dl>
      {items.map((item) => (
        <div key={item.label} data-testid="kpi">
          <dt>{item.label}</dt>
          <dd data-testid={`kpi-${item.label}`}>{String(item.value)}</dd>
        </div>
      ))}
    </dl>
  ),
  PartnerAttentionCard: () => null,
  PartnerAssistantAccordion: () => null,
  PartnerQuickActions: () => null,
  PartnerReferralFunnel: () => null,
  PartnerPayoutLedger: () => null,
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
    <ul data-testid="referred-members">
      {rows.map((row) => (
        <li key={row.id} data-testid="referred-member-row">
          {row.name}
        </li>
      ))}
    </ul>
  ),
  QueueRow: ({ meta }: { meta?: string }) => <div>{meta}</div>,
}));

type SeededMember = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  deletedAt: Date | null;
  enrolledAt: Date | null;
  profile: { role: string } | null;
  userRoles: Array<{ role: { name: string } }>;
};
type SeededReferral = {
  id: string;
  partnerId: string;
  referredAt: Date;
  partner: { organizationId: string; active: boolean };
  member: SeededMember;
};

const REFERRED_AT = new Date('2026-09-10T15:00:00Z');

const member = (id: string, fullName: string, extra: Partial<SeededMember> = {}): SeededMember => ({
  id,
  fullName,
  email: `${id}@gmail.test`,
  organizationId: 'org-1',
  deletedAt: null,
  enrolledAt: null,
  profile: { role: 'member' },
  userRoles: [{ role: { name: 'member' } }],
  ...extra,
});
const referral = (member: SeededMember): SeededReferral => ({
  id: `ref-${member.id}`,
  partnerId: 'partner-1',
  referredAt: REFERRED_AT,
  partner: { organizationId: 'org-1', active: true },
  member,
});

const roster: SeededReferral[] = [
  // Two members the partner referred: one backfilled, one profile-only.
  referral(member('keisha', 'Keisha Washington')),
  referral(member('jordan', 'Jordan Williams', { userRoles: [], enrolledAt: REFERRED_AT })),
  // A counselor by profile holding the baseline `member` row every account gets.
  referral(
    member('counselor', 'Staff Counselor', {
      email: 'counselor@workforceap.org',
      profile: { role: 'counselor' },
      userRoles: [{ role: { name: 'member' } }, { role: { name: 'counselor' } }],
    }),
  ),
  // A seeded fixture account (FIXTURE_LOCAL_PART_PREFIXES) whose detail page renders notFound.
  referral(member('fixture-a', 'Referral Member A', { email: 'referral-member-a@workforceap.org' })),
];

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: {
      findUnique: vi.fn(async () => ({
        name: 'Synthetic Community',
        slug: 'community-slug',
        referralCode: 'community-code',
        status: 'active',
      })),
    },
    partnerReferral: {
      count: vi.fn(async ({ where }: { where: unknown }) => roster.filter((r) => matchesWhere(r, where)).length),
      findMany: vi.fn(async ({ where }: { where: unknown }) =>
        roster
          .filter((r) => matchesWhere(r, where))
          .map((r) => ({
            id: r.id,
            referredAt: r.referredAt,
            member: { id: r.member.id, fullName: r.member.fullName, enrolledAt: r.member.enrolledAt },
          })),
      ),
    },
    placementRecord: { count: vi.fn(async () => 0) },
    memberEvent: { findMany: vi.fn(async () => []) },
  },
}));

import PartnerDashboardPage from '@/app/(portal)/partner/page';

describe('/partner "Members referred" tile and "Referred members" table agree', () => {
  beforeEach(() => {
    cleanup();
  });

  it('lists exactly the members the tile counts, so staff and fixture referrals never get a row', async () => {
    render(await PartnerDashboardPage({ searchParams: Promise.resolve({}) }));

    // Four referral rows on file; two of them point at member accounts.
    expect(roster).toHaveLength(4);
    const tile = Number(screen.getByTestId('kpi-membersReferred').textContent);
    const rows = screen.getAllByTestId('referred-member-row').map((li) => li.textContent);

    expect(tile).toBe(2);
    expect(rows).toHaveLength(tile);
    expect(rows).toEqual(['Keisha Washington', 'Jordan Williams']);
    expect(screen.queryByText('Staff Counselor')).toBeNull();
    expect(screen.queryByText('Referral Member A')).toBeNull();
  });
});
