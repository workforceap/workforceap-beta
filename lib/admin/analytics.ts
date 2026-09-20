import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import {
  validatedProgramAssignmentRowsSql,
  validatedProgramCompletionValuesSql,
} from '@/lib/reporting/programCompletion';

/**
 * Analytics overview for non-technical admin users.
 * Complements the funder-facing BoardSnapshot in boardOutcomes.ts.
 * All numbers are sourced from existing DB data — no new tables.
 *
 * Population: member-role accounts only (`MEMBER_ONLY_WHERE`), like every
 * other outcome figure (number audit 2026-09-20, F1, S6, S23, S24).
 */

export type MemberStatusCounts = {
  enrolled: number;
  active: number;
  placed: number;
  inactive: number;
};

export type EnrollmentTrend = {
  month: string; // "2026-01"
  monthLabel: string; // "Jan 2026"
  count: number;
};

export type ProgramProgress = {
  programSlug: string;
  avgPercent: number; // 0–100
  activeMembers: number;
};

export type PlacementRate = {
  placed: number;
  completedTraining: number;
  rate: number; // 0–100
};

export type CounselorLoad = {
  counselorName: string;
  memberCount: number;
};

export type AnalyticsOverview = {
  memberStatus: MemberStatusCounts;
  enrollmentTrend: EnrollmentTrend[];
  programProgress: ProgramProgress[];
  placementRate: PlacementRate;
  dropOffCount: number;
  counselorLoad: CounselorLoad[];
  unassignedCount: number;
};

/**
 * Fold per-(rollup slug, assigned program) averages onto canonical programs.
 * A rollup only counts toward the program its learner is assigned to, and
 * alias slugs merge into one row with a member-weighted average (S24).
 */
export function summarizeProgramProgress(
  groups: ReadonlyArray<{ programSlug: string; enrolledProgram: string; avgPercent: number | null; memberCount: number }>,
): ProgramProgress[] {
  const byProgram = new Map<string, { weighted: number; members: number }>();
  for (const g of groups) {
    const canonical = canonicalizeProgramSlug(g.programSlug);
    if (canonical !== canonicalizeProgramSlug(g.enrolledProgram)) continue;
    if (g.memberCount <= 0) continue;
    const cur = byProgram.get(canonical) ?? { weighted: 0, members: 0 };
    cur.weighted += (g.avgPercent ?? 0) * g.memberCount;
    cur.members += g.memberCount;
    byProgram.set(canonical, cur);
  }
  return [...byProgram.entries()]
    .map(([programSlug, { weighted, members }]) => ({
      programSlug,
      avgPercent: members > 0 ? Math.round(weighted / members) : 0,
      activeMembers: members,
    }))
    .sort((a, b) => b.activeMembers - a.activeMembers || a.programSlug.localeCompare(b.programSlug));
}

function monthFmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export async function getAnalyticsOverview(organizationId?: string): Promise<AnalyticsOverview> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const orgFilterSql = organizationId ? Prisma.sql`AND u.organization_id = ${organizationId}` : Prisma.empty;
  const memberUser = { ...MEMBER_ONLY_WHERE, ...(organizationId ? { organizationId } : {}) };
  const memberJoin = memberOnlySqlJoin();

  // All of the reads below are independent of one another (none consumes
  // another's output), so they run as one Promise.all instead of one
  // sequential round trip at a time. The two full-table-shaped rollups
  // (program progress, completed-training) are also pushed down to
  // Postgres (groupBy / a single joined COUNT) instead of materializing
  // every active/enrolled member's rows and aggregating in JS.
  const [
    enrolled,
    active,
    placed,
    inactive,
    enrolledMembers,
    programProgressGroups,
    completedTrainingCountRows,
    dropOffCount,
    assignments,
  ] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, enrolledProgram: { not: null }, ...memberUser },
    }),
    // "Active — currently training": an active member WITH an enrolled
    // program. The status alone counted 92 never-enrolled members and 6 staff
    // as "currently training" beside "Total enrolled 37" (S23).
    prisma.user.count({
      where: { deletedAt: null, memberStatus: 'active', enrolledProgram: { not: null }, ...memberUser },
    }),
    prisma.user.count({
      where: { deletedAt: null, memberStatus: 'placed', ...memberUser },
    }),
    prisma.user.count({
      where: { deletedAt: null, memberStatus: 'inactive', ...memberUser },
    }),
    // ── Enrollment trend (last 6 months) ──
    prisma.user.findMany({
      where: {
        deletedAt: null,
        enrolledProgram: { not: null },
        enrolledAt: { gte: sixMonthsAgo },
        ...memberUser,
      },
      select: { enrolledAt: true },
    }),
    // ── Training progress by program (active members only) ──
    // Grouped by the rollup's stored slug AND the learner's assigned program
    // so JS can canonicalise both and keep only rollups for the program the
    // member is actually enrolled in; alias slugs (comptia-a-plus) are folded
    // onto their canonical program instead of listing it twice (S24).
    prisma.$queryRaw<Array<{ program_slug: string; enrolled_program: string; avg_percent: number | null; member_count: bigint | number }>>`
      SELECT
        mpp.program_slug,
        u.enrolled_program,
        AVG(mpp.average_percent)::float AS avg_percent,
        COUNT(DISTINCT u.id)::bigint AS member_count
      FROM member_program_progress mpp
      INNER JOIN users u ON u.id = mpp.user_id
      ${memberJoin}
      WHERE u.deleted_at IS NULL
        AND u.member_status = 'active'
        AND u.enrolled_program IS NOT NULL
        ${orgFilterSql}
      GROUP BY mpp.program_slug, u.enrolled_program
    `,
    // ── Completed-training count: enrolled members whose exact completed
    // course count equals their immutable curriculum-version denominator.
    prisma.$queryRaw<Array<{ count: number }>>`
      WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
        VALUES ${validatedProgramCompletionValuesSql()}
      ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
        ${validatedProgramAssignmentRowsSql()}
      )
      SELECT COUNT(DISTINCT u.id)::int AS count
      FROM users u
      ${memberJoin}
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
        AND EXISTS (
          SELECT 1
          FROM validated_programs user_program
          WHERE user_program.storage_value = u.enrolled_program
            AND user_program.canonical_slug = enrolled_program.canonical_slug
        )
        ${orgFilterSql}
        AND mpp.courses_completed = progress_program.total_courses
    `,
    // ── Drop-off: members with staleTrainingDetectedAt set (S6: members only) ──
    prisma.user.count({
      where: { deletedAt: null, staleTrainingDetectedAt: { not: null }, ...memberUser },
    }),
    // ── Counselor load ──
    prisma.counselorAssignment.findMany({
      where: { active: true },
      select: {
        counselorId: true,
        memberId: true,
      },
    }),
  ]);

  const trendMap = new Map<string, EnrollmentTrend>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = monthFmt(d);
    trendMap.set(m, { month: m, monthLabel: monthLabel(d), count: 0 });
  }
  for (const u of enrolledMembers) {
    if (!u.enrolledAt) continue;
    const m = monthFmt(u.enrolledAt);
    const cur = trendMap.get(m);
    if (cur) cur.count += 1;
  }
  const enrollmentTrend = [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const programProgress = summarizeProgramProgress(
    programProgressGroups.map((g) => ({
      programSlug: g.program_slug,
      enrolledProgram: g.enrolled_program,
      avgPercent: g.avg_percent,
      memberCount: typeof g.member_count === 'bigint' ? Number(g.member_count) : g.member_count,
    })),
  );

  // ── Placement rate: placed / (placed + completed-training) ──
  const placedCount = placed;
  const completedCount = completedTrainingCountRows[0]?.count ?? 0;

  const placementRateDenominator = placedCount + completedCount;
  const placementRate: PlacementRate = {
    placed: placedCount,
    completedTraining: completedCount,
    rate: placementRateDenominator > 0 ? Math.round((placedCount / placementRateDenominator) * 100) : 0,
  };

  const counselorIds = Array.from(new Set(assignments.map((a) => a.counselorId)));
  const assignedMemberIds = new Set(assignments.map((a) => a.memberId));

  // Counselor name lookup and the unassigned-members count both depend only
  // on `assignments` (already resolved above), not on each other.
  const [counselorUsers, unassignedCount] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: counselorIds } },
      select: { id: true, fullName: true },
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        memberStatus: 'active',
        id: { notIn: [...assignedMemberIds] },
        ...memberUser,
      },
    }),
  ]);
  const counselorNameMap = new Map(counselorUsers.map((u) => [u.id, u.fullName ?? 'Unnamed counselor']));

  const counselorMap = new Map<string, { name: string; members: Set<string> }>();
  for (const a of assignments) {
    const name = counselorNameMap.get(a.counselorId) ?? 'Unnamed counselor';
    const cur = counselorMap.get(name) ?? { name, members: new Set<string>() };
    cur.members.add(a.memberId);
    counselorMap.set(name, cur);
  }
  const counselorLoad: CounselorLoad[] = [...counselorMap.values()].map((c) => ({
    counselorName: c.name,
    memberCount: c.members.size,
  })).sort((a, b) => b.memberCount - a.memberCount);

  return {
    memberStatus: { enrolled, active, placed, inactive },
    enrollmentTrend,
    programProgress,
    placementRate,
    dropOffCount,
    counselorLoad,
    unassignedCount,
  };
}
