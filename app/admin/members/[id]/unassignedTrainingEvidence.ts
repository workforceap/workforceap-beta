import { findLearningPathById } from '@/lib/content/coursera/learningPaths';

export type AdminCourseProgressRow = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  lastUpdatedAt: Date;
};

export type AdminMemberProgramProgressRow = {
  programSlug: string;
  averagePercent: number;
  coursesCompleted: number;
  lastUpdatedAt: Date;
};

export type UnassignedTrainingEvidence = {
  programSlug: string;
  coursesCompleted: number;
  coursesWithProgress: number;
  averagePercent: number;
  lastActivityAt: Date | null;
};

/**
 * Best evidence of training for a member with no program assignment.
 *
 * Returns null unless some row actually shows activity, so a member with only
 * empty 0% rollups still reads "No program enrolled". Rollup and
 * course-progress evidence for the same slug are merged by taking the larger
 * completion count and preferring a non-zero rollup percentage; the strongest
 * slug wins (completions, then percentage, then recency). This never implies
 * an enrollment — the caller labels it as unassigned activity.
 */
export function summarizeUnassignedTrainingEvidence(
  rollups: readonly AdminMemberProgramProgressRow[],
  courseRows: readonly AdminCourseProgressRow[],
): UnassignedTrainingEvidence | null {
  const bySlug = new Map<string, UnassignedTrainingEvidence>();
  const percentSums = new Map<string, { sum: number; count: number }>();

  const entryFor = (programSlug: string): UnassignedTrainingEvidence => {
    const existing = bySlug.get(programSlug);
    if (existing) return existing;
    const created: UnassignedTrainingEvidence = {
      programSlug,
      coursesCompleted: 0,
      coursesWithProgress: 0,
      averagePercent: 0,
      lastActivityAt: null,
    };
    bySlug.set(programSlug, created);
    return created;
  };

  for (const row of courseRows) {
    if (!row.programSlug) continue;
    // A Learning Path id is Coursera's program-level percentage, never a
    // course; it is excluded from the assigned-program view above and must
    // not become evidence of a course here either.
    if (findLearningPathById(row.courseId)) continue;
    const completed = row.status === 'COMPLETED';
    const percent = completed ? 100 : Math.max(0, Math.min(100, row.percentComplete ?? 0));
    if (!completed && percent <= 0 && row.status !== 'IN_PROGRESS') continue;
    const entry = entryFor(row.programSlug);
    if (completed) entry.coursesCompleted += 1;
    entry.coursesWithProgress += 1;
    const sums = percentSums.get(row.programSlug) ?? { sum: 0, count: 0 };
    sums.sum += percent;
    sums.count += 1;
    percentSums.set(row.programSlug, sums);
    if (row.lastUpdatedAt && (!entry.lastActivityAt || row.lastUpdatedAt > entry.lastActivityAt)) {
      entry.lastActivityAt = row.lastUpdatedAt;
    }
  }

  for (const [programSlug, sums] of percentSums) {
    const entry = bySlug.get(programSlug);
    if (entry && sums.count > 0) entry.averagePercent = Math.round(sums.sum / sums.count);
  }

  for (const rollup of rollups) {
    if (!rollup.programSlug) continue;
    const rollupCompleted = rollup.coursesCompleted ?? 0;
    const rollupPercent = Math.max(0, Math.min(100, Math.round(rollup.averagePercent ?? 0)));
    if (rollupCompleted <= 0 && rollupPercent <= 0) continue;
    const entry = entryFor(rollup.programSlug);
    entry.coursesCompleted = Math.max(entry.coursesCompleted, rollupCompleted);
    entry.coursesWithProgress = Math.max(entry.coursesWithProgress, rollupCompleted);
    if (rollupPercent > entry.averagePercent) entry.averagePercent = rollupPercent;
    if (rollup.lastUpdatedAt && (!entry.lastActivityAt || rollup.lastUpdatedAt > entry.lastActivityAt)) {
      entry.lastActivityAt = rollup.lastUpdatedAt;
    }
  }

  const candidates = [...bySlug.values()].filter(
    (entry) => entry.coursesCompleted > 0 || entry.averagePercent > 0,
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.coursesCompleted !== a.coursesCompleted) return b.coursesCompleted - a.coursesCompleted;
    if (b.averagePercent !== a.averagePercent) return b.averagePercent - a.averagePercent;
    return (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
  });
  return candidates[0];
}
