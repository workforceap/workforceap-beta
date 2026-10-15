import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';
import { resolveTrainingProgressAssignment, type TrainingProgressEnrollment } from '@/lib/member/trainingProgress';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';

export type XapiCourseLogMember = {
  id: string;
  fullName: string;
  email: string;
  enrolledProgram: string | null;
  courseEnrollments: readonly TrainingProgressEnrollment[];
};

export type XapiCourseLogProgress = {
  userId: string;
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: string;
  percentComplete: number;
  lastUpdatedAt: Date;
  lastActivityAt: Date | null;
};

export type XapiCourseLogRow = Omit<XapiCourseLogProgress, 'lastUpdatedAt'> & {
  key: string;
  fullName: string;
  email: string;
  programTitle: string;
  courseName: string;
  lastUpdatedAt: Date | null;
};

/** Assigned syllabus rows and observed activity are distinct; reading never assigns a program. */
export function buildCourseraXapiCourseLog(
  members: readonly XapiCourseLogMember[],
  progressRows: readonly XapiCourseLogProgress[],
): XapiCourseLogRow[] {
  return members.flatMap((member) => {
    const observed = progressRows.filter((row) => row.userId === member.id);
    const assignment = resolveTrainingProgressAssignment(member.enrolledProgram, member.courseEnrollments);
    const program = assignment.programSlug ? getProgramBySlug(assignment.programSlug) : null;
    const courses = program && assignment.curriculumVersion
      ? getProgramCoursesForCurriculumVersion(program, assignment.curriculumVersion)
      : [];
    const used = new Set<XapiCourseLogProgress>();
    const assignedRows: XapiCourseLogRow[] = courses.map((course) => {
      const candidates = observed.filter((row) => {
        if (!assignment.programSlug || !programSlugsEquivalent(row.programSlug, assignment.programSlug)) return false;
        const courseId = normalizeCourseraCourseId(row.courseId);
        return courseId
          ? Boolean(course.courseraCourseId) && courseId === normalizeCourseraCourseId(course.courseraCourseId)
          : row.courseSlug === course.slug;
      });
      for (const row of candidates) used.add(row);
      const progress = candidates.sort((a, b) => {
        if ((a.status === 'COMPLETED') !== (b.status === 'COMPLETED')) return a.status === 'COMPLETED' ? -1 : 1;
        return b.percentComplete - a.percentComplete || b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime();
      })[0];
      return {
        key: `${member.id}:${assignment.programSlug}:${course.slug}`,
        userId: member.id,
        fullName: member.fullName,
        email: member.email,
        programSlug: assignment.programSlug!,
        programTitle: program!.title,
        courseSlug: course.slug,
        courseName: course.name,
        courseId: progress?.courseId ?? course.courseraCourseId ?? null,
        status: progress?.status ?? 'NOT_STARTED',
        percentComplete: progress?.status === 'COMPLETED' ? 100 : progress?.percentComplete ?? 0,
        lastUpdatedAt: progress?.lastUpdatedAt ?? null,
        lastActivityAt: progress?.lastActivityAt ?? null,
      };
    });
    const additionalObserved = observed.filter((row) => !used.has(row)).map((row) => {
      const observedProgram = getProgramBySlug(row.programSlug);
      const courseId = normalizeCourseraCourseId(row.courseId);
      const course = observedProgram?.courses.find((candidate) => courseId
        ? normalizeCourseraCourseId(candidate.courseraCourseId) === courseId
        : candidate.slug === row.courseSlug);
      return {
        ...row,
        key: `${member.id}:observed:${row.programSlug}:${row.courseSlug}`,
        fullName: member.fullName,
        email: member.email,
        programTitle: `${programDisplayTitle(row.programSlug)} · observed activity`,
        courseName: course?.name ?? row.courseSlug,
      };
    });
    return [...assignedRows, ...additionalObserved];
  });
}
