import { getCoursesForProgram } from '@/lib/content/courseSkillMap';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

/** Catalog course length for one program. Estimates only: never daily attendance. */
export type ProgramCourseEstimate = { coursesTotal: number; estimatedHours: number };

export function programCourseEstimate(programSlug: string | null): ProgramCourseEstimate | null {
  if (!programSlug) return null;
  const courses = getCoursesForProgram(canonicalizeProgramSlug(programSlug));
  if (courses.length === 0) return null;
  return {
    coursesTotal: courses.length,
    estimatedHours: courses.reduce((sum, course) => sum + course.estimatedHours, 0),
  };
}
