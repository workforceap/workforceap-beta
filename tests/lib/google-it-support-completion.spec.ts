import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';

import { getGoogleItLandingMetrics } from '@/lib/marketing/googleItSupportLanding';

describe('getGoogleItLandingMetrics completion truth', () => {
  it('uses a bounded aggregate with exact validated X=Y completion and storage aliases', async () => {
    const enrollmentCount = vi.fn().mockResolvedValue(12);
    const legacyPercentCount = vi.fn().mockResolvedValue(99);
    const placementCount = vi.fn().mockResolvedValue(1);
    const queryRaw = vi.fn().mockResolvedValue([{ count: 2 }]);
    const db = {
      courseEnrollment: { count: enrollmentCount },
      memberProgramProgress: { count: legacyPercentCount },
      placementRecord: { count: placementCount },
      $queryRaw: queryRaw,
    } as unknown as PrismaClient;

    const metrics = await getGoogleItLandingMetrics('org-1', db);

    expect(metrics).toMatchObject({
      enrollmentCount: 12,
      completionCount: 2,
      placementCount: 1,
      hasLiveData: true,
    });
    expect(legacyPercentCount).not.toHaveBeenCalled();
    expect(enrollmentCount).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        programSlug: {
          in: expect.arrayContaining([
            'comptia-a-professional-certificate',
            'comptia-a-plus',
            'CompTIA A+ Professional Certificate (CompTIA A+)',
          ]),
        },
      },
    });

    const [sqlTemplate, ...sqlValues] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    // Flattened, not the raw template: the member predicate arrives as an
    // interpolated `Prisma.Sql` fragment, so joining the strings would hide it.
    const sqlText = Prisma.sql(sqlTemplate, ...sqlValues).sql;
    expect(sqlText).toContain('COUNT(DISTINCT (mpp.user_id, progress_program.canonical_slug))');
    expect(sqlText).toContain('u.organization_id =');
    // One definition of "a member" (WAP-182 item 3), not a hand-written join.
    expect(sqlText).toContain(memberOnlyRoleSql('u').sql);
    expect(sqlText).toContain('mpp.courses_completed = progress_program.total_courses');
    expect(sqlText).not.toContain('average_percent');
  });
});
