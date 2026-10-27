import { getDiscoveredProgram, getProgramBySlug } from '@/lib/content/programs';
import { normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';

/** Resolve a display label without changing an already-attributed course identity. */
export function catalogCourseDisplayName(input: {
  programSlug: string;
  courseSlug: string;
  courseraCourseId?: string | null;
}): string | null {
  const program = getProgramBySlug(input.programSlug);
  const discovered = getDiscoveredProgram(input.programSlug);
  const namedBySlug = program?.courses.find((course) => course.slug === input.courseSlug)?.name
    ?? discovered?.courses.find((course) => course.slug === input.courseSlug)?.name;
  if (namedBySlug?.trim()) return namedBySlug.trim();

  // Older admin mappings retain synthetic course-N slugs. The provider ID
  // can recover their title, but only inside the already-attributed program.
  // Caller-supplied display text and other programs never establish a name.
  const id = normalizeCourseraCourseId(input.courseraCourseId);
  if (!id) return null;
  const namedById = program?.courses.find(
    (course) => normalizeCourseraCourseId(course.courseraCourseId) === id,
  )?.name ?? discovered?.courses.find(
    (course) => normalizeCourseraCourseId(course.courseId) === id,
  )?.name;
  return namedById?.trim() || null;
}
