import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => []),
    user: { findMany: vi.fn(async () => []) },
    aIToolResult: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: vi.fn(async (query: () => Promise<unknown>) => query()),
}));

import { getAiToolsCohortStats, getAiToolUsageCounts } from '@/lib/admin/cohortAnalytics';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { ANALYTICS_COHORT_DETAIL_CAP } from '@/lib/db/scanCaps';
import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

/** Flattens a tagged `prisma.$queryRaw\`...\`` call (nested Prisma.sql included). */
function rawQuery(index = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[index] as unknown as [TemplateStringsArray, ...unknown[]];
  const flattened = Prisma.sql(strings, ...values);
  return { sql: flattened.sql.replace(/\s+/g, ' ').trim(), values: flattened.values };
}

describe('AI tools raw voice analytics tenant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cohort rows resolve voice events through their user and filter by the requested org', async () => {
    await getAiToolsCohortStats('org-a');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, ...MEMBER_ONLY_WHERE, organizationId: 'org-a' } }),
    );
    expect(prisma.aIToolResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { organizationId: 'org-a' } } }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const { sql, values } = rawQuery();
    expect(sql).toContain('INNER JOIN users u ON u.id = me.user_id');
    expect(sql).toContain('AND u.organization_id = ?');
    expect(sql).toMatch(/LIMIT \?$/);
    expect(values).toContain('org-a');
    expect(values.at(-1)).toBe(ANALYTICS_COHORT_DETAIL_CAP);
    expect(crossTenantOK).not.toHaveBeenCalled();
  });

  it('card counts resolve voice events through their user and filter by the requested org', async () => {
    await getAiToolUsageCounts('org-b');

    expect(prisma.aIToolResult.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { organizationId: 'org-b' } } }),
    );
    const { sql, values } = rawQuery();
    expect(sql).toContain('INNER JOIN users u ON u.id = me.user_id');
    expect(sql).toContain('AND u.organization_id = ?');
    expect(values).toContain('org-b');
    expect(crossTenantOK).not.toHaveBeenCalled();
  });

  it('two orgs never share a predicate', async () => {
    await getAiToolUsageCounts('org-a');
    await getAiToolUsageCounts('org-b');
    expect(rawQuery(0).values).toContain('org-a');
    expect(rawQuery(0).values).not.toContain('org-b');
    expect(rawQuery(1).values).toContain('org-b');
    expect(rawQuery(1).values).not.toContain('org-a');
  });

  it('the omitted-org super-admin view is the only path marked crossTenantOK and carries no org predicate', async () => {
    await getAiToolsCohortStats(undefined);
    await getAiToolUsageCounts(null);

    expect(crossTenantOK).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    for (const index of [0, 1]) {
      const { sql, values } = rawQuery(index);
      expect(sql).toContain('INNER JOIN users u ON u.id = me.user_id');
      expect(sql).not.toContain('organization_id');
      expect(values.some((value) => typeof value === 'string' && value.startsWith('org-'))).toBe(false);
    }
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, ...MEMBER_ONLY_WHERE } }));
    expect(prisma.aIToolResult.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
