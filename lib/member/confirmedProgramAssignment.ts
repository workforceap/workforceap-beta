import type { Prisma } from '@prisma/client';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { resolveTrainingProgressAssignment, type TrainingProgressEnrollment } from './trainingProgress';

/** Keep every row: an unmarked historical row is not necessarily the current assignment. */
export const CONFIRMED_PROGRAM_ENROLLMENTS_SELECT = {
  orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }, { programSlug: 'asc' }],
  select: { programSlug: true, curriculumVersion: true, isPrimary: true, enrolledAt: true },
} as const satisfies Prisma.CourseEnrollmentFindManyArgs;

export type ConfirmedProgramMember = {
  enrolledProgram: string | null;
  enrolledAt?: Date | null;
  courseEnrollments: readonly (TrainingProgressEnrollment & { enrolledAt?: Date | null })[];
};

/** The existing assignment policy plus the date belonging to that exact assignment. */
export function resolveConfirmedProgramAssignment(member: ConfirmedProgramMember) {
  const assignment = resolveTrainingProgressAssignment(member.enrolledProgram, member.courseEnrollments);
  if (!assignment.programSlug) return { ...assignment, enrolledAt: null };
  const matching = member.courseEnrollments.find((row) => row.isPrimary && programSlugsEquivalent(row.programSlug, assignment.programSlug!))
    ?? member.courseEnrollments.find((row) => programSlugsEquivalent(row.programSlug, assignment.programSlug!));
  const legacyDate = member.enrolledProgram && programSlugsEquivalent(member.enrolledProgram, assignment.programSlug)
    ? member.enrolledAt ?? null : null;
  return { ...assignment, enrolledAt: matching?.enrolledAt ?? legacyDate };
}
