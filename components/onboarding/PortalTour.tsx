'use client';

/**
 * Legacy path. The engine moved to the kit (`components/portal/kit/GuidedTour`);
 * this re-export keeps existing imports and specs working until they are
 * re-pointed and this file is retired.
 */
export { GuidedTour as default } from '@/components/portal/kit/GuidedTour';
export type { TourStep } from '@/lib/tours/registry';
