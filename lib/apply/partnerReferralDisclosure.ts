import { prisma } from '@/lib/db/prisma';
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';
import { partnerDataAccess } from '@/lib/partner/dataAccess';
import { activeReferralPartnerWhere } from '@/lib/partner/referralPartnerLookup';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
import type { HeadersLike } from '@/lib/tenant/resolveOrgFromRequest';
import type { PartnerReferralDisclosure } from '@/lib/apply/partnerReferralDisclosureCore';

/**
 * Resolve the partner an apply-funnel `ref` would be attributed to, with the
 * same organization and active-partner lookup signup uses
 * (`activeReferralPartnerWhere`). The partner name always comes from the
 * database — a client-supplied name is never accepted. Unknown, inactive or
 * other-organization refs resolve to null, so no disclosure is shown and
 * signup attributes nothing either.
 */
export async function resolvePartnerReferralDisclosure(
  rawRef: string | null | undefined,
  context: { headers?: HeadersLike; programSlug?: string | null } = {},
): Promise<PartnerReferralDisclosure | null> {
  const ref = normalizePartnerRef(rawRef);
  if (!ref) return null;
  try {
    const organizationId = await resolveProvisionOrganizationId({
      headers: context.headers,
      programSlug: context.programSlug ?? null,
    });
    const partner = await prisma.partner.findFirst({
      where: activeReferralPartnerWhere(ref, organizationId),
      select: { name: true, partnerType: true },
    });
    if (!partner?.name?.trim()) return null;
    return {
      ref,
      partnerName: partner.name.trim(),
      tier: partnerDataAccess(partner).tier,
    };
  } catch (error) {
    // The disclosure must never block the apply funnel; signup re-resolves.
    console.warn('[apply] partner disclosure lookup failed', error instanceof Error ? error.message : error);
    return null;
  }
}
