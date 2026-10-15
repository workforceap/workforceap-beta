import { describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
const mocks = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  memberEvent: { findMany: mocks.events, count: async () => 0 },
  aIToolResult: { groupBy: async () => [] },
} }));
vi.mock('@/lib/admin/metrics', () => ({ countMemberAiToolRuns: async () => 0 }));
import { getEngagementData } from '@/lib/admin/engagementAnalytics';
const programSlug = 'comptia-a-professional-certificate';
const ce = (isPrimary: boolean) => ({ programSlug, isPrimary, curriculumVersion: 'legacy-v1' });
const member = (id: string, enrolledProgram: string | null, courseEnrollments: ReturnType<typeof ce>[]) => ({
  id, enrolledProgram, courseEnrollments, organizationId: 'org-a', email: `${id}@learners.invalid`,
  profile: { role: 'member' }, userRoles: [{ role: { name: 'member' } }],
});

describe('weekly activity by confirmed current program', () => {
  it('keeps unassigned activity in WAU, groups aliases and primary-only members, and preserves tenant/member/fixture exclusions', async () => {
    const members = [
      member('primary', 'old-other-program', [ce(true)]),
      member('alias', 'comptia-a-plus', [ce(false)]),
      member('legacy', programSlug, []),
      member('history', null, [ce(false)]),
      { ...member('other-tenant', programSlug, []), organizationId: 'org-b' },
      { ...member('staff', programSlug, []), profile: { role: 'admin' } },
      { ...member('fixture', programSlug, []), email: 'referral-member-synthetic@workforceap.org' },
    ];
    const events = [...members, members[0]].map((user) => ({ userId: user.id, user, createdAt: new Date(), sessionId: null }));
    mocks.events.mockImplementation(async (args: { where: unknown; distinct?: unknown }) => {
      const rows = events.filter((row) => matchesWhere(row, args.where));
      return args.distinct ? [...new Map(rows.map((row) => [row.userId, row])).values()] : rows;
    });
    const result = await getEngagementData('org-a');
    expect(result.wau).toBe(4);
    expect(result.activeByProgram).toHaveLength(1);
    expect(result.activeByProgram[0].value).toBe(3);
    expect(result.activeByProgram[0].label).toContain('CompTIA');
  });
});
