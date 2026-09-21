import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
const h = vi.hoisted(() => ({ countUsers: vi.fn(), countPlacements: vi.fn(), average: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { count: h.countUsers }, placementRecord: { count: h.countPlacements }, $queryRaw: h.average } }));
import { getMemberOutcomesSummary } from '@/lib/admin/memberOutcomesSummary';
import { loadCounselorRoster, parseCounselorRosterQuery } from '@/lib/admin/counselorRoster';
import { loadCounselorAssignmentAggregates } from '@/lib/admin/counselorRosterAggregates';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

const now = new Date('2026-09-19T12:00:00Z');
const cutoff = new Date(now.getTime() - 90 * 86400000);
beforeEach(() => vi.clearAllMocks());

describe('member outcomes summary', () => {
  it('counts over 200 actual placements with inclusive cutoff/now and excludes other-org/future rows', async () => {
    const rows = [
      ...Array.from({ length: 301 }, () => ({ organizationId: 'org-1', placedAt: now })),
      { organizationId: 'org-1', placedAt: cutoff },
      { organizationId: 'org-1', placedAt: new Date(cutoff.getTime() - 1) },
      { organizationId: 'org-1', placedAt: new Date(now.getTime() + 1) },
      { organizationId: 'org-2', placedAt: now },
    ];
    h.countUsers.mockResolvedValue(400);
    h.countPlacements.mockImplementation(async ({ where }: { where: { user: { organizationId: string }; placedAt?: { gte: Date; lte: Date } } }) =>
      rows.filter(row => row.organizationId === where.user.organizationId && (!where.placedAt || (row.placedAt >= where.placedAt.gte && row.placedAt <= where.placedAt.lte))).length);
    h.average.mockResolvedValue([{ avg_weeks: 5.6 }]);
    expect(await getMemberOutcomesSummary('org-1', now)).toEqual({ membersEnrolled: 400, membersPlaced: 304, placedLast90d: 302, placementRate: 76, averageWeeksToPlacement: 6 });
    // Numerator and denominator share one member-only population (number audit F1).
    expect(h.countUsers).toHaveBeenCalledWith({ where: { organizationId: 'org-1', ...MEMBER_ONLY_WHERE, deletedAt: null, enrolledProgram: { not: null } } });
    expect(h.countPlacements).toHaveBeenCalledTimes(2);
    // Preserve historical placement numerator (no new deleted-user restriction),
    // while the enrolled denominator continues to exclude deleted users.
    expect(h.countPlacements.mock.calls[0][0].where).toEqual({ user: { organizationId: 'org-1', ...MEMBER_ONLY_WHERE } });
    const [strings, ...values] = h.average.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const average = Prisma.sql(strings, ...values);
    expect(average.sql).toContain("member_profile.role = 'member'");
    expect(average.values).toContain('org-1');
    expect(h.average).toHaveBeenCalledTimes(1); expect(h.countUsers).toHaveBeenCalledTimes(1);
  });
  it('never widens a missing tenant to platform scope', async () => {
    await expect(getMemberOutcomesSummary('')).rejects.toThrow('organization');
    expect(h.countUsers).not.toHaveBeenCalled(); expect(h.countPlacements).not.toHaveBeenCalled(); expect(h.average).not.toHaveBeenCalled();
  });
  it('keeps no enrolled/unknown elapsed time distinct', async () => {
    h.countUsers.mockResolvedValue(0); h.countPlacements.mockResolvedValue(0); h.average.mockResolvedValue([{ avg_weeks: null }]);
    expect(await getMemberOutcomesSummary('org-1', now)).toMatchObject({ placementRate: 0, averageWeeksToPlacement: null });
  });
});

describe('counselor grouped reports and pagination', () => {
  const scoped = { ok: true, orgId: 'org-1', superAdmin: false } as const;
  const makeDb = () => ({
    counselor: { count: vi.fn().mockResolvedValue(125), findMany: vi.fn().mockResolvedValue([]) },
    counselorAssignment: { groupBy: vi.fn()
      .mockResolvedValueOnce([{ counselorId: 'c1', _count: { _all: 20005 } }, { counselorId: 'c2', _count: { _all: 7 } }])
      .mockResolvedValueOnce([{ counselorId: 'c1', _count: { _all: 301 } }])
      .mockResolvedValueOnce([{ counselorId: 'c1', _count: { _all: 21 } }]) },
  });
  it('uses all grouped assignments, bounded rows and a stable page order', async () => {
    const db = makeDb();
    const result = await loadCounselorRoster(db as unknown as PrismaClient, scoped, { search: '', page: 2 }, now);
    expect(result.aggregates.get('c1')).toEqual({ caseload: 20005, placements: 301, atRisk: 21 });
    expect(result.avgCaseload).toBe(160); expect(result.atRiskOwned).toBe(21);
    expect(result.total).toBe(125); expect(result.matchingTotal).toBe(125);
    expect(db.counselor.count).toHaveBeenCalledTimes(1);
    expect(db.counselorAssignment.groupBy).toHaveBeenCalledTimes(3);
    expect(db.counselor.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 50, orderBy: [{ user: { fullName: 'asc' } }, { id: 'asc' }] }));
    const cohort = { active: true, counselor: { active: true, user: { organizationId: 'org-1' } }, member: { organizationId: 'org-1' } };
    expect(db.counselorAssignment.groupBy.mock.calls[0][0].where).toEqual(cohort);
    expect(db.counselorAssignment.groupBy.mock.calls[1][0].where.AND[0]).toEqual(cohort);
    expect(db.counselorAssignment.groupBy.mock.calls[2][0].where.AND[0]).toEqual(cohort);
    expect(db.counselorAssignment.groupBy.mock.calls[2][0].where.AND[1]).toEqual({ member: { enrolledProgram: { not: null }, atRiskAlerts: { some: { status: { in: ['open', 'acknowledged', 'escalated'] } } } } });
    expect(db.counselorAssignment.groupBy.mock.calls[1][0].where.AND[1]).toEqual({ member: { placementRecord: { isNot: null } } });
  });
  it('searches in the tenant query and clamps stale pages without changing cohort KPIs', async () => {
    const db = makeDb(); db.counselor.count.mockReset().mockResolvedValueOnce(125).mockResolvedValueOnce(3);
    const result = await loadCounselorRoster(db as unknown as PrismaClient, scoped, { search: 'Jordan', page: 900 }, now);
    expect(result.page).toBe(1); expect(result.total).toBe(125); expect(result.matchingTotal).toBe(3); expect(result.avgCaseload).toBe(160);
    const where = db.counselor.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ active: true, user: { organizationId: 'org-1' } });
    expect(where.AND[1].OR).toContainEqual({ user: { fullName: { contains: 'Jordan', mode: 'insensitive' } } });
    expect(db.counselor.findMany.mock.calls[0][0].skip).toBe(0);
  });
  it('preserves explicit super-admin cross-tenant cohort behavior', async () => {
    const db = makeDb();
    await loadCounselorAssignmentAggregates(db as unknown as PrismaClient, { ...scoped, superAdmin: true });
    expect(db.counselorAssignment.groupBy.mock.calls[0][0].where).toEqual({ active: true, counselor: { active: true } });
  });
  it.each(['0', '-1', 'NaN', '1.5', '9007199254740992'])('normalizes invalid page %s', page => {
    expect(parseCounselorRosterQuery({ page, search: '  Jordan  ' })).toEqual({ page: 1, search: 'Jordan' });
  });
  it('does not turn failed grouped data into zero metrics', async () => {
    const db = makeDb(); db.counselorAssignment.groupBy.mockReset().mockRejectedValue(new Error('aggregate unavailable'));
    await expect(loadCounselorRoster(db as unknown as PrismaClient, scoped, { search: '', page: 1 }, now)).rejects.toThrow('aggregate unavailable');
    expect(db.counselor.findMany).not.toHaveBeenCalled();
  });
});
