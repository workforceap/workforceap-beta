import type { Prisma } from '@prisma/client';

/**
 * The one partner lookup for an apply-funnel `ref` value: an ACTIVE partner in
 * the signup's organization whose referral code or slug matches. Signup
 * attribution (`app/api/apply/signup/route.ts`) and the partner disclosure
 * shown before signup (`lib/apply/partnerReferralDisclosure.ts`) both use it,
 * so an applicant is told about exactly the partner signup will attribute.
 *
 * `ref` must already be normalized (trimmed, lower-case).
 */
export function activeReferralPartnerWhere(ref: string, organizationId: string): Prisma.PartnerWhereInput {
  return {
    active: true,
    organizationId,
    OR: [{ referralCode: ref }, { slug: ref }],
  };
}
