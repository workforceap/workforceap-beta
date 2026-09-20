import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { logAuditEvent, auditRequestMeta } from '@/lib/audit/log';
import { MEMBER_ONLY_WHERE, memberOnlyProfileWhere, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { summarizeRetentionGroups } from '@/lib/analytics/retentionOutcome';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { sqlCount } from '@/lib/db/scanCaps';
import {
  validatedProgramAssignmentRowsSql,
  validatedProgramCompletionValuesSql,
} from '@/lib/reporting/programCompletion';

import { withApiGuc } from '@/lib/db/withRequestGuc';

// ── Helpers ──
//
// Number audit 2026-09-20, F9. This route has no screen consumer; whether it
// stays is Mike's call (Needs Mike 10). While it exists its numbers follow
// the same rules as the board snapshot: member-role accounts only, program
// completion = the validated curriculum rollup (not a non-empty
// `courses_completed` JSON list), and "retention" = the decided 90-day
// retention outcome on placement records, never "not yet placed".

function buildCohorts(
  members: Array<{ enrolledAt: Date | null; placementRecord: { startDate: Date | null } | null }>,
) {
  const cohorts: Record<string, { month: string; enrolled: number; placed: number; placementRate: number }> = {};

  for (const m of members) {
    if (!m.enrolledAt) continue;
    const monthKey = m.enrolledAt.toISOString().slice(0, 7); // YYYY-MM
    if (!cohorts[monthKey]) {
      cohorts[monthKey] = { month: monthKey, enrolled: 0, placed: 0, placementRate: 0 };
    }
    cohorts[monthKey].enrolled++;
    if (m.placementRecord?.startDate) {
      cohorts[monthKey].placed++;
    }
  }

  return Object.values(cohorts)
    .map((c) => ({
      ...c,
      // Placed ÷ enrolled for the cohort month. This used to be exported as
      // `retentionRate`, which it never was.
      placementRate: c.enrolled > 0 ? Math.round((c.placed / c.enrolled) * 100) : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12); // Last 12 months
}

/** Members who completed their assigned, validated program, by canonical program slug. */
async function loadCompletedTrainingByProgram(orgId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ program_slug: string; count: bigint | number }>>`
    WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
      VALUES ${validatedProgramCompletionValuesSql()}
    ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
      ${validatedProgramAssignmentRowsSql()}
    )
    SELECT
      enrolled_program.canonical_slug AS program_slug,
      COUNT(DISTINCT u.id)::bigint AS count
    FROM users u
    ${memberOnlySqlJoin()}
    INNER JOIN learner_program_assignments ce
      ON ce.user_id = u.id
    INNER JOIN validated_programs enrolled_program
      ON enrolled_program.storage_value = ce.program_slug
      AND enrolled_program.curriculum_version = ce.curriculum_version
    INNER JOIN member_program_progress mpp
      ON mpp.user_id = u.id
    INNER JOIN validated_programs progress_program
      ON progress_program.canonical_slug = enrolled_program.canonical_slug
      AND progress_program.storage_value = mpp.program_slug
      AND progress_program.curriculum_version = ce.curriculum_version
    WHERE u.deleted_at IS NULL
      AND u.enrolled_program IS NOT NULL
      AND u.organization_id = ${orgId}
      AND mpp.courses_completed = progress_program.total_courses
    GROUP BY enrolled_program.canonical_slug
  `;
  return new Map(rows.map((row) => [row.program_slug, sqlCount(row.count)]));
}

/** A field this route buckets into a categorical breakdown, e.g. `veteranStatus`. */
type DemographicField = 'veteranStatus' | 'employmentStatus' | 'householdIncome' | 'educationLevel' | 'ethnicity';

/** Shape returned by `prisma.profile.groupBy({ by: [field], ... })` for any of the fields above. */
type GroupByRow = { _count: { _all: number } } & Partial<Record<DemographicField, string | null>>;

function toBreakdown(rows: GroupByRow[], field: DemographicField): Array<{ label: string; count: number }> {
  return rows.map((r) => ({ label: r[field] ?? 'Not reported', count: r._count._all }));
}

async function getDemographics(orgId: string) {
  // PERF: 5 cheap indexed aggregates instead of materializing every org
  // profile just to bucket 5 categorical columns in JS. Member profiles only.
  const profileWhere = memberOnlyProfileWhere({ organizationId: orgId, deletedAt: null });
  const [veteranStatus, employmentStatus, householdIncome, educationLevel, ethnicity] = await Promise.all([
    prisma.profile.groupBy({ by: ['veteranStatus'], where: profileWhere, _count: { _all: true } }),
    prisma.profile.groupBy({ by: ['employmentStatus'], where: profileWhere, _count: { _all: true } }),
    prisma.profile.groupBy({ by: ['householdIncome'], where: profileWhere, _count: { _all: true } }),
    prisma.profile.groupBy({ by: ['educationLevel'], where: profileWhere, _count: { _all: true } }),
    prisma.profile.groupBy({ by: ['ethnicity'], where: profileWhere, _count: { _all: true } }),
  ]);

  return {
    veteranBreakdown: toBreakdown(veteranStatus, 'veteranStatus'),
    employmentEnteringBreakdown: toBreakdown(employmentStatus, 'employmentStatus'),
    incomeBreakdown: toBreakdown(householdIncome, 'householdIncome'),
    educationBreakdown: toBreakdown(educationLevel, 'educationLevel'),
    ethnicityBreakdown: toBreakdown(ethnicity, 'ethnicity'),
  };
}

/**
 * Computes the outcomes dashboard payload for one org. Pulled out of `_GET`
 * so it can be wrapped in `unstable_cache` — placements/members/demographics
 * are otherwise full org-wide scans re-run on every single page view (this
 * is one of the most-clicked admin analytics pages), matching the caching
 * pattern already used by the sibling admin/metrics and admin/ai-efficacy
 * routes.
 */
async function computeOutcomesPayload(orgId: string) {
  // Placement data, member data, and demographics are independent reads —
  // run them together instead of one round trip at a time.
  const memberUser = { organizationId: orgId, ...MEMBER_ONLY_WHERE };
  const [placements, members, demographics, completedByProgram, retentionGroups] = await Promise.all([
    prisma.placementRecord.findMany({
      where: { user: memberUser },
      select: {
        salaryOffered: true,
        userId: true,
        programSlug: true,
      },
    }),
    prisma.user.findMany({
      where: {
        ...memberUser,
        deletedAt: null,
      },
      select: {
        id: true,
        enrolledProgram: true,
        enrolledAt: true,
        placementRecord: {
          select: {
            salaryOffered: true,
            startDate: true,
          },
        },
      },
    }),
    getDemographics(orgId),
    loadCompletedTrainingByProgram(orgId),
    prisma.placementRecord.groupBy({
      by: ['retentionStatus', 'retentionDecision'],
      where: { user: memberUser },
      _count: { _all: true },
    }),
  ]);

  // Calculate metrics
  const totalMembers = members.length;
  const enrolledMembers = members.filter((m) => m.enrolledProgram !== null).length;
  const completedMembers = [...completedByProgram.values()].reduce((sum, n) => sum + n, 0);
  const placedMembers = members.filter((m) => m.placementRecord !== null).length;

  const placementRate = enrolledMembers > 0
    ? Math.round((placedMembers / enrolledMembers) * 100)
    : 0;

  const completionRate = enrolledMembers > 0
    ? Math.round((completedMembers / enrolledMembers) * 100)
    : 0;

  // Salary analysis
  const salaries = placements
    .map((p) => p.salaryOffered)
    .filter((s): s is number => s !== null && s !== undefined);

  // null (not $0) when no placement carries a salary (F6).
  const avgSalary = salaries.length > 0
    ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
    : null;

  const salaryRange = salaries.length > 0
    ? { min: Math.min(...salaries), max: Math.max(...salaries) }
    : null;

  // Program effectiveness, keyed by canonical program slug so alias slugs
  // fold onto one program and match the completion rollup keys.
  const programStats: Record<string, { title: string; enrollments: number; completions: number; placements: number }> = {};

  for (const member of members) {
    if (!member.enrolledProgram) continue;
    const slug = canonicalizeProgramSlug(member.enrolledProgram);

    if (!programStats[slug]) {
      programStats[slug] = {
        title: slug,
        enrollments: 0,
        completions: completedByProgram.get(slug) ?? 0,
        placements: 0,
      };
    }
    programStats[slug].enrollments++;

    if (member.placementRecord) {
      programStats[slug].placements++;
    }
  }

  // ── 90-day retention: decided placement outcomes only (retained vs
  // not-retained/separated); null when no placement has a decision yet. ──
  const retention = summarizeRetentionGroups(
    retentionGroups.map((g) => ({
      retentionStatus: g.retentionStatus,
      retentionDecision: g.retentionDecision,
      count: g._count._all,
    })),
  );
  const retentionDenominator = retention.retained + retention.notRetainedOrSeparated;
  const retention90 = retentionDenominator > 0
    ? Math.round((retention.retained / retentionDenominator) * 100)
    : null;

  // ── Cohort comparison (month-over-month) ──
  const cohorts = buildCohorts(members);

  return {
    metrics: {
      totalMembers,
      enrolledMembers,
      completedMembers,
      placedMembers,
      placementRate,
      completionRate,
      avgSalary,
      salaryRange,
      retention: {
        /** 90-day retention over placements with a decided outcome; null when none is decided. */
        d90: retention90,
        decidedPlacements: retentionDenominator,
        pendingPlacements: retention.pendingDecision,
      },
    },
    programStats: Object.entries(programStats).map(([slug, stats]) => ({
      slug,
      ...stats,
      completionRate: stats.enrollments > 0
        ? Math.round((stats.completions / stats.enrollments) * 100)
        : 0,
      placementRate: stats.enrollments > 0
        ? Math.round((stats.placements / stats.enrollments) * 100)
        : 0,
    })),
    cohorts,
    demographics,
  };
}

/**
 * GET /api/admin/outcomes
 * Admin outcomes dashboard data — placement rates, salary data, program effectiveness,
 * retention rates (30/60/90-day), cohort comparison, and demographic breakdowns.
 * Requires admin access. Returns aggregated metrics for the admin's organization.
 */
async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await isAdmin(user.id);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = await getActorOrganizationId(user.id);
    if (!orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
    }

    // PERF: cache the aggregated payload for a few minutes — this route
    // otherwise rescans placements/members/profiles org-wide on every page
    // view. Audit logging stays outside the cache so every real view is
    // still recorded.
    const payload = await unstable_cache(
      () => computeOutcomesPayload(orgId),
      ['admin-outcomes-v1', orgId],
      { revalidate: 300 },
    )();

    auditLog({ actorUserId: user.id, action: 'admin_outcomes_view', targetType: 'OutcomesDashboard', targetId: 'aggregate', metadata: { orgId } }).catch((err) => console.error('[audit] admin_outcomes_view:', err));
    logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'viewed',
      object: { type: 'OutcomesDashboard', id: 'aggregate' },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] viewed outcomes:', err));

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/admin/outcomes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
