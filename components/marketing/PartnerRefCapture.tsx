'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  clearPersistedPartnerRef,
  persistPartnerRef,
} from '@/lib/apply/applyReferralCapture';

export type PartnerRefCaptureProps = {
  /**
   * `/apply` landing only. A bare visit (no `?ref=`) expires a prior partner
   * ref so a leftover school visit on a shared or family device cannot stamp
   * Concordia (etc.) onto an organic WorkforceAP signup.
   *
   * Every other door leaves a ref captured earlier in the funnel alone:
   * `/signup` is reached *after* `/apply?ref=` or an `/enroll/<slug>` CTA, and
   * clearing there would throw the attribution away at the last step.
   */
  clearWhenAbsent?: boolean;
};

/**
 * Persist `?ref=` for partner attribution (sessionStorage + first-party
 * cookie, via `persistPartnerRef`). Render-only; sibling of `<UtmCapture>`.
 * Mount it on any partner-landable door — `/apply` and `/signup` — so the
 * signup POST can carry `referralRef`.
 */
export default function PartnerRefCapture({ clearWhenAbsent = false }: PartnerRefCaptureProps) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const ref = searchParams?.get('ref');
    if (ref) {
      persistPartnerRef(ref);
    } else if (clearWhenAbsent) {
      clearPersistedPartnerRef();
    }
  }, [searchParams, clearWhenAbsent]);
  return null;
}
