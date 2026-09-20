import type { CourseProgressStatus } from '@prisma/client';

import {
  computeCourseProgressUpdate,
  type ExistingCourseProgress,
  type MergedCourseProgress,
} from '@/lib/coursera/b4bSync';
import { findLearningPathById } from '@/lib/content/coursera/learningPaths';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

export type CanonicalCourseProgressMapping = {
  programSlug: string;
  courseSlug: string;
};

export type CourseraProgressPromotionRow = {
  courseraCourseId: string;
  overallProgress: number;
  isCompleted: boolean;
  enrollmentTime: Date | null;
  classStartTime: Date | null;
  lastActivityTime: Date | null;
  completionTime: Date | null;
  courseGrade: string | null;
};

export type PlannedCourseraProgressPromotion = {
  programSlug: string;
  courseSlug: string;
  courseId: string;
  merged: MergedCourseProgress;
  existing: ExistingCourseProgress;
  completedAt: Date | null;
  scoreScaled: number | null;
  startedAt: Date | null;
  updateStartedAt: Date | null;
};

/**
 * A raw `coursera_course_progress` row whose id is a registered Learning Path
 * carries Coursera's program-level percentage. Promotion must skip it: the
 * only course slot it could ever land in is a synthetic one such as
 * "Lab, Project, and Test Preparation", which would then display the path
 * percentage as progress on a WorkforceAP course.
 */
export function isLearningPathProgressRow(
  row: Pick<CourseraProgressPromotionRow, 'courseraCourseId'>,
): boolean {
  return findLearningPathById(row.courseraCourseId) !== null;
}

/** Parse Coursera CSV/B4B grades into CourseProgress's 0..1 score scale. */
export function parseCourseraGradeScore(raw: string | null | undefined): number | null {
  const value = raw?.trim();
  if (!value || !/^[0-9]+(?:\.[0-9]+)?\s*%?\s*$/.test(value)) return null;

  const numeric = Number(value.replace(/%\s*$/, '').trim());
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

/**
 * Produce the exact write that identity promotion must feed to
 * `upsertMergedCourseProgress`. Keeping this transformation pure makes the
 * no-downgrade rule independently testable instead of hiding it in raw SQL.
 */
export function planCourseraProgressPromotion(args: {
  row: CourseraProgressPromotionRow;
  mapping: CanonicalCourseProgressMapping;
  existing: {
    status: CourseProgressStatus;
    percentComplete: number;
    lastActivityAt: Date | null;
  } | null;
}): PlannedCourseraProgressPromotion {
  const { row, mapping, existing } = args;
  const programSlug = canonicalizeProgramSlug(mapping.programSlug);
  const courseSlug = mapping.courseSlug.trim();
  const courseId = row.courseraCourseId.trim();

  if (!programSlug || !courseSlug || !courseId) {
    throw new Error('Canonical Coursera promotion requires program, course, and Coursera ids');
  }
  if (isLearningPathProgressRow(row)) {
    throw new Error(
      `Coursera Learning Path ${courseId} is program-level progress and cannot be promoted onto course ${programSlug}/${courseSlug}`,
    );
  }

  const merged = computeCourseProgressUpdate(existing, {
    isCompleted: row.isCompleted,
    overallProgress: row.overallProgress,
    lastActivityAt: row.lastActivityTime?.getTime() ?? null,
  });
  const startedAt = row.classStartTime ?? row.enrollmentTime;

  return {
    programSlug,
    courseSlug,
    courseId,
    merged,
    existing,
    completedAt: row.completionTime,
    scoreScaled: parseCourseraGradeScore(row.courseGrade),
    startedAt,
    updateStartedAt: startedAt,
  };
}
