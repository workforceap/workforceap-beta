import type { Program, ProgramCourse } from '@/lib/content/programs';
import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import {
  canonicalizeProgramSlug,
  programSlugReadCandidates,
} from '@/lib/content/programSlug';
import { LOOKUP_LIST_CAP } from '@/lib/db/queryCaps';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { isWorkforceApCourse } from '@/lib/content/courseDelivery';
import { getProgramCurriculumManifest } from '@/lib/content/programCurriculumManifest';
import {
  COURSERA_UMBRELLA_PROGRAM_ID,
  isProgramLevelCourseraId,
  isUmbrellaB4BProgramId,
} from '@/lib/content/coursera/learningPaths';

export { COURSERA_UMBRELLA_PROGRAM_ID, isProgramLevelCourseraId, isUmbrellaB4BProgramId };

type CourseDbRow = {
  programSlug?: string;
  courseSlug: string;
  name: string;
  estimatedHours: number | null;
  courseraCourseId: string | null;
  courseraSlug: string | null;
};

type CanonicalMappingRow = {
  courseraCourseId: string;
  canonicalProgramSlug: string;
  canonicalCourseSlug: string;
};

export type CourseraContentFact = {
  id: string;
  contentType: string;
  name?: string;
  slug?: string | null;
};

export type CourseraContentCatalogResult =
  | { status: 'available'; contents: CourseraContentFact[] }
  | { status: 'unavailable'; contents: [] };

export type ProgramCatalogHealth = {
  providerStatus: 'not_checked' | 'available' | 'unavailable';
  /** Coursera-delivered courses only; local WorkforceAP labs are reported separately. */
  syllabusCount: number;
  mappedCount: number;
  localCourseCount: number;
  providerCourseCount: number | null;
  validProviderCourseCount: number | null;
  invalidContentTypeIds: Array<{ id: string; contentType: string }>;
  additionalCourseraContents: CourseraContentFact[];
};

export type ValidatedProgramCourseList = {
  courses: ProgramCourse[];
  source: 'curriculum_assignment' | 'syllabus' | 'course_db' | 'static';
  unmappedSlugs: string[];
  staleCourseraIds: string[];
  catalogHealth: ProgramCatalogHealth;
};

export type ValidatedProgramCatalogEntry = ValidatedProgramCourseList & {
  programSlug: string;
  programTitle: string;
};

export type ProgramCourseListDependencies = {
  loadCourseDbRows(args: {
    organizationId: string;
    programSlugs: string[];
  }): Promise<CourseDbRow[]>;
  loadCanonicalMappingRows(args: {
    programSlugs: string[];
  }): Promise<CanonicalMappingRow[]>;
  loadCourseraContents(): Promise<CourseraContentCatalogResult>;
};

const defaultDependencies: ProgramCourseListDependencies = {
  async loadCourseDbRows({ organizationId, programSlugs }) {
    const { prisma } = await import('@/lib/db/prisma');
    return prisma.course.findMany({
      where: { organizationId, programSlug: { in: programSlugs } },
      orderBy: { displayOrder: 'asc' },
      select: {
        programSlug: true,
        courseSlug: true,
        name: true,
        estimatedHours: true,
        courseraCourseId: true,
        courseraSlug: true,
      },
    });
  },
  async loadCanonicalMappingRows({ programSlugs }) {
    const { prisma } = await import('@/lib/db/prisma');
    return prisma.courseraCanonicalCourseMapping.findMany({
      where: { canonicalProgramSlug: { in: programSlugs } },
      select: {
        courseraCourseId: true,
        canonicalProgramSlug: true,
        canonicalCourseSlug: true,
      },
    });
  },
  async loadCourseraContents() {
    const { listContents } = await import('@/lib/coursera/b4bClient');
    try {
      const contentsById = new Map<string, CourseraContentFact>();
      const visitedStarts = new Set<number>();
      let start = 0;

      while (true) {
        if (visitedStarts.has(start)) {
          throw new Error(`Coursera contents pagination repeated offset ${start}`);
        }
        visitedStarts.add(start);
        const page = await listContents({ start, limit: LOOKUP_LIST_CAP });
        for (const content of page.elements) {
          if (!content.id) continue;
          contentsById.set(content.id, {
            id: content.id,
            contentType: content.contentType?.trim() || 'Unknown',
            name: content.name?.trim() || undefined,
            slug: content.slug?.trim() || null,
          });
        }

        const next = page.paging.next;
        if (next == null) {
          const total = page.paging.total;
          const inferredNext = start + page.elements.length;
          if (Number.isFinite(total) && total != null && inferredNext < total) {
            if (page.elements.length === 0) {
              throw new Error('Coursera contents pagination ended before its reported total');
            }
            start = inferredNext;
            continue;
          }
          break;
        }
        if (!Number.isFinite(next) || next <= start) {
          throw new Error(`Coursera contents pagination returned invalid next offset ${next}`);
        }
        start = next;
      }

      return {
        status: 'available' as const,
        contents: Array.from(contentsById.values()),
      };
    } catch (error) {
      console.warn(
        '[coursera/programCourseList] listContents unavailable:',
        error instanceof Error ? error.message : 'unknown provider error',
      );
      return { status: 'unavailable' as const, contents: [] as [] };
    }
  },
};

function isMappedCourseraId(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length > 0 && !normalized.startsWith('TODO_');
}

function normalizeCourseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildValidatedProgramCourseList(args: {
  canonicalProgramSlug: string;
  program: Program;
  courseDbRows: CourseDbRow[];
  mappingRows: CanonicalMappingRow[];
  courseraCatalog: CourseraContentCatalogResult;
  shouldCheckB4B: boolean;
  curriculumVersion?: string | null;
}): ValidatedProgramCourseList {
  const {
    canonicalProgramSlug,
    program,
    courseDbRows,
    mappingRows,
    courseraCatalog,
    shouldCheckB4B,
    curriculumVersion,
  } = args;

  const hasPinnedCurriculum = Boolean(curriculumVersion?.trim());
  const hasImmutableCurriculumManifest = hasPinnedCurriculum && Boolean(
    getProgramCurriculumManifest(canonicalProgramSlug, curriculumVersion),
  );
  const useSyllabus = Boolean(program.syllabus) && !program.curriculumMigrationPending;
  const source: ValidatedProgramCourseList['source'] = hasPinnedCurriculum
    ? 'curriculum_assignment'
    : useSyllabus
      ? 'syllabus'
      : courseDbRows.length > 0
        ? 'course_db'
        : 'static';

  const baseCourses: ProgramCourse[] =
    source === 'curriculum_assignment'
      ? getProgramCoursesForCurriculumVersion(program, curriculumVersion)
      : source === 'course_db'
      ? courseDbRows.map((row) => ({
          slug: row.courseSlug,
          name: row.name,
          estimatedHours: row.estimatedHours ?? 10,
          courseraCourseId: row.courseraCourseId ?? undefined,
          courseraSlug: row.courseraSlug ?? undefined,
        }))
      : program.courses;

  const mappingByCourseSlug = new Map(
    (hasImmutableCurriculumManifest ? [] : mappingRows)
      .filter(
        (row) => canonicalizeProgramSlug(row.canonicalProgramSlug) === canonicalProgramSlug,
      )
      // Stale rows that map a Learning Path / umbrella id onto a course slot
      // are refused here so every reader of the validated list agrees.
      .filter((row) => !isProgramLevelCourseraId(row.courseraCourseId))
      .map((row) => [row.canonicalCourseSlug, row.courseraCourseId]),
  );
  const dbByCourseSlug = new Map(courseDbRows.map((row) => [row.courseSlug, row]));
  const discoveredCourses = DISCOVERED_COURSERA_PROGRAMS[canonicalProgramSlug]?.courses ?? [];
  const discoveredBySlug = new Map(discoveredCourses.map((course) => [course.slug, course]));
  const discoveredByName = new Map(
    discoveredCourses.map((course) => [normalizeCourseName(course.name), course]),
  );

  const courses = baseCourses.map((course) => {
    const dbRow = dbByCourseSlug.get(course.slug);
    const discovered =
      discoveredBySlug.get(course.slug) ?? discoveredByName.get(normalizeCourseName(course.name));
    const mappedId = mappingByCourseSlug.get(course.slug);
    const workforceApCourse = isWorkforceApCourse(course);
    const courseraCourseId = workforceApCourse
      ? undefined
      : (
          hasImmutableCurriculumManifest
            ? [course.courseraCourseId, mappedId, dbRow?.courseraCourseId, discovered?.courseId]
            : [mappedId, course.courseraCourseId, dbRow?.courseraCourseId, discovered?.courseId]
        ).find(isMappedCourseraId)?.trim();

    return {
      ...course,
      courseraCourseId,
      courseraSlug: workforceApCourse
        ? undefined
        : course.courseraSlug ?? dbRow?.courseraSlug ?? discovered?.slug,
    };
  });

  const providerCourses = courses.filter((course) => !isWorkforceApCourse(course));
  const localCourseCount = courses.length - providerCourses.length;
  const unmappedSlugs = providerCourses
    .filter((course) => !isMappedCourseraId(course.courseraCourseId))
    .map((course) => course.slug);

  const mappedCourses = providerCourses.filter((course) => isMappedCourseraId(course.courseraCourseId));
  const mappedIds = new Set(mappedCourses.map((course) => course.courseraCourseId as string));
  const providerStatus: ProgramCatalogHealth['providerStatus'] = !shouldCheckB4B
    ? 'not_checked'
    : courseraCatalog.status;
  const courseraContents = courseraCatalog.contents;
  const courseraById = new Map(courseraContents.map((content) => [content.id, content]));
  const staleCourseraIds = providerStatus === 'available'
    ? Array.from(mappedIds).filter((id) => !courseraById.has(id))
    : [];
  const invalidContentTypeIds = providerStatus === 'available'
    ? Array.from(mappedIds)
        .map((id) => courseraById.get(id))
        .filter((content): content is CourseraContentFact => Boolean(content))
        .filter(
          (content) =>
            content.id === COURSERA_UMBRELLA_PROGRAM_ID ||
            content.contentType.trim().toLowerCase() !== 'course',
        )
        .map((content) => ({ id: content.id, contentType: content.contentType }))
    : [];
  const additionalCourseraContents = providerStatus === 'available'
    ? courseraContents.filter((content) => !mappedIds.has(content.id))
    : [];
  const validProviderCourseCount = providerStatus === 'available'
    ? mappedCourses.filter((course) => {
        const id = course.courseraCourseId as string;
        const content = courseraById.get(id);
        return Boolean(
          content &&
          content.id !== COURSERA_UMBRELLA_PROGRAM_ID &&
          content.contentType.trim().toLowerCase() === 'course',
        );
      }).length
    : null;

  return {
    courses,
    source,
    unmappedSlugs,
    staleCourseraIds,
    catalogHealth: {
      providerStatus,
      syllabusCount: providerCourses.length,
      mappedCount: mappedCourses.length,
      localCourseCount,
      providerCourseCount:
        providerStatus === 'available'
          ? courseraContents.filter(
              (content) => content.contentType.trim().toLowerCase() === 'course',
            ).length
          : null,
      validProviderCourseCount,
      invalidContentTypeIds,
      additionalCourseraContents,
    },
  };
}

/**
 * Resolve the regulated WAP course list without ever using the shared B4B
 * umbrella's contents as the program denominator. B4B contents are only an
 * existence check for ids already bound to the WAP syllabus/catalog.
 */
export async function loadValidatedProgramCourses(
  args: {
    organizationId: string;
    programSlug: string;
    readOnlyAudit?: boolean;
    checkB4BContents?: boolean;
    curriculumVersion?: string | null;
  },
  dependencies: ProgramCourseListDependencies = defaultDependencies,
): Promise<ValidatedProgramCourseList> {
  const canonicalProgramSlug = canonicalizeProgramSlug(args.programSlug);
  const program = getProgramBySlug(canonicalProgramSlug);
  if (!program) {
    throw new Error(`Unknown WorkforceAP program: ${args.programSlug}`);
  }

  const programSlugs = programSlugReadCandidates(canonicalProgramSlug);
  const shouldCheckB4B = args.checkB4BContents !== false && !args.readOnlyAudit;

  const [courseDbRows, mappingRows, courseraCatalog] = await Promise.all([
    dependencies.loadCourseDbRows({
      organizationId: args.organizationId,
      programSlugs,
    }),
    dependencies.loadCanonicalMappingRows({ programSlugs }),
    shouldCheckB4B
      ? dependencies.loadCourseraContents()
      : Promise.resolve({ status: 'unavailable' as const, contents: [] as [] }),
  ]);

  return buildValidatedProgramCourseList({
    canonicalProgramSlug,
    program,
    courseDbRows,
    mappingRows,
    courseraCatalog,
    shouldCheckB4B,
    curriculumVersion: args.curriculumVersion,
  });
}

/**
 * Batch the admin catalog audit so the org page performs one tenant-scoped
 * Course read, one mapping read, and one paginated provider read. The provider
 * snapshot is then compared independently with each regulated WAP program.
 */
export async function loadValidatedProgramCatalog(
  args: {
    organizationId: string;
    programSlugs?: readonly string[];
    readOnlyAudit?: boolean;
    checkB4BContents?: boolean;
    curriculumVersionsByProgram?: Readonly<Record<string, string | null | undefined>>;
  },
  dependencies: ProgramCourseListDependencies = defaultDependencies,
): Promise<ValidatedProgramCatalogEntry[]> {
  const requestedSlugs = args.programSlugs ?? PROGRAMS.map((program) => program.slug);
  const programsBySlug = new Map<string, Program>();
  for (const requestedSlug of requestedSlugs) {
    const canonicalProgramSlug = canonicalizeProgramSlug(requestedSlug);
    const program = getProgramBySlug(canonicalProgramSlug);
    if (!program) throw new Error(`Unknown WorkforceAP program: ${requestedSlug}`);
    programsBySlug.set(program.slug, program);
  }

  const programs = Array.from(programsBySlug.values());
  const readCandidatesByProgram = new Map(
    programs.map((program) => [program.slug, programSlugReadCandidates(program.slug)]),
  );
  const allProgramSlugs = Array.from(
    new Set(Array.from(readCandidatesByProgram.values()).flat()),
  );
  const shouldCheckB4B = args.checkB4BContents !== false && !args.readOnlyAudit;
  const [allCourseDbRows, allMappingRows, courseraCatalog] = await Promise.all([
    dependencies.loadCourseDbRows({
      organizationId: args.organizationId,
      programSlugs: allProgramSlugs,
    }),
    dependencies.loadCanonicalMappingRows({ programSlugs: allProgramSlugs }),
    shouldCheckB4B
      ? dependencies.loadCourseraContents()
      : Promise.resolve({ status: 'unavailable' as const, contents: [] as [] }),
  ]);

  return programs.map((program) => {
    const readCandidates = new Set(readCandidatesByProgram.get(program.slug) ?? [program.slug]);
    const validated = buildValidatedProgramCourseList({
      canonicalProgramSlug: program.slug,
      program,
      courseDbRows: allCourseDbRows.filter(
        (row) => row.programSlug != null && readCandidates.has(row.programSlug.trim().toLowerCase()),
      ),
      mappingRows: allMappingRows.filter(
        (row) => canonicalizeProgramSlug(row.canonicalProgramSlug) === program.slug,
      ),
      courseraCatalog,
      shouldCheckB4B,
      curriculumVersion: args.curriculumVersionsByProgram?.[program.slug],
    });
    return {
      ...validated,
      programSlug: program.slug,
      programTitle: program.title,
    };
  });
}
