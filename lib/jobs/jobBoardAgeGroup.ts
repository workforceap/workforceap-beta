import { getAgeGroup, type AgeGroup } from '@/lib/util/ageCalculation';

/**
 * Which job board a signed-in member may see (WAP-260). Fails closed: a minor
 * must never land on the adult board because their profile could not be read
 * or has no date of birth.
 *
 * - The profile read failed → `youth14to17` (the most restrictive board that
 *   still lists jobs; under-14 shows none).
 * - A date of birth → the age it gives.
 * - No date of birth but `isMinor` → `youth14to17`.
 * - No profile row, or no date of birth and not a minor → `adult18plus` (the
 *   public board, as before).
 */
export type JobBoardProfile = { dob: Date | string | null; isMinor: boolean | null } | null;

export function resolveJobBoardAgeGroup(profile: JobBoardProfile | 'failed'): AgeGroup {
  if (profile === 'failed') return 'youth14to17';
  if (!profile) return 'adult18plus';
  if (profile.dob) return getAgeGroup(profile.dob);
  return profile.isMinor ? 'youth14to17' : 'adult18plus';
}

const RESTRICTIVENESS: Record<AgeGroup, number> = { adult18plus: 0, youth14to17: 1, under14: 2 };

/** The stricter of two age groups, so a request can tighten the board but never loosen it. */
export function stricterAgeGroup(a: AgeGroup, b: AgeGroup | null | undefined): AgeGroup {
  if (!b) return a;
  return RESTRICTIVENESS[b] > RESTRICTIVENESS[a] ? b : a;
}

export function isAgeGroup(value: unknown): value is AgeGroup {
  return value === 'under14' || value === 'youth14to17' || value === 'adult18plus';
}
