import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_OR_DOGFOOD_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';
import { MEMBER_DEFINITION_ROSTER, MEMBER_OR_DOGFOOD_IDS, admittedIds, matchesWhere } from '@/tests/helpers/prismaWhereMatches';

/**
 * /admin/coursera?ui=legacy lists the accounts an operator can map a Coursera
 * learner onto. That population is the one member definition plus dogfood
 * admins (lib/admin/memberOnlyWhere.ts), not a hand-rolled `profile.role`
 * list, so every member the counts report can be mapped (#2457 follow-up).
 */
const mocks = vi.hoisted(() => ({ userFindMany: vi.fn(), getUser: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/tenant/adminPageScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return {
    resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-a', superAdmin: false }),
    withAdminPageScope: async (_scope: unknown, load: (db: unknown) => unknown) => load(prisma),
    inheritUserOrg: () => ({}),
    inheritMemberOrg: () => ({}),
    inheritLeaderOrg: () => ({}),
    inheritInvitedByOrg: () => ({}),
  };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: mocks.userFindMany },
  courseProgress: { findMany: async () => [] },
  $queryRaw: async () => [],
} }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-a' }));
vi.mock('@/lib/coursera/programCourseList', () => ({ loadValidatedProgramCatalog: async () => [] }));
vi.mock('@/lib/admin/courseraOps', () => ({
  getCourseraSyncStatus: async () => ({ lastXapiReceivedAt: null, distinctMembersWithCourseProgress: 0, attentionStatementCount: 0 }),
  listXapiStatementsNeedingAttention: async () => [],
  loadMemberProgressAuditByEmail: async () => null,
}));
vi.mock('@/lib/xapi/mappings', () => ({
  getCourseraSkillsetProgressSummary: async () => ({ totalRows: 0, latestSyncedAt: null, topMembers: [] }),
  getCourseraUnmatchedActorAlertStats: async () => ({ distinctUnmatchedActorEmails: 0, newAlertRowsLast7Days: 0, recentFirstSeen: [] }),
  listCourseraIdentityMappings: async () => [],
}));
vi.mock('@/lib/coursera/progressQueries', () => ({
  countHiddenTestAccountUnmatchedLearners: async () => 0,
  countUnmatchedLearners: async () => 0,
  loadBadgeProgressSummary: async () => ({ totalRows: 0, latestSyncedAt: null, topLearners: [] }),
  loadUnmatchedLearners: async () => [],
}));
// vi.mock is hoisted, so each component module is named literally.
vi.mock('@/components/admin/CourseraMappingsAdmin', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraUnmatchedLearners', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraPipelineFlow', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraSyncProgressButton', () => ({ default: () => null }));
vi.mock('@/components/admin/SeedCanonicalMappingsButton', () => ({ default: () => null }));
vi.mock('@/components/admin/SeedCanonicalMappingsFromB4BButton', () => ({ default: () => null }));
vi.mock('@/components/admin/B4BBindingsSuggestionsCard', () => ({ default: () => null }));
vi.mock('@/components/admin/B4BProgramsListButton', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraSelfTest', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraReconcileCard', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraInspectByEmailCard', () => ({ default: () => null }));
vi.mock('@/components/admin/CourseraCatalogHealthTable', () => ({ CourseraCatalogHealthSection: () => null }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: () => null }));

import AdminCourseraPage from '@/app/admin/coursera/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.userFindMany.mockResolvedValue([]);
});

describe('/admin/coursera member population', () => {
  it('lists members by the one member definition plus dogfood admins, inside the tenant', async () => {
    await AdminCourseraPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });

    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    const { where } = mocks.userFindMany.mock.calls[0][0];
    expect(where).toEqual({ deletedAt: null, organizationId: 'org-a', NOT: MEMBER_OR_DOGFOOD_ROLE_NOT });
    // A user_roles-only member (no profile row yet) can be mapped; a
    // counselor or employer holding the baseline member row cannot; the
    // dogfood admin can; a role-less account cannot.
    expect(admittedIds(where, { organizationId: 'org-a' })).toEqual([...MEMBER_OR_DOGFOOD_IDS]);
    const rowOnly = { ...MEMBER_DEFINITION_ROSTER.rowOnlyMember, organizationId: 'org-a' };
    expect(matchesWhere(rowOnly, where)).toBe(true);
    expect(matchesWhere({ ...rowOnly, organizationId: 'org-b' }, where)).toBe(false);
    expect(matchesWhere({ ...rowOnly, deletedAt: new Date() }, where)).toBe(false);
  });
});
