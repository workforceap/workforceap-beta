import { Prisma } from '@prisma/client';
import { PROGRAM_SLUG_ALIASES } from '@/lib/content/programSlug';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';

// ECMAScript String.trim() WhiteSpace and LineTerminator characters. PostgreSQL's
// one-argument BTRIM strips only ASCII spaces, so it does not match our readers.
const PROGRAM_KEY_TRIM_CHARACTERS = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

/** Normalize an exact stored key, retaining finite catalog/alias validation at the join. */
export function normalizedProgramStorageKeySql(value: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`LOWER(BTRIM(${value}, ${PROGRAM_KEY_TRIM_CHARACTERS}))`;
}

/** SQL equivalent of canonicalizeProgramSlug; values remain bound parameters. */
export function canonicalProgramSlugSql(value: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE ${normalizedProgramStorageKeySql(value)}
    ${Prisma.join(Object.entries(PROGRAM_SLUG_ALIASES).map(([alias, canonical]) => Prisma.sql`WHEN ${alias} THEN ${canonical}`), ' ')}
    ELSE ${normalizedProgramStorageKeySql(value)} END`;
}

/**
 * One current assignment per user, matching resolveTrainingProgressAssignment.
 * Consumers retain their own tenant, member, lifecycle and period predicates.
 * Historical enrollment/placement reporting must keep its separate relation.
 */
export function confirmedCurrentProgramAssignmentsSql(): Prisma.Sql {
  const saved = canonicalProgramSlugSql(Prisma.sql`ce.program_slug`);
  const legacy = canonicalProgramSlugSql(Prisma.sql`u.enrolled_program`);
  return Prisma.sql`
    SELECT u.id AS user_id,
      CASE WHEN chosen.user_id IS NOT NULL THEN chosen.program_slug ELSE u.enrolled_program END AS program_slug,
      CASE WHEN chosen.user_id IS NOT NULL THEN chosen.curriculum_version ELSE ${LEGACY_CURRICULUM_VERSION} END AS curriculum_version,
      CASE WHEN chosen.user_id IS NOT NULL THEN COALESCE(chosen.enrolled_at,
        CASE WHEN ${canonicalProgramSlugSql(Prisma.sql`chosen.program_slug`)} = ${legacy} THEN u.enrolled_at END
      ) ELSE u.enrolled_at END AS enrolled_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT ce.user_id, ce.program_slug, ce.curriculum_version, ce.enrolled_at
      FROM course_enrollments ce
      WHERE ce.user_id = u.id AND (ce.is_primary OR ${saved} = ${legacy})
      ORDER BY ce.is_primary DESC, ce.enrolled_at DESC, ce.program_slug ASC
      LIMIT 1
    ) chosen ON true
    WHERE (chosen.user_id IS NOT NULL OR (
      u.enrolled_program IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM course_enrollments history WHERE history.user_id = u.id
      )
    )) AND (CASE WHEN chosen.user_id IS NOT NULL THEN chosen.program_slug ELSE u.enrolled_program END) <> ''
  `;
}
