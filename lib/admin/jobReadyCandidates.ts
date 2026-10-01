import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { memberOnlyEmailSql, memberOrDogfoodRoleSql } from '@/lib/admin/memberOnlyWhere';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

export type JobReadyProgressRow = {
  userId: string;
  programSlug: string;
  averagePercent: number;
  coursesCompleted: number;
};

/**
 * Page the actual job-ready cohort in SQL. Joining the rollup on both user id
 * and the user's current program avoids the previous failure mode where a cap
 * was applied to all enrolled users before the 70% eligibility filter.
 *
 * Who counts is the shared member-or-dogfood definition
 * (`memberOrDogfoodRoleSql`, lib/admin/memberOnlyWhere.ts), not a
 * `profiles.role` list of this query's own, so a member the roster counts is
 * also a member this page can list.
 */
export async function loadJobReadyProgressPage(args: {
  organizationId: string;
  superAdmin: boolean;
  minimumPercent: number;
  programStorageValues: string[];
  limit: number;
  offset: number;
}): Promise<{ rows: JobReadyProgressRow[]; total: number }> {
  if (args.programStorageValues.length === 0) return { rows: [], total: 0 };

  const tenantPredicate = args.superAdmin
    ? Prisma.empty
    : Prisma.sql`AND u.organization_id = ${args.organizationId}`;

  const query = async () => {
    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<JobReadyProgressRow[]>(Prisma.sql`
        SELECT
          u.id AS "userId",
          mpp.program_slug AS "programSlug",
          mpp.average_percent AS "averagePercent",
          mpp.courses_completed AS "coursesCompleted"
        FROM member_program_progress mpp
        INNER JOIN users u
          ON u.id = mpp.user_id
          AND u.enrolled_program = mpp.program_slug
        WHERE u.deleted_at IS NULL
          AND ${memberOrDogfoodRoleSql('u')}
          AND ${memberOnlyEmailSql('u')}
          AND mpp.program_slug = ANY(${args.programStorageValues}::text[])
          AND mpp.average_percent >= ${args.minimumPercent}
          ${tenantPredicate}
        ORDER BY mpp.average_percent DESC, u.created_at DESC, u.id ASC
        LIMIT ${args.limit}
        OFFSET ${args.offset}
      `),
      prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM member_program_progress mpp
        INNER JOIN users u
          ON u.id = mpp.user_id
          AND u.enrolled_program = mpp.program_slug
        WHERE u.deleted_at IS NULL
          AND ${memberOrDogfoodRoleSql('u')}
          AND ${memberOnlyEmailSql('u')}
          AND mpp.program_slug = ANY(${args.programStorageValues}::text[])
          AND mpp.average_percent >= ${args.minimumPercent}
          ${tenantPredicate}
      `),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  };

  return args.superAdmin ? crossTenantOK(query) : query();
}
