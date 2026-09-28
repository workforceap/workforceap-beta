import { prisma } from '@/lib/db/prisma';
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';
import { activeReferralPartnerWhere } from '@/lib/partner/referralPartnerLookup';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
import type { HeadersLike } from '@/lib/tenant/resolveOrgFromRequest';
import { getActivePrograms } from '@/lib/platform/programCatalog';
import { partnerShareRef } from '@/lib/partner/shareLinks';
import { partnerDataAccess, type PartnerDataTier } from '@/lib/partner/dataAccess';

export type PartnerLandingProgram = {
  slug: string;
  title: string;
  category: string;
  duration: string | null;
  certifications: string[];
};

export type PartnerLandingModel = {
  name: string;
  /** Normalized code carried as `?ref=` into `/apply`. */
  ref: string;
  /** Drives the "what {partner} will see" disclosure on the page. */
  tier: PartnerDataTier;
  programs: PartnerLandingProgram[];
};

const MAX_PROGRAMS = 6;

/**
 * The public `/join/<code>` landing page model, or null (404) for an unknown,
 * inactive, pending-approval, rejected or other-organization partner.
 *
 * Uses the signup lookup (`activeReferralPartnerWhere`, same organization
 * resolution) so the page never invites an applicant under a ref that signup
 * would then drop, and additionally requires `status = 'active'`: a partner
 * that has not been approved gets no public page.
 */
export async function resolvePartnerLanding(
  rawCode: string,
  context: { headers?: HeadersLike } = {},
): Promise<PartnerLandingModel | null> {
  const ref = normalizePartnerRef(rawCode);
  if (!ref) return null;
  const organizationId = await resolveProvisionOrganizationId({ headers: context.headers });
  const partner = await prisma.partner.findFirst({
    where: { ...activeReferralPartnerWhere(ref, organizationId), status: 'active' },
    select: { name: true, slug: true, referralCode: true, partnerType: true },
  });
  if (!partner?.name?.trim()) return null;

  const catalog = await getActivePrograms(organizationId).catch(() => []);
  const programs = [...catalog]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.displayOrder - b.displayOrder)
    .slice(0, MAX_PROGRAMS)
    .map((p) => ({
      slug: p.slug,
      title: p.static?.title ?? p.name,
      category: p.static?.categoryLabel ?? p.category,
      duration: p.static?.duration ?? p.duration,
      certifications: p.certifications.slice(0, 2),
    }));

  return {
    name: partner.name.trim(),
    ref: partnerShareRef(partner),
    tier: partnerDataAccess(partner).tier,
    programs,
  };
}
