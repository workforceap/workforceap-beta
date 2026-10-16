import { MEMBER_ONLY_WHERE, memberOnlyEmailSql, memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';
import type { FunderProgramSummaryRow } from '@/lib/admin/funderProgramSummaryCsv';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';
import { canonicalProgramSlugSql, confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { Prisma } from '@prisma/client';
import { programDisplayTitle } from '@/lib/content/programTitle';

import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { THRESHOLDS } from '@/lib/member/atRiskScoring';
import { hasValidatedProgramCompletion } from '@/lib/reporting/programCompletion';

const EXPORT_LIMIT = 10_000;

export type { FunderProgramSummaryRow } from '@/lib/admin/funderProgramSummaryCsv';

/**
 * Aggregates enrollment, engagement, completion, placement, and at-risk counts per
 * enrolled program for grant / funder reporting. Scoped to `orgId` (actor tenant).
 * Uses the same member-only filter as cohort exports (`MEMBER_ONLY_WHERE`).
 */
export async function getFunderProgramSummaryRows(orgId: string): Promise<{
  rows: FunderProgramSummaryRow[];
  truncated: boolean;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Resolve eligibility before the export bound; cleared history cannot crowd
  // actual current assignments out of the capped report.
  const eligible = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH current_assignments AS (${confirmedCurrentProgramAssignmentsSql()})
    SELECT u.id FROM users u JOIN current_assignments ca ON ca.user_id = u.id
    WHERE u.organization_id = ${orgId} AND u.deleted_at IS NULL
      AND ${memberOnlyRoleSql('u')} AND ${memberOnlyEmailSql('u')}
    ORDER BY ca.enrolled_at DESC NULLS LAST, u.id ASC LIMIT ${EXPORT_LIMIT + 1}
  `;
  const [users, activeRows, atRiskByProgramRows] = await Promise.all([
    withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: {
          deletedAt: null,
          id: { in: eligible.slice(0, EXPORT_LIMIT).map((row) => row.id) },
          ...MEMBER_ONLY_WHERE,
        },
        orderBy: { enrolledAt: 'desc' },
        take: EXPORT_LIMIT,
        select: {
          id: true,
          enrolledProgram: true,
          courseEnrollments: CONFIRMED_PROGRAM_ENROLLMENTS_SELECT,
          memberProgramProgress: {
            select: { programSlug: true, coursesCompleted: true },
          },
          placementRecord: { select: { id: true, startDateVerified: true } },
        },
      }),
    ),
    prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT DISTINCT me.user_id
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      WHERE me.created_at >= ${thirtyDaysAgo}
    `,
    prisma.$queryRaw<Array<{ slug: string | null; cnt: number }>>`
      WITH current_assignments AS (${confirmedCurrentProgramAssignmentsSql()})
      SELECT ${canonicalProgramSlugSql(Prisma.sql`ca.program_slug`)} AS slug, COUNT(DISTINCT a.user_id)::int AS cnt
      FROM at_risk_alerts a
      INNER JOIN users u ON u.id = a.user_id AND u.organization_id = ${orgId}
      JOIN current_assignments ca ON ca.user_id = u.id
      WHERE a.status IN ('open', 'acknowledged')
        AND ${memberOnlyRoleSql('u')}
        AND a.score >= ${THRESHOLDS.HIGH}
        AND u.deleted_at IS NULL
        AND ${memberOnlyEmailSql('u')}
      GROUP BY 1
    `,
  ]);

  const active30dSet = new Set(activeRows.map((r) => r.user_id));

  const atRiskByProgram = new Map<string, number>();
  for (const row of atRiskByProgramRows) {
    if (!row.slug) continue;
    atRiskByProgram.set(row.slug, row.cnt);
  }

  type Agg = {
    totalEnrolled: number;
    activeLast30d: number;
    completed: number;
    placed: number;
  };

  const aggBySlug = new Map<string, Agg>();

  for (const u of users) {
    const assignment = resolveConfirmedProgramAssignment(u);
    if (!assignment.programSlug) continue;
    const slug = canonicalizeProgramSlug(assignment.programSlug);
    let agg = aggBySlug.get(slug);
    if (!agg) {
      agg = { totalEnrolled: 0, activeLast30d: 0, completed: 0, placed: 0 };
      aggBySlug.set(slug, agg);
    }
    agg.totalEnrolled += 1;
    if (active30dSet.has(u.id)) agg.activeLast30d += 1;

    if (
      hasValidatedProgramCompletion(
        assignment.programSlug,
        assignment.curriculumVersion,
        u.memberProgramProgress,
      )
    ) {
      agg.completed += 1;
    }

    // Only staff-verified placements count toward funder-reported placement totals.
    if (u.placementRecord?.startDateVerified) agg.placed += 1;
  }

  const rows: FunderProgramSummaryRow[] = [];

  const sortedSlugs = [...aggBySlug.keys()].sort((a, b) => {
    const titleA = programDisplayTitle(a);
    const titleB = programDisplayTitle(b);
    return titleA.localeCompare(titleB);
  });

  for (const slug of sortedSlugs) {
    const agg = aggBySlug.get(slug)!;
    const atRisk = atRiskByProgram.get(slug) ?? 0;
    const completionPct =
      agg.totalEnrolled > 0 ? Math.round((agg.completed / agg.totalEnrolled) * 100) : 0;
    const placementPct =
      agg.totalEnrolled > 0 ? Math.round((agg.placed / agg.totalEnrolled) * 100) : 0;

    rows.push({
      programSlug: slug,
      programTitle: programDisplayTitle(slug),
      totalEnrolled: agg.totalEnrolled,
      activeLast30d: agg.activeLast30d,
      completed: agg.completed,
      placed: agg.placed,
      atRisk,
      completionPct,
      placementPct,
    });
  }

  return {
    rows,
    truncated: eligible.length > EXPORT_LIMIT,
  };
}
