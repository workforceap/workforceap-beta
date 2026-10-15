import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { resolveTrainingProgressAssignment, type TrainingProgressEnrollment } from '@/lib/member/trainingProgress';

/** Count one confirmed current assignment per member; observed/history-only rows do not assign one. */
export function countConfirmedProgramEnrollments(members: ReadonlyArray<{
  enrolledProgram: string | null;
  courseEnrollments: readonly TrainingProgressEnrollment[];
}>): Array<{ programSlug: string; count: number }> {
  const counts = new Map<string, number>();
  for (const member of members) {
    const assignment = resolveTrainingProgressAssignment(member.enrolledProgram, member.courseEnrollments ?? []);
    if (!assignment.programSlug) continue;
    const programSlug = canonicalizeProgramSlug(assignment.programSlug);
    counts.set(programSlug, (counts.get(programSlug) ?? 0) + 1);
  }
  return Array.from(counts, ([programSlug, count]) => ({ programSlug, count }));
}
