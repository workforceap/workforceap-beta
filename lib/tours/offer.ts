import type { TourDefinition, TourStatus } from './registry';

/** The subset of a `UserTourState` row the offer decision reads. */
export interface TourStateSnapshot {
  version: number;
  status: TourStatus | string;
  lastStep?: number;
}

/**
 * Whether a persona shell should still offer a tour (first-login strip).
 *
 * - No row: the person has never seen it → offer.
 * - Row older than the registry version: the tour changed enough to re-tour → offer.
 * - Row at the current version: they finished it, dismissed it, or dismissed
 *   the strip (recorded as DISMISSED at step 0) → never offer again. A STARTED
 *   row at the current version means they began but made no decision (closed
 *   the tab mid-tour), so the strip keeps offering until they do.
 *
 * The Help menu is not gated on this: reopening a finished or dismissed tour
 * is exactly what it is for.
 */
export function shouldOfferTour(tour: TourDefinition, state: TourStateSnapshot | null | undefined): boolean {
  if (!state) return true;
  if (state.version < tour.version) return true;
  return state.status === 'STARTED';
}
