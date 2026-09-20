import { prisma } from '@/lib/db/prisma';
import { LOOKUP_CATALOG_CAP } from '@/lib/db/scanCaps';
import {
  LEGACY_CURRICULUM_VERSION,
  APPROVED_CURRICULUM_VERSION,
  getProgramCurriculumManifest,
  normalizeCourseraCourseId,
} from '@/lib/content/programCurriculumManifest';
import { findLearningPathById } from '@/lib/content/coursera/learningPaths';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import {
  emptyCanonicalMappingIndex,
  loadCanonicalMappingsForCourseraIds,
  type CanonicalMappingIndex,
} from '@/lib/coursera/canonicalMapping';
import {
  selectCurriculumMappingTargets,
  type CurriculumAssignment,
  type CurriculumMappingResolution,
  type CurriculumMappingTarget,
} from '@/lib/member/curriculumAssignment';

export type CurriculumMappingRow = {
  courseraCourseId: string;
  courseraCourseSlug: string | null;
  canonicalProgramSlug: string;
  curriculumVersion: string;
  canonicalCourseSlug: string;
};

export type CurriculumMappingIndex = {
  byCourseraCourseId: Map<string, CurriculumMappingTarget[]>;
  byCourseraCourseSlug: Map<string, CurriculumMappingTarget[]>;
};

export function emptyCurriculumMappingIndex(): CurriculumMappingIndex {
  return {
    byCourseraCourseId: new Map(),
    byCourseraCourseSlug: new Map(),
  };
}

/**
 * A deployment can briefly run new application code before the additive
 * curriculum-mapping migration reaches the database. Treat only that narrow
 * compatibility window as an empty v2 index so legacy mappings keep working;
 * every other database error must remain visible.
 */
export function isMissingCurriculumMappingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === 'P2021') return true;
  return (
    error instanceof Error
    && /coursera_curriculum_course_mappings.*(?:does not exist|not exist)/i.test(error.message)
  );
}

export function buildCurriculumMappingIndex(
  rows: readonly CurriculumMappingRow[],
): CurriculumMappingIndex {
  const index = emptyCurriculumMappingIndex();
  for (const row of rows) {
    const providerId = normalizeCourseraCourseId(row.courseraCourseId);
    if (!providerId) continue;
    if (row.curriculumVersion === APPROVED_CURRICULUM_VERSION) {
      const manifestCourse = getProgramCurriculumManifest(
        row.canonicalProgramSlug,
        APPROVED_CURRICULUM_VERSION,
      )?.courses.find((course) => course.slug === row.canonicalCourseSlug);
      if (
        !manifestCourse
        || manifestCourse.kind !== 'coursera'
        || normalizeCourseraCourseId(manifestCourse.courseraCourseId) !== providerId
        || manifestCourse.courseraSlug !== row.courseraCourseSlug?.trim()
      ) {
        // The learner's assignment is immutable, so the corresponding exact
        // version mapping must be immutable too. Refuse drifted DB rows even
        // if an operator bypassed the append-only database trigger.
        continue;
      }
    }
    const target: CurriculumMappingTarget = {
      courseraCourseId: providerId,
      programSlug: row.canonicalProgramSlug,
      curriculumVersion: row.curriculumVersion,
      courseSlug: row.canonicalCourseSlug,
    };
    appendUnique(index.byCourseraCourseId, providerId, target);
    const providerSlug = row.courseraCourseSlug?.trim();
    if (providerSlug) appendUnique(index.byCourseraCourseSlug, providerSlug, target);
  }
  return index;
}

function appendUnique(
  map: Map<string, CurriculumMappingTarget[]>,
  key: string,
  target: CurriculumMappingTarget,
) {
  const current = map.get(key) ?? [];
  const targetKey = `${target.programSlug}|${target.curriculumVersion}|${target.courseSlug}`;
  if (
    !current.some(
      (candidate) =>
        `${candidate.programSlug}|${candidate.curriculumVersion}|${candidate.courseSlug}` ===
        targetKey,
    )
  ) {
    current.push(target);
  }
  map.set(key, current);
}

export async function loadCurriculumMappingsForCourseraIds(
  ids: ReadonlyArray<string | null | undefined>,
): Promise<CurriculumMappingIndex> {
  const normalizedIds = Array.from(
    new Set(ids.map(normalizeCourseraCourseId).filter((id) => id.length > 0)),
  );
  if (normalizedIds.length === 0) return emptyCurriculumMappingIndex();

  const delegate = (prisma as unknown as {
    courseraCurriculumCourseMapping?: {
      findMany: typeof prisma.courseraCurriculumCourseMapping.findMany;
    };
  }).courseraCurriculumCourseMapping;
  if (!delegate?.findMany) return emptyCurriculumMappingIndex();

  try {
    const rows = await delegate.findMany({
      take: LOOKUP_CATALOG_CAP,
      where: { courseraCourseId: { in: normalizedIds } },
      select: {
        courseraCourseId: true,
        courseraCourseSlug: true,
        canonicalProgramSlug: true,
        curriculumVersion: true,
        canonicalCourseSlug: true,
      },
    });
    return buildCurriculumMappingIndex(rows);
  } catch (error) {
    if (isMissingCurriculumMappingTableError(error)) {
      return emptyCurriculumMappingIndex();
    }
    throw error;
  }
}

export async function resolveCurriculumMappingsForCourse(args: {
  courseraCourseId?: string | null;
  courseraCourseSlug?: string | null;
  assignments: readonly CurriculumAssignment[];
  index?: CurriculumMappingIndex;
}): Promise<CurriculumMappingResolution> {
  const providerId = normalizeCourseraCourseId(args.courseraCourseId);
  const providerSlug = args.courseraCourseSlug?.trim() ?? '';
  const index =
    args.index ??
    (providerId
      ? await loadCurriculumMappingsForCourseraIds([providerId])
      : emptyCurriculumMappingIndex());
  const candidates = curriculumCandidatesForProvider({
    providerId,
    providerSlug,
    index,
  });
  return selectCurriculumMappingTargets({ candidates, assignments: args.assignments });
}

function curriculumCandidatesForProvider(args: {
  providerId: string;
  providerSlug: string;
  index: CurriculumMappingIndex;
}): CurriculumMappingTarget[] {
  if (args.providerId) {
    return args.index.byCourseraCourseId.get(args.providerId) ?? [];
  }
  return args.providerSlug
    ? args.index.byCourseraCourseSlug.get(args.providerSlug) ?? []
    : [];
}

/**
 * Produce every legacy candidate for a provider course without letting the
 * first static catalog hit choose a program. An admin-curated DB mapping still
 * overrides the static row for that same canonical program, while static rows
 * for other programs remain candidates for assignment-aware fan-out.
 */
export function legacyCandidatesForProviderCourse(args: {
  courseraCourseId?: string | null;
  courseraCourseSlug?: string | null;
  canonicalIndex?: CanonicalMappingIndex;
}): CurriculumMappingTarget[] {
  const rawProviderId = args.courseraCourseId?.trim() ?? '';
  const providerId = normalizeCourseraCourseId(rawProviderId);
  const providerSlug = args.courseraCourseSlug?.trim() ?? '';
  if ((!providerId && !providerSlug) || rawProviderId.startsWith('TODO_')) return [];
  // A Learning Path id is program-level progress, never a course. The
  // canonical table once carried the IBM AI + Software Developer path as a
  // "course-17" mapping, which wrote Coursera's path percentage onto the
  // program's own "Lab, Project, and Test Preparation" slot. Refuse the id
  // here so no stale row can do that again through any promotion path.
  if (findLearningPathById(providerId)) return [];

  const canonicalIndex = args.canonicalIndex ?? emptyCanonicalMappingIndex();
  const dbHit = providerId
    ? canonicalIndex.byCourseraCourseId.get(rawProviderId)
      ?? canonicalIndex.byCourseraCourseId.get(providerId)
      ?? null
    : canonicalIndex.byCourseraCourseSlug.get(providerSlug) ?? null;
  const dbProgramSlug = dbHit
    ? canonicalizeProgramSlug(dbHit.programSlug)
    : null;
  const candidates: CurriculumMappingTarget[] = [];

  if (dbHit && providerId) {
    candidates.push({
      courseraCourseId: providerId,
      programSlug: dbProgramSlug!,
      curriculumVersion: LEGACY_CURRICULUM_VERSION,
      courseSlug: dbHit.courseSlug,
    });
  }

  for (const [rawProgramSlug, program] of Object.entries(
    DISCOVERED_COURSERA_PROGRAMS,
  )) {
    const programSlug = canonicalizeProgramSlug(rawProgramSlug);
    if (dbProgramSlug === programSlug) continue;
    for (const course of program.courses) {
      const courseProviderId = normalizeCourseraCourseId(course.courseId);
      const matches = providerId
        ? courseProviderId === providerId
        : course.slug === providerSlug;
      if (!matches || !courseProviderId) continue;
      candidates.push({
        courseraCourseId: courseProviderId,
        programSlug,
        curriculumVersion: LEGACY_CURRICULUM_VERSION,
        courseSlug: course.slug,
      });
    }
  }

  return candidates;
}

/**
 * Unified provider-course resolver used by B4B and no-enrollment xAPI paths.
 * It unions approved versioned mappings with all safe legacy DB/static
 * candidates, then performs one assignment intersection across the union.
 * This is intentionally not an approved-first ladder: a learner assigned to
 * approved DBA and legacy Software must receive both legitimate targets.
 */
export async function resolveProviderCourseMappings(args: {
  courseraCourseId?: string | null;
  courseraCourseSlug?: string | null;
  assignments: readonly CurriculumAssignment[];
  curriculumIndex?: CurriculumMappingIndex;
  canonicalIndex?: CanonicalMappingIndex;
  /** B4B-only compatibility: allow one unambiguous unassigned legacy program. */
  allowLegacyDiscovery?: boolean;
  /**
   * WAP program of the Coursera Learning Path the row was taken under
   * (`lib/coursera/learningPathAttribution.ts`). An assignment match is still
   * authoritative, but when nothing assigned matches, only candidates inside
   * this program may be discovered: Coursera has said which path the learner
   * is on, so a shared course must not conjure an enrollment in a neighbour
   * program. Null or undefined leaves discovery unrestricted.
   */
  collectionProgramSlug?: string | null;
}): Promise<CurriculumMappingResolution> {
  const rawProviderId = args.courseraCourseId?.trim() ?? '';
  const providerId = normalizeCourseraCourseId(rawProviderId);
  const providerSlug = args.courseraCourseSlug?.trim() ?? '';
  if (!providerId && !providerSlug) {
    return { targets: [], status: 'unmapped' };
  }
  const collectionProgram = args.collectionProgramSlug?.trim()
    ? canonicalizeProgramSlug(args.collectionProgramSlug)
    : null;
  const insideCollectionProgram = (candidate: CurriculumMappingTarget) =>
    collectionProgram === null
    || canonicalizeProgramSlug(candidate.programSlug) === collectionProgram;

  const [curriculumIndex, canonicalIndex] = await Promise.all([
    args.curriculumIndex
      ? Promise.resolve(args.curriculumIndex)
      : loadCurriculumMappingsForCourseraIds([providerId]),
    args.canonicalIndex
      ? Promise.resolve(args.canonicalIndex)
      : loadCanonicalMappingsForCourseraIds([rawProviderId, providerId]),
  ]);
  const candidates = [
    ...curriculumCandidatesForProvider({
      providerId,
      providerSlug,
      index: curriculumIndex,
    }),
    ...legacyCandidatesForProviderCourse({
      courseraCourseId: rawProviderId || providerId,
      courseraCourseSlug: providerSlug,
      canonicalIndex,
    }),
  ];
  if (args.assignments.length === 0) {
    // Detached/no-enrollment events may promote one unique legacy target, but
    // never opt themselves into an approved-v2 curriculum while its external
    // track is dormant. Cross-program legacy reuse remains ambiguous/raw-only.
    return selectCurriculumMappingTargets({
      candidates: candidates.filter(
        (candidate) =>
          candidate.curriculumVersion === LEGACY_CURRICULUM_VERSION
          && insideCollectionProgram(candidate),
      ),
      assignments: [],
    });
  }

  const assigned = selectCurriculumMappingTargets({
    candidates,
    assignments: args.assignments,
  });
  // An exact assignment intersection is authoritative. Provider content is
  // frequently reused across programs, so discovering an adjacent program
  // after a match would create a phantom CourseEnrollment from one shared
  // course id. Discovery is only a fallback when nothing assigned matched.
  if (assigned.targets.length > 0) {
    return assigned;
  }
  if (!args.allowLegacyDiscovery) return assigned;

  // With no exact assignment match, only one unambiguous legacy target may be
  // provider-discovered. A v2 assignment blocks its own legacy/off-manifest
  // candidate but does not globally suppress a different legacy program.
  const approvedPrograms = new Set(
    args.assignments
      .filter(
        (assignment) =>
          assignment.curriculumVersion === APPROVED_CURRICULUM_VERSION,
      )
      .map((assignment) => canonicalizeProgramSlug(assignment.programSlug)),
  );
  return selectCurriculumMappingTargets({
    candidates: candidates.filter(
      (candidate) =>
        candidate.curriculumVersion === LEGACY_CURRICULUM_VERSION &&
        !approvedPrograms.has(canonicalizeProgramSlug(candidate.programSlug)) &&
        insideCollectionProgram(candidate),
    ),
    assignments: [],
  });
}
