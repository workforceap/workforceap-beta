import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import { getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const JOURNEY_STAGES = ['applied', 'enrolled', 'in_training', 'certified', 'placed'] as const;

/** GET /api/partner/dashboard
 *  Returns partner stats, referrals, and earnings summary.
 */
async function _GET(_request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { members, pipelineMembers } = await loadPartnerReferralBundle(
      ctx.partnerId,
      ctx.partner.organizationId,
    );

    const stageCounts: Record<string, number> = {};
    for (const s of JOURNEY_STAGES) {
      stageCounts[s] = 0;
    }
    for (const p of pipelineMembers) {
      if (p.stage !== 'closed') {
        stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1;
      }
    }

    const placements = members.filter((m) => m.placementRecord?.startDateVerified === true).length;
    const enrolledCount = members.filter((m) => m.enrolledAt != null).length;
    const total = members.length;
    const payoutPerPlacement = getPartnerPlacementPayoutUsd();
    const estimatedPayout = placements * payoutPerPlacement;

    return NextResponse.json({
      partnerId: ctx.partnerId,
      partnerName: ctx.partner.name,
      totalMembers: total,
      enrolledCount,
      placedCount: placements,
      estimatedPayout,
      payoutPerPlacement,
      stageCounts,
    });
  } catch (error) {
    console.error('/partner/dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
