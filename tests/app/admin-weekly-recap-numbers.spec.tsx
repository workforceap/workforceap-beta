import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { matchesWhere } from '../helpers/prismaWhereMatches';

/**
 * Rendered pin for the number audit (2026-09-20, F1 / F2 / F7 / S1 class) on
 * `/admin/weekly-recap`: the four KPI tiles count member accounts only, and
 * the at-risk pool moves on activity the member caused, never on mail the
 * platform sent them.
 *
 * The Prisma fakes evaluate the page's real `where` clauses against a seeded
 * roster (tests/helpers/prismaWhereMatches.ts), so the tiles print whatever
 * population the query admits. Drop the member predicate and the dogfood
 * placement, the staff certification and the staff enrollments come back;
 * drop the activity predicate and two nudged members flip the at-risk delta.
 */

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(async () => ({ id: 'admin-1' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(), isSuperAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, orgId: 'org-1', superAdmin: true })),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
  inheritUserOrg: vi.fn(() => ({})),
  inheritMemberOrg: vi.fn(() => ({})),
  inheritLeaderOrg: vi.fn(() => ({})),
  inheritInvitedByOrg: vi.fn(() => ({})),
}));
vi.mock('@/lib/admin/cohortAnalytics', () => ({
  getWeeklyRecapCohortStats: vi.fn(),
  getWeeklyScoreboardStats: vi.fn(),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: () => <div data-testid="weekly-recap-table" /> }));

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

type SeededUser = {
  id: string;
  email: string;
  organizationId: string;
  deletedAt: Date | null;
  enrolledAt: Date | null;
  profile: { role: string } | null;
  userRoles: Array<{ role: { name: string } }>;
  memberEvents: Array<{ eventName: string; createdAt: Date }>;
};

const member = (id: string, extra: Partial<SeededUser>): SeededUser => ({
  id,
  email: `${id}@example.test`,
  organizationId: 'org-1',
  deletedAt: null,
  enrolledAt: daysAgo(30),
  profile: { role: 'member' },
  userRoles: [{ role: { name: 'member' } }],
  memberEvents: [],
  ...extra,
});
const staff = (id: string, extra: Partial<SeededUser>): SeededUser =>
  member(id, {
    email: `${id}@workforceap.org`,
    profile: { role: 'super_admin' },
    userRoles: [{ role: { name: 'member' } }, { role: { name: 'super_admin' } }],
    ...extra,
  });

const roster: SeededUser[] = [
  // Enrolled this week: two members, the dogfooder, and a QA fixture. (No
  // login on file yet: the page's own rule reads a first-week login as
  // "re-engaged", which is not what this spec pins.)
  member('member-new-1', { enrolledAt: daysAgo(2) }),
  member('member-new-2', { enrolledAt: daysAgo(2) }),
  staff('staff-new', { enrolledAt: daysAgo(2) }),
  member('fixture', { email: 'qa-test@workforceap.org', enrolledAt: daysAgo(2) }),
  // Placed and certified this week: one member, plus the dogfooder above.
  member('member-placed', {}),
  // Only ever received a nudge mail 16 days ago: never active, so not "newly stale".
  member('member-mailed-stale', { enrolledAt: daysAgo(40), memberEvents: [{ eventName: 'inactive_nudge_sent', createdAt: daysAgo(16) }] }),
  // A staff account that went quiet: not a member, so not in the pool at all.
  staff('staff-stale', { enrolledAt: daysAgo(40), memberEvents: [{ eventName: 'login', createdAt: daysAgo(16) }] }),
  // Received this week's recap digest after a silent month: mail is not re-engagement.
  member('member-mailed-recent', { enrolledAt: daysAgo(40), memberEvents: [{ eventName: 'weekly_recap_generated', createdAt: daysAgo(2) }] }),
];
const byId = (id: string) => roster.find((u) => u.id === id)!;

const placements = [
  { placedAt: daysAgo(1), user: byId('member-placed') },
  { placedAt: daysAgo(1), user: byId('staff-new') },
];
const certifications = [
  { status: 'approved', earnedAt: daysAgo(1), user: byId('member-placed') },
  { status: 'approved', earnedAt: daysAgo(1), user: byId('staff-new') },
];

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { count: vi.fn(async ({ where }: { where: unknown }) => roster.filter((u) => matchesWhere(u, where)).length) },
    placementRecord: { count: vi.fn(async ({ where }: { where: unknown }) => placements.filter((p) => matchesWhere(p, where)).length) },
    userCertification: { count: vi.fn(async ({ where }: { where: unknown }) => certifications.filter((c) => matchesWhere(c, where)).length) },
  },
}));

import AdminWeeklyRecapAnalyticsPage from '@/app/admin/weekly-recap/page';

function tile(label: string): { value: string; caption: string } {
  const root = screen.getByText(label).closest('.wa-kit-stat-tile');
  if (!root) throw new Error(`no tile for ${label}`);
  return {
    value: root.querySelector('.wa-kit-stat-value')?.textContent ?? '',
    caption: root.querySelector('.wa-kit-stat-tile__delta')?.textContent ?? '',
  };
}

describe('/admin/weekly-recap counts members only and reads activity the member caused', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders member-only tiles and an at-risk pool that platform mail cannot move', async () => {
    render(await AdminWeeklyRecapAnalyticsPage({}));

    // Four accounts enrolled this week; two are members.
    expect(roster.filter((u) => u.enrolledAt && u.enrolledAt > daysAgo(7))).toHaveLength(4);
    expect(tile('New Students').value).toBe('2');

    // Two placement records and two certifications this week; one of each is the dogfooder's.
    expect(placements).toHaveLength(2);
    expect(tile('Placements').value).toBe('1');
    expect(certifications).toHaveLength(2);
    expect(tile('Certs Earned').value).toBe('1');

    // Nobody newly stale (the mailed member never acted, the quiet account is
    // staff) and nobody re-engaged (a recap digest is not activity): delta 0.
    expect(tile('At-Risk Δ').value).toBe('0');
    expect(tile('At-Risk Δ').caption).toBe('pool shrank or held');
  });
});
