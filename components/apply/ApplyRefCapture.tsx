'use client';

import PartnerRefCapture from '@/components/marketing/PartnerRefCapture';

/**
 * Persist ?ref= for the apply funnel (signup attribution).
 * Bare `/apply` (no ref) clears client session/JS cookie so a prior school
 * visit cannot stamp Concordia (etc.) onto an organic WorkforceAP signup.
 *
 * The capture itself is shared with `/signup`; only the clear-on-bare-visit
 * rule is specific to the `/apply` landing page.
 */
export default function ApplyRefCapture() {
  return <PartnerRefCapture clearWhenAbsent />;
}
