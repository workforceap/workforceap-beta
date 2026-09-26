import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { isReferralPartner } from '@/lib/partner/partnerType';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Community partners don't receive payouts — refuse the earnings endpoint
    // entirely rather than returning a zero-dollar payload that would still
    // imply the partner is on the payout track.
    if (!isReferralPartner(ctx.partner)) {
      return NextResponse.json(
        { error: 'Earnings are only available to referral partners.' },
        { status: 403 },
      );
    }

    const referrals = await prisma.$transaction((tx) => tx.partnerReferral.findMany({
      take: 500,
      where: {
        partnerId: ctx.partnerId,
        partner: { organizationId: ctx.partner.organizationId },
        member: {
          organizationId: ctx.partner.organizationId,
          deletedAt: null,
          ...MEMBER_ONLY_WHERE,
        },
      },
      include: {
        member: {
          select: {
            id: true,
            fullName: true,
            placementRecord: {
              select: { placedAt: true, employerName: true, jobTitle: true, startDateVerified: true },
            },
          },
        },
      },
    }));

    const payoutPerPlacement = getPartnerPlacementPayoutUsd();
    const placedReferrals = referrals.filter((r) => r.member.placementRecord?.startDateVerified === true);
    const estimatedTotal = placedReferrals.length * payoutPerPlacement;

    return NextResponse.json({
      partnerId: ctx.partnerId,
      payoutPerPlacement,
      totalReferrals: referrals.length,
      placedCount: placedReferrals.length,
      estimatedTotal,
      placements: placedReferrals.map((r) => ({
        memberId: r.member.id,
        memberName: r.member.fullName,
        placedAt: r.member.placementRecord?.placedAt?.toISOString() ?? null,
        employerName: r.member.placementRecord?.employerName ?? null,
        jobTitle: r.member.placementRecord?.jobTitle ?? null,
      })),
    });
  } catch (error) {
    console.error('/partner/earnings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
