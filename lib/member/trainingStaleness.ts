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

export type TrainingStalenessInput = {
  /** Most recent saved training activity, across every course. */
  lastActivityAt: Date | null;
  /** When the member could first have started — the clock runs from here when nothing is saved yet. */
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
