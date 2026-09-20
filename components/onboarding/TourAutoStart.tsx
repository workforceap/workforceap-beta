'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { isTourKey } from '@/lib/tours/registry';
import { useTour } from './TourContext';

/** Query parameter guide pages and emails use to deep-link a tour: `/counselor/today?tour=counselor.home`. */
export const TOUR_QUERY_PARAM = 'tour';
/** Lets the page's `data-tour` anchors mount before the engine looks for them. */
export const TOUR_DEEP_LINK_DELAY_MS = 400;

/**
 * Starts a registered tour when the URL carries `?tour=<key>`. Unknown keys
 * are ignored. Mounted once inside `TourProviderWrapper` (under Suspense,
 * because `useSearchParams` opts the tree into client rendering).
 */
export default function TourAutoStart() {
  const searchParams = useSearchParams();
  const requested = searchParams?.get(TOUR_QUERY_PARAM) ?? null;
  const { start } = useTour();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requested || handledRef.current === requested || !isTourKey(requested)) return;
    handledRef.current = requested;
    const timer = window.setTimeout(() => {
      start(requested);
    }, TOUR_DEEP_LINK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [requested, start]);

  return null;
}
