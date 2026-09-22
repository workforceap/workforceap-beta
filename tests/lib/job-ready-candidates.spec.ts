import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: vi.fn(async (query: () => Promise<unknown>) => query()),
}));

import { loadJobReadyProgressPage } from '@/lib/admin/jobReadyCandidates';
import { MEMBER_ONLY_EXCLUDED_EMAILS, MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS, memberOrDogfoodRoleSql } from '@/lib/admin/memberOnlyWhere';
import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

function query(index: number): { sql: string; values: unknown[] } {
  const [statement] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [Prisma.Sql];
  return { sql: statement.sql.replace(/\s+/g, ' ').trim(), values: statement.values };
}

const baseArgs = {
  organizationId: 'org-1',
  superAdmin: false,
  minimumPercent: 70,
  programStorageValues: ['it-support', 'IT Support Professional Certificate'],
  limit: 200,
  offset: 400,
};

describe('loadJobReadyProgressPage SQL paging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ userId: 'u1', programSlug: 'it-support', averagePercent: 88, coursesCompleted: 4 }] as any)
      .mockResolvedValueOnce([{ total: 7 }] as any);
  });

  it('filters the current program, eligibility, tenant and supported slugs before LIMIT/OFFSET', async () => {
    const result = await loadJobReadyProgressPage(baseArgs);
    expect(result).toEqual({ rows: [{ userId: 'u1', programSlug: 'it-support', averagePercent: 88, coursesCompleted: 4 }], total: 7 });

    const page = query(0);
    // Rollup joined on the user's *current* program, not any historical row.
    expect(page.sql).toContain('INNER JOIN users u ON u.id = mpp.user_id AND u.enrolled_program = mpp.program_slug');
    expect(page.sql).toContain('AND mpp.program_slug = ANY(?::text[])');
    expect(page.sql).toContain('AND mpp.average_percent >= ?');
    expect(page.sql).toContain('AND u.organization_id = ?');
    // Paging is applied last, after every filter and a deterministic ORDER BY.
    expect(page.sql).toMatch(/WHERE[\s\S]*ORDER BY mpp\.average_percent DESC, u\.created_at DESC, u\.id ASC LIMIT \? OFFSET \?$/);
    // Who counts is the shared member-or-dogfood definition, not a profiles.role list of this query's own:
    // a member named only by a user_roles row is paged too.
    expect(page.sql).toContain(`AND ${memberOrDogfoodRoleSql('u').sql}`);
    expect(page.sql).not.toContain('INNER JOIN profiles');
    expect(page.sql).not.toMatch(/p\.role IN/);
    // Fixture accounts and seeded QA patterns are parameters, never inlined (Mike, 2026-09-20: test members cut out).
    expect(page.sql).toContain('AND u.email NOT IN (?,?,?,?) AND u.email NOT LIKE ?');
    expect(page.values).toEqual([
      ...MEMBER_ONLY_EXCLUDED_EMAILS,
      ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS,
      baseArgs.programStorageValues,
      70,
      'org-1',
      200,
      400,
    ]);

    const total = query(1);
    expect(total.sql).toMatch(/^SELECT COUNT\(\*\)::int AS total/);
    expect(total.sql).toContain('AND u.enrolled_program = mpp.program_slug');
    expect(total.sql).toContain(`AND ${memberOrDogfoodRoleSql('u').sql}`);
    expect(total.sql).not.toContain('INNER JOIN profiles');
    expect(total.sql).toContain('AND u.organization_id = ?');
    expect(total.values).toEqual([...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS, baseArgs.programStorageValues, 70, 'org-1']);
    expect(crossTenantOK).not.toHaveBeenCalled();
  });

  it('super admins page cross-tenant through crossTenantOK with no org predicate', async () => {
    await loadJobReadyProgressPage({ ...baseArgs, superAdmin: true });

    expect(crossTenantOK).toHaveBeenCalledTimes(1);
    for (const index of [0, 1]) {
      const { sql, values } = query(index);
      expect(sql).not.toContain('organization_id');
      expect(values).not.toContain('org-1');
    }
  });

  it('runs no query when there are no supported storage values', async () => {
    const result = await loadJobReadyProgressPage({ ...baseArgs, programStorageValues: [] });
    expect(result).toEqual({ rows: [], total: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
