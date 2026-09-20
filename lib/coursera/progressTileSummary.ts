import type { ProgramCourse } from '@/lib/content/programs';
import type { ProgramProgressReconciliation } from '@/lib/coursera/progressReconciliation';

/**
 * Numbers behind the two progress tiles on the admin member Overview (and any
 * funder-facing copy of them). Both tiles must read the same way to a funder
 * and to a member, so the arithmetic lives here rather than in JSX:
 *
 *  - the program tile counts syllabus courses (Coursera-delivered and
 *    WorkforceAP's own) that the reconciled local rows mark complete;
 *  - Coursera's Learning Path percentage is Coursera's figure for the path
 *    and is reported on its own line, never folded into a course count.
 */
export type ProgramCourseProgressSummary = {
  total: number;
  completed: number;
  courseraTotal: number;
  courseraCompleted: number;
  ownTotal: number;
  ownCompleted: number;
  inProgress: number;
};

export function isCourseraDeliveredCourse(course: Pick<ProgramCourse, 'kind' | 'courseraCourseId' | 'courseraSlug'>): boolean {
  if (course.kind === 'workforceap') return false;
  if (course.kind === 'coursera') return true;
  return Boolean(course.courseraCourseId?.trim() || course.courseraSlug?.trim());
}

/**
 * The lab / project / test-prep block every TWC syllabus carries. WorkforceAP
 * delivers it, so it is never a Coursera course: on the approved curricula it
 * is `kind: 'workforceap'`; on legacy-v1 it is the one unbound outline row
 * (lib/content/itSupportLabs.test.ts pins that it stays a plain outline).
 */
export function isWorkforceApLabRow(course: Pick<ProgramCourse, 'name' | 'kind' | 'courseraCourseId' | 'courseraSlug'>): boolean {
  return !isCourseraDeliveredCourse(course) && /\bLab\b/.test(course.name);
}

/**
 * Plain wording for the program tile so nobody wonders why Coursera's path
 * covers one course fewer than the program: the denominator keeps the lab
 * (Mike, 2026-09-20: "keep lab but call it out"). Null when the program has
 * no lab row, so surfaces can omit the line.
 */
export function describeCourseDenominator(courses: ReadonlyArray<Pick<ProgramCourse, 'name' | 'kind' | 'courseraCourseId' | 'courseraSlug'>>): string | null {
  const labs = courses.filter(isWorkforceApLabRow);
  if (labs.length === 0) return null;
  const total = courses.length;
  const coursera = total - labs.length;
  if (labs.length === 1) {
    return `${total} courses: ${coursera} on Coursera's learning path plus the WorkforceAP ${labs[0]!.name} (delivered by WorkforceAP, not part of the Coursera path).`;
  }
  return `${total} courses: ${coursera} on Coursera's learning path plus ${labs.length} WorkforceAP labs (delivered by WorkforceAP, not part of the Coursera path).`;
}

export function summarizeProgramCourseProgress(args: {
  courses: readonly ProgramCourse[];
  reconciliation: Pick<ProgramProgressReconciliation, 'rows'> | null | undefined;
}): ProgramCourseProgressSummary {
  const rowBySlug = new Map((args.reconciliation?.rows ?? []).map((row) => [row.courseSlug, row]));
  const summary: ProgramCourseProgressSummary = {
    total: args.courses.length,
    completed: 0,
    courseraTotal: 0,
    courseraCompleted: 0,
    ownTotal: 0,
    ownCompleted: 0,
    inProgress: 0,
  };
  for (const course of args.courses) {
    const coursera = isCourseraDeliveredCourse(course);
    if (coursera) summary.courseraTotal += 1;
    else summary.ownTotal += 1;
    const row = rowBySlug.get(course.slug);
    if (!row) continue;
    if (row.displayCompleted) {
      summary.completed += 1;
      if (coursera) summary.courseraCompleted += 1;
      else summary.ownCompleted += 1;
    } else if (row.displayPercent > 0 || row.localStatus === 'IN_PROGRESS') {
      summary.inProgress += 1;
    }
  }
  return summary;
}

/**
 * Coursera's own percentage for the Learning Path, rounded, or null when no
 * path row has been reported for the learner.
 */
export function learningPathPercent(
  rows: ReadonlyArray<{ overallProgress: number; isCompleted: boolean }> | null | undefined,
): number | null {
  const row = rows?.[0];
  if (!row) return null;
  if (row.isCompleted) return 100;
  const value = Number(row.overallProgress);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatProgramCoursesNote(summary: ProgramCourseProgressSummary): string {
  return `${summary.courseraCompleted} of ${summary.courseraTotal} Coursera · ${summary.ownCompleted} of ${summary.ownTotal} WorkforceAP · ${summary.inProgress} in progress`;
}

export function formatLearningPathLine(percent: number | null): string {
  return percent == null
    ? "Coursera learning path: not reported (Coursera's figure)"
    : `Coursera learning path: ${percent}% (Coursera's figure)`;
}
