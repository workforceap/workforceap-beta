import { prisma } from '@/lib/db/prisma';
import { GUIDED_TOURS_V2_FLAG, isFlagEnabledForUser } from '@/lib/feature-flags/isFlagEnabledForUser';
import { getTour, type TourKey } from './registry';
import { shouldOfferTour } from './offer';

export interface TourOffer {
  /** Registry key the shell should wire the Help menu and strip to. */
  key: TourKey;
  /** `guided_tours_v2` is on for this user: Help menu entry visible. */
  enabled: boolean;
  /** Show the first-login strip (enabled AND `shouldOfferTour`). */
  offer: boolean;
}

/**
 * Server-side tour gate for a persona layout (design §7): one flag read plus
 * one `user_tour_states` lookup for the caller. Never throws — a flag or DB
 * failure degrades to "nothing visible", which is the pre-flag behaviour, so a
 * tours outage cannot break the portal shell. Returns null for unknown keys.
 */
export async function getTourOffer(userId: string, tourKey: string): Promise<TourOffer | null> {
  const tour = getTour(tourKey);
  if (!tour) return null;
  try {
    const enabled = await isFlagEnabledForUser(GUIDED_TOURS_V2_FLAG, userId);
    if (!enabled) return { key: tour.key, enabled: false, offer: false };
    const state = await prisma.$transaction((tx) =>
      tx.userTourState.findUnique({
        where: { userId_tourKey: { userId, tourKey: tour.key } },
        select: { version: true, status: true, lastStep: true },
      }),
    );
    return { key: tour.key, enabled: true, offer: shouldOfferTour(tour, state) };
  } catch (error) {
    console.error('[tours] getTourOffer failed:', error);
    return { key: tour.key, enabled: false, offer: false };
  }
}
