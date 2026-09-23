import { prisma } from '@/lib/db/prisma';
import { eventNameReadCandidates } from '@/lib/events/names';
import { getPlacementPayoutRejection } from '@/lib/partner/payoutEligibility';

/** Upper bound on placements read for the partner overview's payout tile. */
const UNPAID_PLACEMENTS_READ_CAP = 500;

/**
 * Placements of this partner's referred members that POST /api/partner/payout
 * would pay today: placed, start date verified, and no `partner_payout_sent`
 * event for the placement yet. The eligibility rule is the route's own
 * (`getPlacementPayoutRejection`), so the overview's "Payout due" tile and the
 * payout button can never disagree (WAP-213). It used to multiply every
 * placement ever recorded — paid, unverified and all — by the payout rate.
 */
export async function countUnpaidVerifiedPlacements(partnerId: string, organizationId: string): Promise<number> {
  const placements = await prisma.placementRecord.findMany({
    where: {
      startDateVerified: true,
      user: { organizationId, partnerReferrals: { some: { partnerId } } },
    },
    select: { id: true, userId: true, placedAt: true, startDateVerified: true },
    orderBy: { placedAt: 'desc' },
    take: UNPAID_PLACEMENTS_READ_CAP,
  });
  if (placements.length === 0) return 0;

  const paid = await prisma.memberEvent.findMany({
    where: {
      // Both spellings, as the payout route reads them (rows before WAP-39).
      eventName: { in: eventNameReadCandidates('partner_payout_sent') },
      entityType: 'PlacementRecord',
      entityId: { in: placements.map((p) => p.id) },
    },
    select: { id: true, entityId: true },
  });
  const paidByPlacement = new Map(paid.map((e) => [e.entityId, { id: e.id }]));

  return placements.filter(
    (p) => getPlacementPayoutRejection({ ...p, paidEvent: paidByPlacement.get(p.id) ?? null }) === null,
  ).length;
}
