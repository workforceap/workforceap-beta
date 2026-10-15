import { Prisma } from '@prisma/client';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { canonicalProgramSlugSql } from './currentProgramAssignment';

export function resolvePlacementEnrollment(
  enrollments: readonly { programSlug: string; enrolledAt: Date }[],
  placedAt: Date,
  legacyProgram: string | null,
  legacyDate: Date | null,
  recordedProgram: string | null = null,
): { programSlug: string; enrolledAt: Date | null } | null {
  const history = enrollments.length > 0 ? enrollments
    : legacyProgram ? [{ programSlug: legacyProgram, enrolledAt: legacyDate }] : [];
  const chosen = history.filter((row) => !recordedProgram || programSlugsEquivalent(row.programSlug, recordedProgram))
    .slice().sort((a, b) => {
      const eligibleA = a.enrolledAt && a.enrolledAt <= placedAt ? 1 : 0;
      const eligibleB = b.enrolledAt && b.enrolledAt <= placedAt ? 1 : 0;
      return eligibleB - eligibleA || (b.enrolledAt?.getTime() ?? -Infinity) - (a.enrolledAt?.getTime() ?? -Infinity)
        || a.programSlug.localeCompare(b.programSlug);
    })[0];
  return chosen ? { programSlug: chosen.programSlug, enrolledAt: chosen.enrolledAt } : null;
}

/** Historical reporting uses each real enrollment's own date, even after active selection is cleared. */
export function historicalProgramEnrollmentsSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT ce.user_id, ce.program_slug, ce.curriculum_version, ce.enrolled_at
    FROM course_enrollments ce
    UNION ALL
    SELECT u.id, u.enrolled_program, ${LEGACY_CURRICULUM_VERSION}, u.enrolled_at
    FROM users u WHERE u.enrolled_program IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = u.id)
  `;
}

/** Preserve historical placement attribution, independently of today's primary assignment. */
export function placementEnrollmentAttributionSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT pr.id AS placement_id, chosen.program_slug, chosen.enrolled_at
    FROM placement_records pr
    JOIN LATERAL (
      SELECT history.program_slug, history.enrolled_at
      FROM (${historicalProgramEnrollmentsSql()}) history
      WHERE history.user_id = pr.user_id
        AND (pr.program_slug IS NULL OR ${canonicalProgramSlugSql(Prisma.sql`history.program_slug`)} = ${canonicalProgramSlugSql(Prisma.sql`pr.program_slug`)})
      ORDER BY (history.enrolled_at <= pr.placed_at) DESC NULLS LAST,
        history.enrolled_at DESC NULLS LAST, history.program_slug ASC
      LIMIT 1
    ) chosen ON true
  `;
}

/** A date and program history signal must belong to the same saved enrollment. */
export function enrollmentHistoryWhere(range?: { gte: Date; lte?: Date } | null): Prisma.UserWhereInput {
  return { OR: [
    { courseEnrollments: { some: range ? { enrolledAt: range } : {} } },
    { courseEnrollments: { none: {} }, enrolledProgram: { not: null }, ...(range ? { enrolledAt: range } : {}) },
  ] };
}
