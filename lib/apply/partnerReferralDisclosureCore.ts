/**
 * Pure half of the apply-funnel partner disclosure (no database import), so
 * client components and node:test suites can use it. The server resolver is
 * `lib/apply/partnerReferralDisclosure.ts`.
 */
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';
import {
  PARTNER_DISCLOSURE_VERSION,
  partnerDataAccess,
  type PartnerDataTier,
} from '@/lib/partner/dataAccess';

/**
 * What the browser needs to render the disclosure. The partner id stays on
 * the server; `ref` is the normalized code the disclosure was resolved for.
 */
export type PartnerReferralDisclosure = {
  ref: string;
  partnerName: string;
  tier: PartnerDataTier;
};

/** `apply_signup_completed` metadata keys for the acknowledgement. */
type PartnerDisclosureAckMetadata = {
  partner_disclosure_shown: boolean;
  partner_disclosure_partner_id?: string;
  partner_disclosure_tier?: PartnerDataTier;
  partner_disclosure_version?: string;
};

/**
 * Acknowledgement recorded with signup. "Shown" is true only when the ref
 * the form says it disclosed resolves to the same normalized ref signup
 * attributed — a client can never mark a different partner as disclosed,
 * and the partner id / tier always come from the server-side lookup.
 * Returns `{}` when no partner was attributed (organic signup).
 */
export function partnerDisclosureAcknowledgement(input: {
  attributedPartnerId: string | null;
  attributedPartnerType: string | null;
  attributedRef: string | null;
  shownRef: string | null | undefined;
}): PartnerDisclosureAckMetadata | Record<string, never> {
  if (!input.attributedPartnerId) return {};
  const attributed = normalizePartnerRef(input.attributedRef);
  const shown = normalizePartnerRef(input.shownRef);
  const wasShown = Boolean(attributed && shown && attributed === shown);
  return {
    partner_disclosure_shown: wasShown,
    partner_disclosure_partner_id: input.attributedPartnerId,
    partner_disclosure_tier: partnerDataAccess({ partnerType: input.attributedPartnerType }).tier,
    partner_disclosure_version: PARTNER_DISCLOSURE_VERSION,
  };
}
