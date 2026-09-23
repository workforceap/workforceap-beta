/**
 * One staleness threshold for "this member's training has stalled".
 *
 * The number is not new: it is the 14 days
 * `isTrainingStaleForCounselorEscalation` already uses on the member program
 * page and `lib/admin/trainingDashboard.ts` uses for the staff training
 * roster. It lives here, in a dependency-free module, so the member dashboard
 * home loader can reuse it without pulling in the `server-only` program view.
 */

/** Days without training activity before a member's progress counts as stalled. */
export const STALE_TRAINING_ACTIVITY_DAYS = 14;

const STALE_TRAINING_ACTIVITY_MS = STALE_TRAINING_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * When the member could first have opened training: the later of being
 * enrolled and having finished the preassessment, and only once both are
 * true. Before that there is nothing to be late for, so there is no baseline
 * and nothing is stale.
 *
 * The retired `?ui=legacy` branch of `app/(portal)/dashboard/page.tsx`
 * computed this inline for `isTrainingStaleForCounselorEscalation`. It lives
 * here because the member dashboard home needs the identical answer — a member who enrolled
 * 60 days ago but finished the assessment yesterday is on day one of being
 * able to start, and the two surfaces must not disagree about that.
 */
export function trainingEligibleSince(input: {
  /** Resolved program slug, or null when staff has not assigned one. */
  enrolledProgram: string | null | undefined;
  assessmentCompleted: boolean | null | undefined;
  enrolledAt: Date | null | undefined;
  assessmentCompletedAt: Date | null | undefined;
}): Date | null {
  if (!input.enrolledProgram || !input.assessmentCompleted) return null;
  const enrolledMs = input.enrolledAt?.getTime() ?? 0;
  const assessedMs = input.assessmentCompletedAt?.getTime() ?? 0;
  const latest = Math.max(enrolledMs, assessedMs);
  return latest > 0 ? new Date(latest) : null;
}

export type TrainingStalenessInput = {
  /** Most recent saved training activity, across every course. */
  lastActivityAt: Date | null;
  /** From {@link trainingEligibleSince}; the clock runs from here when nothing is saved yet. */
  eligibleSince: Date | null;
  /** Already flagged by the stale-training cron; trust it rather than recomputing. */
  staleDetectedAt?: Date | null;
  now?: Date;
};

/**
 * Mirrors `lib/admin/trainingDashboard.ts`'s `isStale`: a member is stale when
 * the cron has already flagged them, or when the time since their last saved
 * activity — or since they became able to start, if there is none — is past
 * the threshold. With neither date on file nothing is known, so nothing is
 * claimed.
 */
export function isTrainingActivityStale(input: TrainingStalenessInput): boolean {
  if (input.staleDetectedAt) return true;
  const baseline = input.lastActivityAt ?? input.eligibleSince;
  if (!baseline) return false;
  const now = input.now ? input.now.getTime() : Date.now();
  return now - baseline.getTime() > STALE_TRAINING_ACTIVITY_MS;
}
