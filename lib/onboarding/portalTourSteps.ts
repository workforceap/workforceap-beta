/**
 * Compatibility exports for the legacy `startTour(steps, portal)` callers
 * (`PortalEntryClient`, the member/employer/partner home pages). The source of
 * truth is `lib/tours/registry.ts`; copy lives in `messages/*.json` under
 * `tours.*` and is resolved by `components/portal/kit/GuidedTour`.
 */
import { TOUR_REGISTRY, toTourSteps, type TourStep } from '@/lib/tours/registry';

export type { TourStep };

export const MEMBER_PORTAL_TOUR_STEPS: TourStep[] = toTourSteps(TOUR_REGISTRY['member.home']);
export const EMPLOYER_PORTAL_TOUR_STEPS: TourStep[] = toTourSteps(TOUR_REGISTRY['employer.home']);
export const PARTNER_PORTAL_TOUR_STEPS: TourStep[] = toTourSteps(TOUR_REGISTRY['partner.home']);
