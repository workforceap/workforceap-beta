/**
 * Seed `coursera_canonical_course_mappings` from the existing program catalog
 * (`courses` table). For every Course row that has a real Coursera course id —
 * i.e. not empty and not a `TODO_*` placeholder — upsert a canonical mapping
 * pointing the Coursera course id at the canonical (programSlug, courseSlug).
 *
 * Why this exists: in a fresh / partially-migrated environment the
 * `coursera_canonical_course_mappings` table can be empty, in which case every
 * inbound xAPI statement falls into the `completion_status='unresolved_course'` bucket (`'ignored'` before WAP-276)
 * (see `lib/xapi/inboundStatementPipeline.ts`) and never promotes to
 * `course_progress`. The /admin/coursera/health page flags this in red. Rather
 * than ask an operator to manually click "Map this" once per course in the
 * catalog, this routine derives the entire mapping table from data already
 * sitting in `courses` — Course.programSlug + Course.courseSlug + the real
 * Coursera id we already typed in.
 *
 * Idempotent. Running twice is safe: each row is upserted on the unique
 * `courseraCourseId` column, and `updatedAt` is the only thing that moves on
 * a no-op re-run.
 *
 * Wired up at:
 *   - POST /api/admin/coursera/seed-canonical-mappings-from-catalog
 *   - components/admin/SeedCanonicalMappingsButton.tsx
 *
 * Intentionally does NOT `import 'server-only'` for the same reason as
 * `lib/coursera/canonicalMapping.ts` — keeps the module loadable from
 * `node --test` without having to stub the marker.
 */

import { prisma } from '@/lib/db/prisma';
import { LOOKUP_CATALOG_CAP } from '@/lib/db/scanCaps';

export type SeedCanonicalMappingsSummary = {
  /** Number of `Course` rows scanned (regardless of whether they had a Coursera id). */
  scanned: number;
  /** Newly-created `CourseraCanonicalCourseMapping` rows. */
  upsertedCreated: number;
  /** Existing rows whose target (programSlug, courseSlug, courseraCourseSlug) was refreshed. */
  upsertedUpdated: number;
  /** Course rows skipped because `courseraCourseId` was empty, missing, or a `TODO_…` placeholder. */
  skippedPlaceholder: number;
  /** Course rows skipped because their `programSlug` was unexpectedly empty. */
  skippedNoProgram: number;
};

/**
 * Returns true when the Coursera course id is missing or is a known
 * placeholder. The PR #1116 CI guard specifically blocks `TODO_courseId_<N>`,
 * but we're a bit broader here on purpose: any string starting with `TODO_`
 * (case-insensitive) is treated as a placeholder so an admin who left a
 * `TODO_FILL_ME_IN` note in the catalog doesn't accidentally seed a mapping
 * that would silently swallow xAPI events under a bogus key.
 */
function isPlaceholderCourseraCourseId(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return trimmed.toUpperCase().startsWith('TODO_');
}

/**
 * Walks the `courses` table and upserts a `CourseraCanonicalCourseMapping`
 * for every course with a real Coursera course id. See the file-level
 * comment for the broader story.
 *
 * @param actorUserId — optional user id stamped onto newly-created rows via
 *   the `createdById` audit column. Updates do not touch `createdById` so we
 *   preserve the original author when an admin re-runs the seed.
 */
export async function seedCanonicalMappingsFromCatalog(
  args: { actorUserId?: string | null } = {},
): Promise<SeedCanonicalMappingsSummary> {
  const actorUserId = args.actorUserId ?? null;

  const courses = await prisma.course.findMany({
    take: LOOKUP_CATALOG_CAP,
    select: {
      programSlug: true,
      courseSlug: true,
      courseraCourseId: true,
      courseraSlug: true,
    },
  });

  const summary: SeedCanonicalMappingsSummary = {
    scanned: courses.length,
    upsertedCreated: 0,
    upsertedUpdated: 0,
    skippedPlaceholder: 0,
    skippedNoProgram: 0,
  };

  // De-duplicate: more than one Course row could (in principle) point at the
  // same Coursera id. The mapping table is keyed by `courseraCourseId` so we
  // need to pick a single Course per id — last-write-wins on iteration order
  // is fine since our upsert is idempotent and the catalog is small.
  const seenCourseraIds = new Set<string>();

  for (const course of courses) {
    if (isPlaceholderCourseraCourseId(course.courseraCourseId)) {
      summary.skippedPlaceholder += 1;
      continue;
    }
    if (!course.programSlug || course.programSlug.trim().length === 0) {
      summary.skippedNoProgram += 1;
      continue;
    }

    // Non-null assertion is safe: isPlaceholderCourseraCourseId returned false.
    const courseraCourseId = course.courseraCourseId!.trim();
    if (seenCourseraIds.has(courseraCourseId)) {
      // Already handled this courseraCourseId via an earlier Course row.
      // Don't touch the count — the second row was a duplicate, not a skip.
      continue;
    }
    seenCourseraIds.add(courseraCourseId);

    const courseraCourseSlug =
      typeof course.courseraSlug === 'string' && course.courseraSlug.trim().length > 0
        ? course.courseraSlug.trim()
        : null;

    // We can't tell from a single `upsert` whether the row already existed,
    // so do a cheap pre-check first. Scale: this runs once per course at
    // admin click, not in a hot path.
    const existing = await prisma.courseraCanonicalCourseMapping.findUnique({
      where: { courseraCourseId },
      select: { id: true },
    });

    await prisma.courseraCanonicalCourseMapping.upsert({
      where: { courseraCourseId },
      create: {
        courseraCourseId,
        courseraCourseSlug,
        canonicalProgramSlug: course.programSlug,
        canonicalCourseSlug: course.courseSlug,
        notes: 'Auto-seeded from program catalog',
        createdById: actorUserId,
      },
      update: {
        courseraCourseSlug,
        canonicalProgramSlug: course.programSlug,
        canonicalCourseSlug: course.courseSlug,
        // Deliberately do NOT touch `notes` or `createdById` on update — an
        // admin may have hand-edited the note, and we don't want to overwrite
        // a manually-curated row's audit trail when the auto-seeder runs.
      },
    });

    if (existing) {
      summary.upsertedUpdated += 1;
    } else {
      summary.upsertedCreated += 1;
    }
  }

  return summary;
}
