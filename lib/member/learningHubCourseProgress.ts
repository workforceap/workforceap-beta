import type { CourseProgressStatus } from '@prisma/client';
import type { ProgramCourse } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';
import { isProgramLevelCourseraId } from '@/lib/content/coursera/learningPaths';
import { parseCourseGradeString, scoreScaledToDisplayPercent } from '@/lib/coursera/courseGradeDisplay';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';

type StoredCourseProgress = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: CourseProgressStatus;
  percentComplete: number;
  scoreScaled: number | null;
};

type StoredCourseraProgress = {
  programSlug: string;
  courseraCourseId: string;
  overallProgress: unknown;
  isCompleted: boolean;
  isRemovedFromProgram: boolean;
  courseGrade: string | null;
};

export type LearningHubCourseProgress = {
  status: CourseProgressStatus;
  percentComplete: number;
  gradePercent: number | null;
};

/** Read persisted facts against the courses from the member's pinned curriculum. */
export function buildLearningHubCourseProgress(args: {
  programSlug: string | null;
  courses: readonly ProgramCourse[];
  courseProgress: readonly StoredCourseProgress[];
  courseraProgress: readonly StoredCourseraProgress[];
}): {
  progressBySlug: Record<string, LearningHubCourseProgress>;
  completedSlugs: string[];
  enrolledCourseraCourseIds: string[];
} {
  const progressBySlug: Record<string, LearningHubCourseProgress> = {};
  if (!args.programSlug) return { progressBySlug, completedSlugs: [], enrolledCourseraCourseIds: [] };
  const programSlug = args.programSlug;
  const coursesBySlug = new Map(args.courses.map((course) => [course.slug, course]));
  const coursesById = new Map(args.courses.filter((course) => course.courseraCourseId)
    .map((course) => [normalizeCourseraCourseId(course.courseraCourseId), course]));
  const localRows = args.courseProgress.flatMap((row) => {
    if (!programSlugsEquivalent(row.programSlug, programSlug) || isProgramLevelCourseraId(row.courseId)) return [];
    const courseId = normalizeCourseraCourseId(row.courseId);
    // CourseProgress has no version column. A known provider id must belong
    // to this curriculum; a reused slug alone cannot credit a retired course.
    const course = courseId ? coursesById.get(courseId) : coursesBySlug.get(row.courseSlug);
    return course ? [{ ...row, courseSlug: course.slug }] : [];
  });
  const providerRows = args.courseraProgress.filter((row) =>
    programSlugsEquivalent(row.programSlug, programSlug)
    && !row.isRemovedFromProgram
    && coursesById.has(normalizeCourseraCourseId(row.courseraCourseId)),
  );
  // The loader orders newest first. Multiple external email identities can
  // resolve to one member; do not let an older snapshot overwrite the latest.
  const providerById = new Map<string, StoredCourseraProgress>();
  for (const row of providerRows) {
    const courseId = normalizeCourseraCourseId(row.courseraCourseId);
    if (!providerById.has(courseId)) providerById.set(courseId, row);
  }
  const providerFacts = new Map(args.courses.flatMap((course) => {
    const row = providerById.get(normalizeCourseraCourseId(course.courseraCourseId));
    return row && course.courseraCourseId
      ? [[course.courseraCourseId, { overallProgress: Number(row.overallProgress), isCompleted: row.isCompleted }] as const]
      : [];
  }));
  const reconciliation = reconcileProgramProgress({
    validatedCourses: args.courses,
    localRows,
    b4bProgress: providerFacts,
  });
  for (const row of reconciliation.rows) {
    const course = coursesBySlug.get(row.courseSlug)!;
    const courseId = normalizeCourseraCourseId(course.courseraCourseId);
    const local = localRows.find((candidate) => candidate.courseSlug === row.courseSlug)
      ?? localRows.find((candidate) => courseId && normalizeCourseraCourseId(candidate.courseId) === courseId);
    progressBySlug[row.courseSlug] = {
      status: row.displayCompleted ? 'COMPLETED'
        : row.localStatus === 'IN_PROGRESS' || row.displayPercent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      percentComplete: row.displayPercent,
      gradePercent: scoreScaledToDisplayPercent(local?.scoreScaled)
        ?? parseCourseGradeString(providerById.get(courseId)?.courseGrade),
    };
  }
  return {
    progressBySlug,
    completedSlugs: reconciliation.rows.filter((row) => row.displayCompleted).map((row) => row.courseSlug),
    enrolledCourseraCourseIds: args.courses.filter((course) =>
      providerById.has(normalizeCourseraCourseId(course.courseraCourseId)),
    ).map((course) => course.courseraCourseId!),
  };
}
