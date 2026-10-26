import 'server-only';

import {
  findCanonicalMappingForCourseraCourse,
  type CanonicalMappingHit,
  type CanonicalMappingIndex,
} from '@/lib/coursera/canonicalMapping';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { getProgramBySlug, type Program } from '@/lib/content/programs';
import { COURSERA_TITLE_LOOSE_MIN_LEN, normalizeTitleForMatch } from '@/lib/member/courseraSkillsetMerge';
import {
  APPROVED_CURRICULUM_VERSION,
  normalizeCourseraCourseId,
} from '@/lib/content/programCurriculumManifest';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { resolveCurriculumMappingsForCourse } from '@/lib/coursera/curriculumMapping';
import { catalogCourseDisplayName } from '@/lib/coursera/courseDisplayName';

// Re-export so existing call sites (`@/lib/member/programCourseMatch`)
// continue to find these names. The actual implementation lives in
// `@/lib/coursera/canonicalMapping` so it can be loaded by modules that
// can't `import 'server-only'` (e.g. `b4bSync.ts` under node --test).
export type { CanonicalMappingHit, CanonicalMappingIndex } from '@/lib/coursera/canonicalMapping';
export {
  findCanonicalMappingForCourseraCourse,
  loadCanonicalMappingsForCourseraIds,
} from '@/lib/coursera/canonicalMapping';

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Resolve a program course from any combination of identifiers we have for
 *  it. Order of preference:
 *    1. Coursera courseId (from context.extensions) — exact, stable, the only
 *       reliable join key for xAPI traffic.
 *    2. Slug match on the local catalog (for manual member-driven completion).
 *    3. Course display name (CSV import paths, partial xAPI events).
 *
 *  Lookup #1 needs the program slug too because the same Coursera course IDs
 *  are scoped to a specific Coursera Program; we resolve them through
 *  DISCOVERED_COURSERA_PROGRAMS, which lives next to the catalog of WAP
 *  programs. */
export function resolveProgramCourse(
  program: Program,
  args: {
    courseSlug?: string;
    courseName?: string;
    courseraCourseId?: string | null;
    enrolledProgramSlug?: string;
  }
): { slug: string; name: string } | null {
  if (args.courseraCourseId && args.enrolledProgramSlug) {
    const normalizedCourseId = normalizeCourseraCourseId(args.courseraCourseId);
    const assignedCourse = program.courses.find(
      (course) => normalizeCourseraCourseId(course.courseraCourseId) === normalizedCourseId,
    );
    if (assignedCourse) return { slug: assignedCourse.slug, name: assignedCourse.name };

    const disc = DISCOVERED_COURSERA_PROGRAMS[args.enrolledProgramSlug];
    const needle = normalizedCourseId;
    const byCourseraId = disc?.courses.find(
      (course) => normalizeCourseraCourseId(course.courseId) === needle,
    );
    if (byCourseraId) {
      // Confirm the matched slug exists in the WAP program catalog before
      // returning — keeps the contract that a returned course is a real entry
      // in `program.courses` (consumers index into it for slug + name).
      const inProgram = program.courses.find((c) => c.slug === byCourseraId.slug);
      if (inProgram) return { slug: inProgram.slug, name: inProgram.name };
      // Fall back to the discovered metadata's name when the WAP catalog row
      // doesn't carry a separate display string.
      return { slug: byCourseraId.slug, name: byCourseraId.name };
    }
  }

  if (args.courseSlug) {
    const requestedSlug = args.courseSlug.trim();
    const requestedSlugNormalized = normalizeSlug(requestedSlug);
    const bySlug = program.courses.find((course) =>
      course.slug === requestedSlug
      || normalizeSlug(course.slug) === requestedSlugNormalized
      || normalizeSlug(course.name) === requestedSlugNormalized
    );
    if (bySlug) return { slug: bySlug.slug, name: bySlug.name };
  }

  if (args.courseName) {
    const target = normalizeText(args.courseName);
    const targetSlug = normalizeSlug(args.courseName);
    const byName = program.courses.find((course) =>
      normalizeText(course.name) === target || normalizeSlug(course.name) === targetSlug
    );
    if (byName) return { slug: byName.slug, name: byName.name };

    const looseTarget = normalizeTitleForMatch(args.courseName);
    if (looseTarget.length >= COURSERA_TITLE_LOOSE_MIN_LEN) {
      const loose = program.courses.find((course) => {
        const candidate = normalizeTitleForMatch(course.name);
        return (
          candidate.length >= COURSERA_TITLE_LOOSE_MIN_LEN &&
          (looseTarget.includes(candidate) || candidate.includes(looseTarget))
        );
      });
      if (loose) return { slug: loose.slug, name: loose.name };
    }
  }

  return null;
}

/**
 * Fallback resolver that also searches the Coursera discovered catalog.
 * Used by xAPI pipeline + course-completion path when the portal program
 * course list doesn't match Coursera's actual course names/slugs.
 *
 * Lookup order (FIRST hit wins):
 *
 *   1. Admin-curated DB mapping in `coursera_canonical_course_mappings`,
 *      matched by `courseraCourseId` (or `courseSlug` if courseId is
 *      missing). This is the row created by the inline "Map this" action
 *      on `/admin/training-progress` and lets admins fix unmapped courses
 *      without a code change. Mirrors the SQL JOIN in
 *      `csvImport.server.ts:promoteCsvProgressToCanonical`.
 *
 *   2. Static `DISCOVERED_COURSERA_PROGRAMS` catalog scoped to the
 *      member's enrolled program (`resolveProgramCourse`).
 *
 *   3. Slug / display-name match against the WAP catalog
 *      (`lib/content/programs.ts`) via `resolveProgramCourse`.
 *
 *   4. Per-program discovered-catalog fuzzy fallback.
 *
 *   5. Null.
 *
 * Async because step #1 hits the DB. The two consumers
 * (`upsertCourseProgressFromXapiStatement`, `completeMemberCourse`) are
 * already in async server-side context. B4B sync paths use
 * `loadCanonicalMappingsForCourseraIds` directly — see
 * `lib/coursera/b4bSync.ts` and `lib/coursera/syncUserFromB4B.ts`.
 */
export async function resolveProgramCourseWithCatalogFallback(
  program: Program,
  args: {
    courseSlug?: string;
    courseName?: string;
    courseraCourseId?: string | null;
    enrolledProgramSlug?: string;
  },
  options?: {
    /** Pre-loaded mapping index (for batched callers). When omitted we fall
     *  back to a single per-call DB lookup. */
    canonicalMappings?: CanonicalMappingIndex;
    curriculumVersion?: string | null;
  },
): Promise<{ slug: string; name: string } | null> {
  const curriculumVersion = options?.curriculumVersion?.trim() || null;
  const assignedProgram = curriculumVersion
    ? {
        ...program,
        courses: getProgramCoursesForCurriculumVersion(program, curriculumVersion),
      }
    : program;

  if (curriculumVersion === APPROVED_CURRICULUM_VERSION) {
    const exactProviderId = normalizeCourseraCourseId(args.courseraCourseId);
    const versioned = await resolveCurriculumMappingsForCourse({
      courseraCourseId: exactProviderId,
      courseraCourseSlug: args.courseSlug,
      assignments: [{ programSlug: program.slug, curriculumVersion }],
    });
    const target = versioned.targets.find((candidate) => candidate.programSlug === program.slug);
    if (target) {
      const assignedCourse = assignedProgram.courses.find(
        (course) => course.slug === target.courseSlug,
      );
      if (assignedCourse) return { slug: assignedCourse.slug, name: assignedCourse.name };
    }

    // Approved curricula are pinned to exact provider ids. If Coursera sent
    // an id and that id did not resolve inside this program/version, do not
    // credit it through a coincidentally matching slug, title, or fuzzy name.
    // Slug/name fallback remains available only for WorkforceAP-authored
    // manual completions, which intentionally carry no provider id.
    if (exactProviderId) return null;
  }

  // Step 1: admin-curated DB mapping wins outright. This is what makes the
  // inline "Map this" admin action take effect for xAPI/B4B traffic without
  // a redeploy. Same source-of-truth as the SQL JOIN in
  // promoteCsvProgressToCanonical — keep these two paths consistent.
  const courseraCourseId = normalizeCourseraCourseId(args.courseraCourseId) || null;
  const courseraCourseSlug = args.courseSlug?.trim() || null;
  let dbHit: CanonicalMappingHit | null = null;
  if (curriculumVersion !== APPROVED_CURRICULUM_VERSION && options?.canonicalMappings) {
    if (courseraCourseId) {
      dbHit = options.canonicalMappings.byCourseraCourseId.get(courseraCourseId) ?? null;
    }
    if (!dbHit && courseraCourseSlug) {
      dbHit = options.canonicalMappings.byCourseraCourseSlug.get(courseraCourseSlug) ?? null;
    }
  } else if (
    curriculumVersion !== APPROVED_CURRICULUM_VERSION &&
    (courseraCourseId || courseraCourseSlug)
  ) {
    dbHit = await findCanonicalMappingForCourseraCourse({
      courseraCourseId,
      courseraCourseSlug,
    });
  }
  if (dbHit) {
    // Keep the mapped slug: progress, live-event and points deduplication
    // depend on it. Resolve a missing title by exact provider ID instead of
    // presenting a legacy synthetic slug as the course or qualification.
    return {
      slug: dbHit.courseSlug,
      name: catalogCourseDisplayName({ ...dbHit, courseraCourseId }) ?? dbHit.courseSlug,
    };
  }

  // Step 2 + 3: existing portal/discovered/slug behavior.
  const fromProgram = resolveProgramCourse(assignedProgram, args);
  if (fromProgram) return fromProgram;

  // A pinned approved curriculum is closed over its manifest. Never revive a
  // retired discovered course through fuzzy matching.
  if (curriculumVersion === APPROVED_CURRICULUM_VERSION) return null;

  // Step 4: per-program discovered-catalog fuzzy fallback.
  const discovered = DISCOVERED_COURSERA_PROGRAMS[program.slug];
  if (!discovered) return null;

  if (args.courseraCourseId) {
    const needle = args.courseraCourseId.trim();
    const byCourseraId = discovered.courses.find((course) => course.courseId === needle);
    if (byCourseraId) return { slug: byCourseraId.slug, name: byCourseraId.name };
  }

  if (args.courseSlug) {
    const requestedSlug = args.courseSlug.trim();
    const requestedSlugNormalized = normalizeSlug(requestedSlug);
    const bySlug = discovered.courses.find((course) =>
      course.slug === requestedSlug
      || normalizeSlug(course.slug) === requestedSlugNormalized
      || normalizeSlug(course.name) === requestedSlugNormalized
    );
    if (bySlug) return { slug: bySlug.slug, name: bySlug.name };
  }

  if (args.courseName) {
    const target = normalizeText(args.courseName);
    const targetSlug = normalizeSlug(args.courseName);
    const byName = discovered.courses.find((course) =>
      normalizeText(course.name) === target || normalizeSlug(course.name) === targetSlug
    );
    if (byName) return { slug: byName.slug, name: byName.name };

    const looseTarget = normalizeTitleForMatch(args.courseName);
    if (looseTarget.length >= COURSERA_TITLE_LOOSE_MIN_LEN) {
      const loose = discovered.courses.find((course) => {
        const candidate = normalizeTitleForMatch(course.name);
        return (
          candidate.length >= COURSERA_TITLE_LOOSE_MIN_LEN &&
          (looseTarget.includes(candidate) || candidate.includes(looseTarget))
        );
      });
      if (loose) return { slug: loose.slug, name: loose.name };
    }
  }

  return null;
}
