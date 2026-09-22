import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('server-only', () => ({}));

const mockUserFindMany = vi.fn();
const mockQueryRaw = vi.hoisted(() => vi.fn());

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({ user: { findMany: mockUserFindMany } }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

import { getFunderProgramSummaryRows } from './funderProgramMetrics';
import { MEMBER_ONLY_WHERE, memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';

function mockUser(opts: { id: string; hasPlacement: boolean; startDateVerified?: boolean }) {
  return {
    id: opts.id,
    enrolledProgram: 'cna',
    courseEnrollments: [],
    memberProgramProgress: [],
    placementRecord: opts.hasPlacement
      ? { id: `placement-${opts.id}`, startDateVerified: opts.startDateVerified ?? false }
      : null,
  };
}

describe('getFunderProgramSummaryRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([]);
  });

  it('carries the one member definition into the Prisma scan and the at-risk SQL', async () => {
    // The at-risk aggregate used to hand-roll `p.role = 'member'`, so a
    // revert leaves this funder figure on the old definition while the
    // enrolled denominator beside it moves (WAP-182 item 3).
    mockUserFindMany.mockResolvedValue([]);
    await getFunderProgramSummaryRows('org-1');

    expect(mockUserFindMany.mock.calls[0][0].where).toMatchObject(MEMBER_ONLY_WHERE);

    const rawSql = (mockQueryRaw.mock.calls as unknown as Array<[TemplateStringsArray, ...unknown[]]>)
      .map(([strings, ...values]) => Prisma.sql(strings, ...values).sql);
    const atRisk = rawSql.filter((sql) => sql.includes('at_risk_alerts'));
    expect(atRisk).toHaveLength(1);
    expect(atRisk[0]).toContain(memberOnlyRoleSql('u').sql);
    expect(atRisk[0]).not.toContain("p.role = 'member'");
  });

  it('only counts staff-verified placements toward the funder-reported "placed" total', async () => {
    mockUserFindMany.mockResolvedValue([
      mockUser({ id: 'u1', hasPlacement: true, startDateVerified: true }),
      mockUser({ id: 'u2', hasPlacement: true, startDateVerified: false }),
      mockUser({ id: 'u3', hasPlacement: false }),
    ]);

    const { rows } = await getFunderProgramSummaryRows('org-1');

    const cnaRow = rows.find((r) => r.programSlug === 'cna');
    expect(cnaRow?.totalEnrolled).toBe(3);
    // Only u1's verified placement counts — u2's unverified auto-created
    // record must not inflate the funder-facing placement total.
    expect(cnaRow?.placed).toBe(1);
    expect(cnaRow?.placementPct).toBe(33);
  });
});

describe('getFunderProgramSummaryRows — program titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([]);
  });

  it('prints a humanised title for an unknown slug and the catalog title for the IBM alias', async () => {
    const { getProgramBySlug } = await import('@/lib/content/programs');
    const aws = getProgramBySlug('ai-practitioner-professional-certificate-aws');
    expect(aws).toBeTruthy();
    mockUserFindMany.mockResolvedValue([
      { ...mockUser({ id: 'u1', hasPlacement: false }), enrolledProgram: 'cybersecurity-google' },
      { ...mockUser({ id: 'u2', hasPlacement: false }), enrolledProgram: 'ai-professional-developer-certificate-ibm' },
    ]);

    const { rows } = await getFunderProgramSummaryRows('org-1');
    const titles = rows.map((r) => r.programTitle);
    expect(titles).toContain('Cybersecurity Google');
    expect(titles).toContain(aws!.title);
    for (const title of titles) expect(title).not.toMatch(/-[a-z]/);
  });
});
