import type { ProgramCourse } from '@/lib/content/programs';
import { isProgramLevelCourseraId } from '@/lib/content/coursera/learningPaths';

export type CourseProgressReconcileRow = {
  courseraCourseId: string;
  courseSlug: string;
  b4bPercent: number | null;
  b4bCompleted: boolean | null;
  localPercent: number | null;
  localStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | null;
  displayPercent: number;
  displayCompleted: boolean;
  drift:
    | 'ok'
    | 'local_ahead'
    | 'b4b_ahead'
    | 'missing_b4b'
    | 'missing_local'
    | 'slug_mismatch';
};

export type LocalCourseProgressFact = {
  courseSlug: string;
  courseId?: string | null;
  percentComplete: number | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
};

export type B4BCourseProgressFact = {
  overallProgress: number;
  isCompleted: boolean;
};

export type ProgramProgressReconciliation = {
  rows: CourseProgressReconcileRow[];
  completedCount: number;
  totalCourses: number;
  programPercent: number;
  allComplete: boolean;
  providerCoverage: 'complete' | 'capped' | 'unavailable' | 'unknown';
  /** A provider-only average exists only after a complete read covering the syllabus. */
  authoritativeProviderPercent: number | null;
};

const LOCAL_STATUS_RANK: Record<LocalCourseProgressFact['status'], number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mergeLocalFacts(
  current: LocalCourseProgressFact | undefined,
  incoming: LocalCourseProgressFact,
): LocalCourseProgressFact {
  if (!current) return incoming;
  const status = LOCAL_STATUS_RANK[current.status] >= LOCAL_STATUS_RANK[incoming.status]
    ? current.status
    : incoming.status;
  return {
    courseSlug: current.courseSlug,
    courseId: current.courseId ?? incoming.courseId,
    percentComplete: status === 'COMPLETED'
      ? 100
      : Math.max(clampPercent(current.percentComplete), clampPercent(incoming.percentComplete)),
    status,
  };
}

export function reconcileProgramProgress(args: {
  validatedCourses: readonly ProgramCourse[];
  b4bProgress?: ReadonlyMap<string, B4BCourseProgressFact> & {
    coverage?: 'complete' | 'capped' | 'unavailable';
  };
  localRows: readonly LocalCourseProgressFact[];
}): ProgramProgressReconciliation {
  const localBySlug = new Map<string, LocalCourseProgressFact>();
  const localByCourseId = new Map<string, LocalCourseProgressFact>();
  for (const row of args.localRows) {
    // A local row keyed by a Learning Path or umbrella id holds Coursera's
    // program-level percentage, not a course's. It must not be credited to
    // any course, however a stale mapping once labelled its slug.
    if (isProgramLevelCourseraId(row.courseId)) continue;
    const mergedBySlug = mergeLocalFacts(localBySlug.get(row.courseSlug), row);
    localBySlug.set(row.courseSlug, mergedBySlug);
    if (row.courseId) {
      localByCourseId.set(
        row.courseId,
        mergeLocalFacts(localByCourseId.get(row.courseId), row),
      );
    }
  }

  const rows = args.validatedCourses.map((course): CourseProgressReconcileRow => {
    const courseraCourseId = course.courseraCourseId?.trim() ?? '';
    const exactLocal = localBySlug.get(course.slug);
    const idMatchedLocal = courseraCourseId ? localByCourseId.get(courseraCourseId) : undefined;
    const local = exactLocal && idMatchedLocal
      ? mergeLocalFacts(exactLocal, idMatchedLocal)
      : exactLocal ?? idMatchedLocal;
    const slugMismatch = !exactLocal && Boolean(idMatchedLocal);
    const b4b = courseraCourseId ? args.b4bProgress?.get(courseraCourseId) : undefined;

    const b4bPercent = b4b ? clampPercent(b4b.overallProgress) : null;
    const b4bCompleted = b4b ? b4b.isCompleted === true : null;
    const localPercent = local ? clampPercent(local.percentComplete) : null;
    const localStatus = local?.status ?? null;
    const localCompleted = localStatus === 'COMPLETED';
    const displayCompleted = b4bCompleted === true || localCompleted;
    const displayPercent = displayCompleted
      ? 100
      : b4bPercent ?? localPercent ?? 0;

    let drift: CourseProgressReconcileRow['drift'];
    if (slugMismatch) {
      drift = 'slug_mismatch';
    } else if (!b4b && local) {
      drift = 'missing_b4b';
    } else if (b4b && !local) {
      drift = 'missing_local';
    } else if (!b4b && !local) {
      drift = 'missing_b4b';
    } else {
      const normalizedB4B = b4bCompleted ? 100 : (b4bPercent ?? 0);
      const normalizedLocal = localCompleted ? 100 : (localPercent ?? 0);
      if (normalizedLocal > normalizedB4B) drift = 'local_ahead';
      else if (normalizedB4B > normalizedLocal) drift = 'b4b_ahead';
      else drift = 'ok';
    }

    return {
      courseraCourseId,
      courseSlug: course.slug,
      b4bPercent,
      b4bCompleted,
      localPercent,
      localStatus,
      displayPercent,
      displayCompleted,
      drift,
    };
  });

  const completedCount = rows.filter((row) => row.displayCompleted).length;
  const totalCourses = rows.length;
  const programPercent = totalCourses > 0
    ? Math.round(rows.reduce((sum, row) => sum + row.displayPercent, 0) / totalCourses)
    : 0;
  const providerCoverage = args.b4bProgress?.coverage ?? 'unknown';
  const authoritativeProviderPercent = providerCoverage === 'complete' && totalCourses > 0
    && rows.every((row) => row.b4bPercent !== null)
    ? Math.round(rows.reduce((sum, row) => sum + (row.b4bCompleted ? 100 : row.b4bPercent!), 0) / totalCourses)
    : null;

  return {
    rows,
    completedCount,
    totalCourses,
    programPercent,
    allComplete: totalCourses > 0 && completedCount === totalCourses,
    providerCoverage,
    authoritativeProviderPercent,
  };
}
