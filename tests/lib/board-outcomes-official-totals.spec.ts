import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Board / funder headline totals must come from SQL aggregation (count,
 * aggregate, groupBy, PERCENTILE_CONT, COUNT(DISTINCT)) — never from
 * hydrating rows and counting them in JS. The only findMany is the capped
 * placement sample used for the detail table.
 */
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: { count: vi.fn(), groupBy: vi.fn(async () => []), findMany: vi.fn() },
    placementRecord: {
      count: vi.fn(),
      aggregate: vi.fn(async () => ({ _sum: { salaryOffered: 910000 }, _count: { salaryOffered: 17 } })),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    courseEnrollment: { groupBy: vi.fn(async () => []), findMany: vi.fn() },
    profile: { groupBy: vi.fn(async () => []), findMany: vi.fn() },
    memberProgramProgress: { findMany: vi.fn() },
  },
}));

import { getBoardOutcomes } from '@/lib/admin/boardOutcomes';
import { REPORT_SAMPLE_CAP, UNBOUNDED_SCAN_TAKE_FLOOR } from '@/lib/db/scanCaps';
import { prisma } from '@/lib/db/prisma';

function flatten(call: unknown[]): { sql: string; values: unknown[] } {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  const q = Prisma.sql(strings, ...values);
  return { sql: q.sql.replace(/\s+/g, ' ').trim(), values: q.values };
}

function rawQueries() {
  return vi.mocked(prisma.$queryRaw).mock.calls.map((call) => flatten(call as unknown[]));
}

describe('getBoardOutcomes official totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.count).mockResolvedValue(120);
    vi.mocked(prisma.placementRecord.count).mockResolvedValue(45);
    // Route each raw aggregate to a distinct answer so the result proves which query fed it.
    vi.mocked(prisma.$queryRaw).mockImplementation((async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const { sql } = flatten([strings, ...values]);
      if (sql.includes('PERCENTILE_CONT(0.5)')) return [{ median: 52000 }];
      if (sql.includes('AVG(EXTRACT(EPOCH')) return [{ avg_weeks: 9.6 }];
      if (sql.includes('COUNT(DISTINCT u.id)')) return [{ program_slug: 'it-support', count: BigInt(3) }];
      if (sql.includes('FILTER (WHERE certified)')) return [{ certified: BigInt(7), in_training: BigInt(30) }];
      return [];
    }) as any);
  });

  it('derives every headline total from SQL aggregation, not from hydrated rows', async () => {
    const outcomes = await getBoardOutcomes('all-time', 'org-1');

    // Members served / placed come from count() while the only row read returned nothing.
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ deletedAt: null, enrolledProgram: { not: null }, organizationId: 'org-1' }),
    });
    expect(prisma.placementRecord.count).toHaveBeenCalledTimes(1);
    expect(prisma.placementRecord.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ user: { organizationId: 'org-1' } }),
    });
    expect(outcomes.totals).toMatchObject({
      membersServed: 120,
      membersPlaced: 45,
      placementRate: 38,
      membersCertified: 7,
      membersInTraining: 30,
      medianAnnualSalary: 52000,
      totalAnnualSalaryValue: 910000,
      averageWeeksToPlacement: 10,
    });
    expect(outcomes.programs.find((p) => p.programSlug === 'it-support')?.certified).toBe(3);

    // Median salary is a SQL percentile joined through users and scoped to the org.
    const median = rawQueries().find((q) => q.sql.includes('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pr.salary_offered)'));
    expect(median).toBeDefined();
    expect(median!.sql).toContain('INNER JOIN users u ON u.id = pr.user_id');
    expect(median!.sql).toContain('AND u.organization_id = ?');
    expect(median!.values).toContain('org-1');

    // Certified-by-program is a distinct-learner count in SQL.
    const certified = rawQueries().filter((q) => q.sql.includes('COUNT(DISTINCT u.id)::bigint AS count'));
    expect(certified).toHaveLength(1);
    expect(certified[0].sql).toContain('GROUP BY enrolled_program.canonical_slug');
    expect(certified[0].values).toContain('org-1');

    // Salary total comes from aggregate(_sum), not a row scan.
    expect(prisma.placementRecord.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ _sum: { salaryOffered: true } }),
    );
  });

  it('hydrates only the capped placement sample and never a user/enrollment/progress table', async () => {
    await getBoardOutcomes('all-time', 'org-1');

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.courseEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
    expect(prisma.memberProgramProgress.findMany).not.toHaveBeenCalled();

    expect(prisma.placementRecord.findMany).toHaveBeenCalledTimes(1);
    const [args] = vi.mocked(prisma.placementRecord.findMany).mock.calls[0] as [{ take?: number }];
    expect(args.take).toBe(REPORT_SAMPLE_CAP);
    expect(args.take).toBeLessThan(UNBOUNDED_SCAN_TAKE_FLOOR);
  });

  it('keeps the same aggregates for the cumulative single-tenant roll-up (no org)', async () => {
    await getBoardOutcomes('all-time');

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { deletedAt: null, enrolledProgram: { not: null } },
    });
    for (const q of rawQueries()) {
      expect(q.sql).not.toContain('organization_id');
    }
    expect(rawQueries().some((q) => q.sql.includes('PERCENTILE_CONT(0.5)'))).toBe(true);
  });
});
