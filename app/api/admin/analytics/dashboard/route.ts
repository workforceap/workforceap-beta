import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';

async function invalidateAdminStats(orgId: string): Promise<void> {
  await invalidateCache(`admin:stats:${orgId}*`);
}

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = await getActorOrganizationId(user.id);

    const body = await getCacheOrFetch(
      `admin:stats:${orgId}`,
      async () => {
        const [
          totalMembers,
          enrolledMembers,
          assessmentCompleted,
          placementsCount,
          avgSalaryResult,
        ] = await Promise.all([
          // Member-role accounts only, like every other outcome figure (F1, F7).
          prisma.user.count({
            where: { deletedAt: null, organizationId: orgId, ...MEMBER_ONLY_WHERE },
          }),
          prisma.user.count({
            where: { deletedAt: null, organizationId: orgId, enrolledProgram: { not: null }, ...MEMBER_ONLY_WHERE },
          }),
          prisma.user.count({
            where: { deletedAt: null, organizationId: orgId, assessmentCompleted: true, ...MEMBER_ONLY_WHERE },
          }),
          prisma.placementRecord.count({
            where: { user: { organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE } },
          }),
          prisma.$queryRaw<{ avg: number | null }[]>`
            SELECT AVG(pr.salary_offered)::float as avg
            FROM placement_records pr
            INNER JOIN users u ON u.id = pr.user_id AND u.organization_id = ${orgId} AND u.deleted_at IS NULL
            ${memberOnlySqlJoin()}
            WHERE pr.salary_offered IS NOT NULL
          `,
        ]);

        const completionRate = totalMembers > 0 ? Math.round((assessmentCompleted / totalMembers) * 100) : 0;
        const placementRate = enrolledMembers > 0 ? Math.round((placementsCount / enrolledMembers) * 100) : 0;

        return {
          totalMembers,
          enrolledMembers,
          assessmentCompleted,
          completionRate,
          placementsCount,
          placementRate,
          // null when no placement carries a salary; callers render "—", never "$0" (F6).
          avgPlacementSalary: avgSalaryResult[0]?.avg != null ? Math.round(avgSalaryResult[0].avg) : null,
        };
      },
      300,
    );

    return NextResponse.json(body);
  } catch (error) {
    console.error('/admin/analytics/dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
