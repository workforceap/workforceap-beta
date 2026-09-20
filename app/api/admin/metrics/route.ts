import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getAdminMetrics } from '@/lib/admin/metrics';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { countUnmatchedLearners } from '@/lib/coursera/progressQueries';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * Executive Dashboard payload. Every people count is over member-role
 * accounts (`memberOnlySqlJoin`), the same population `getAdminMetrics`
 * uses for the funnel denominators, so no funnel can exceed 100% because its
 * numerator counted staff (number audit 2026-09-20, F7, S4-S6).
 */
async function computeAdminRouteMetricsPayload(
  orgId: string,
  opts: { readOnlyAudit?: boolean } = {},
) {
  const metrics = await getAdminMetrics(orgId, opts);
  const memberJoin = memberOnlySqlJoin();

  const assessmentCompleted = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM users u
      ${memberJoin}
      WHERE u.assessment_completed = true AND u.deleted_at IS NULL
        AND u.organization_id = ${orgId}
    `;

  const dashboardViews = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT me.user_id)::int as count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE me.event_name = 'member_dashboard_viewed'
    `;

  // Distinct members who activated, so the activation rate is members ÷
  // members. COUNT(*) counted every activation event (161 events from one
  // user over 40 viewers printed "Activation Rate 403%"; S4).
  const dashboardActivated = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT me.user_id)::int as count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE me.event_name = 'member_dashboard_activated'
    `;

  const aiToolUsers = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT s.user_id)::int as count
      FROM (
        SELECT air.user_id FROM ai_tool_results air
        INNER JOIN users u ON u.id = air.user_id AND u.organization_id = ${orgId}
        ${memberJoin}
        UNION
        SELECT me.user_id FROM member_events me
        INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
        ${memberJoin}
        WHERE me.event_name = 'ai_tool_run_started' AND me.entity_type = 'ai_tool'
      ) s
    `;

  const jobApplicationUsers = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT ja.user_id)::int as count
      FROM job_applications ja
      INNER JOIN users u ON u.id = ja.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE ja.status <> 'SAVED'
    `;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentPlacements = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE pr.placed_at >= ${thirtyDaysAgo}
    `;

  const avgSalary = await prisma.$queryRaw<{ avg: number | null }[]>`
      SELECT AVG(pr.salary_offered)::float as avg
      FROM placement_records pr
      INNER JOIN users u ON u.id = pr.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE pr.salary_offered IS NOT NULL
    `;

  const weeklySignups = await prisma.$queryRaw<{ week: string; count: number }[]>`
      SELECT DATE_TRUNC('week', u.created_at)::text as week, COUNT(*)::int as count
      FROM users u
      ${memberJoin}
      WHERE u.created_at >= ${thirtyDaysAgo}
        AND u.organization_id = ${orgId}
      GROUP BY DATE_TRUNC('week', u.created_at)
      ORDER BY week
    `;

  const weeklyEnrollments = await prisma.$queryRaw<{ week: string; count: number }[]>`
      SELECT DATE_TRUNC('week', ce.created_at)::text as week, COUNT(*)::int as count
      FROM course_enrollments ce
      WHERE ce.created_at >= ${thirtyDaysAgo}
        AND ce.organization_id = ${orgId}
      GROUP BY DATE_TRUNC('week', ce.created_at)
      ORDER BY week
    `;

  const weeklyDashboardViews = await prisma.$queryRaw<{ week: string; count: number }[]>`
      SELECT DATE_TRUNC('week', me.created_at)::text as week, COUNT(*)::int as count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE me.event_name = 'member_dashboard_viewed' AND me.created_at >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('week', me.created_at)
      ORDER BY week
    `;

  // ── Work Queue counts ──
  let pendingApplications;
  try {
    pendingApplications = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM applications a
      INNER JOIN users u ON u.id = a.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE a.status = 'PENDING'
    `;
  } catch (error) {
    console.error('Failed to get pending applications', error);
    pendingApplications = [{ count: 0 }];
  }

  let criticalAtRisk;
  try {
    criticalAtRisk = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT ara.user_id)::int as count
      FROM at_risk_alerts ara
      INNER JOIN users u ON u.id = ara.user_id AND u.organization_id = ${orgId}
      ${memberJoin}
      WHERE ara.status = 'open' AND ara.score >= 80
    `;
  } catch (error) {
    console.error('Failed to get critical at risk', error);
    criticalAtRisk = [{ count: 0 }];
  }

  // Members currently flagged by the nightly stale-training check (no course
  // progress for 7+ days). The flag is re-stamped on every run while the
  // member stays stale, so an "older than 7 days" predicate on the stamp was
  // always false and the tile always printed 0 (S6).
  let staleTraining;
  try {
    staleTraining = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM users u
      ${memberJoin}
      WHERE u.stale_training_detected_at IS NOT NULL
        AND u.deleted_at IS NULL
        AND u.organization_id = ${orgId}
    `;
  } catch (error) {
    console.error('Failed to get stale training', error);
    staleTraining = [{ count: 0 }];
  }

  // Same loader as the /admin/coursera page this tile links to, so the tile
  // equals the page it opens. The old query INNER JOINed users on
  // matched_user_id, which is NULL for every unmatched row, so it printed 0
  // while 4,216 unmatched events existed (S5).
  let unmatchedCoursera: number;
  try {
    unmatchedCoursera = await countUnmatchedLearners(orgId, { includeTestAccounts: false, strict: true });
  } catch (error) {
    console.error('Failed to get unmatched coursera', error);
    unmatchedCoursera = 0;
  }

  const total = metrics.totalMembers;
  const enrolled = metrics.placementStats.enrolled;
  const assessed = Number(assessmentCompleted[0].count);
  const dashboardViewers = Number(dashboardViews[0].count);
  const activated = Number(dashboardActivated[0].count);
  const aiRuns = metrics.aiToolRuns;
  const aiUsers = Number(aiToolUsers[0].count);
  const jobApps = metrics.applicationsSubmitted;
  const jobAppUsers = Number(jobApplicationUsers[0].count);

  return {
    summary: {
      totalMembers: total,
      enrolledMembers: enrolled,
      enrollmentRate: total > 0 ? Math.round((enrolled / total) * 100) : 0,
      assessmentRate: total > 0 ? Math.round((assessed / total) * 100) : 0,
      activeDashboardUsers: dashboardViewers,
      activationRate: dashboardViewers > 0 ? Math.round((activated / dashboardViewers) * 100) : 0,
      aiToolRuns: aiRuns,
      jobApplicationsTracked: jobApps,
      totalPlacements: metrics.placementStats.placed,
      recentPlacements: Number(recentPlacements[0].count),
      // null (rendered "—") when no placement carries a salary; never "$0" (F6).
      avgPlacementSalary: avgSalary[0]?.avg != null ? Math.round(avgSalary[0].avg) : null,
      placementRate: metrics.placementStats.placementRate,
      pendingApplications: Number(pendingApplications[0]?.count ?? 0),
      criticalAtRisk: Number(criticalAtRisk[0]?.count ?? 0),
      staleTraining: Number(staleTraining[0]?.count ?? 0),
      unmatchedCoursera,
    },
    funnels: [
      {
        name: 'Application → Account',
        current: total,
        target: total,
        rate: 100,
        description: 'Members who created accounts',
      },
      {
        name: 'Application → Enrollment',
        current: enrolled,
        target: total,
        rate: total > 0 ? Math.round((enrolled / total) * 100) : 0,
        description: 'Members enrolled in a program',
      },
      {
        name: 'Dashboard Activation',
        current: activated,
        target: dashboardViewers,
        rate: dashboardViewers > 0 ? Math.round((activated / dashboardViewers) * 100) : 0,
        description: 'Dashboard viewers who activated',
      },
      {
        name: 'Assessment Completion',
        current: assessed,
        target: total,
        rate: total > 0 ? Math.round((assessed / total) * 100) : 0,
        description: 'Members who completed assessment',
      },
      {
        name: 'AI Tool Usage',
        current: aiUsers,
        target: total,
        rate: total > 0 ? Math.round((aiUsers / total) * 100) : 0,
        description: 'Members who used at least one AI tool',
      },
      {
        name: 'Job Tracker Usage',
        current: jobAppUsers,
        target: total,
        rate: total > 0 ? Math.round((jobAppUsers / total) * 100) : 0,
        description: 'Members who tracked at least one application',
      },
    ],
    trends: {
      signups: weeklySignups,
      enrollments: weeklyEnrollments,
      dashboardViews: weeklyDashboardViews,
    },
  };
}export const GET = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    try {
      const orgId = await getActorOrganizationId(user.id);
      const readOnlyAudit = isReadOnlyPortalAuditHeader(request.headers);
      const body = readOnlyAudit
        ? await computeAdminRouteMetricsPayload(orgId, { readOnlyAudit: true })
        : await unstable_cache(
            async () => computeAdminRouteMetricsPayload(orgId),
            ['admin-api-metrics-v1', orgId],
            { revalidate: 60 },
          )();
      return NextResponse.json(body);
    } catch (e) {
      console.error('[admin/metrics]', e);
      return NextResponse.json({ error: 'Failed to load metrics' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
