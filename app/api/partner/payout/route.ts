import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { createPayoutTransfer } from '@/lib/stripe/connect';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { buildPartnerPayoutIdempotencyKey, getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { isPayoutEligibleType } from '@/lib/partner/partnerType';
import { getPlacementPayoutRejection } from '@/lib/partner/payoutEligibility';
import { z } from 'zod';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { persistEvent } from '@/lib/events/track';
import { eventNameReadCandidates } from '@/lib/events/names';

const payoutSchema = z.object({
  partnerId: z.string().uuid(),
  placementId: z.string().uuid(),
});

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = payoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }

    const { partnerId, placementId } = parsed.data;

    const orgId = await getActorOrganizationId(user.id);
    const partner = await withTenantScope(orgId, (db) =>
      db.partner.findUnique({
        where: { id: partnerId },
        select: {
          stripeConnectId: true,
          stripeConnectStatus: true,
          name: true,
          partnerType: true,
        },
      }),
    );

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Hard gate: only `referral` partners may be paid. Defense-in-depth on top
    // of the admin role check above — an admin shouldn't be able to trigger a
    // payout on a community partner even if the UI somehow surfaces the action.
    if (!isPayoutEligibleType(partner.partnerType)) {
      return NextResponse.json(
        { error: 'Partner is not on the payout track. Upgrade to a referral partner first.' },
        { status: 400 },
      );
    }

    if (!partner.stripeConnectId) {
      return NextResponse.json({ error: 'Partner has no connected Stripe account' }, { status: 400 });
    }

    if (partner.stripeConnectStatus !== 'active') {
      return NextResponse.json({ error: 'Partner Stripe account is not active' }, { status: 400 });
    }

    const placement = await withTenantScope(orgId, (db) =>
      db.placementRecord.findFirst({
        where: {
          id: placementId,
          user: {
            organizationId: orgId,
            partnerReferrals: { some: { partnerId } },
          },
        },
        select: {
          id: true,
          userId: true,
          placedAt: true,
          startDateVerified: true,
          user: {
            select: {
              memberEvents: {
                where: {
                  // Both spellings: rows written before WAP-39 kept 'PARTNER_PAYOUT_SENT'.
                  eventName: { in: eventNameReadCandidates('partner_payout_sent') },
                  entityType: 'PlacementRecord',
                  entityId: placementId,
                },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      }),
    );

    if (!placement) {
      const notFound = getPlacementPayoutRejection(null) ?? {
        error: 'Placement not found for this partner',
        status: 404 as const,
      };
      return NextResponse.json({ error: notFound.error }, { status: notFound.status });
    }

    const payoutRejection = getPlacementPayoutRejection({
      id: placement.id,
      userId: placement.userId,
      placedAt: placement.placedAt,
      startDateVerified: placement.startDateVerified,
      paidEvent: placement.user.memberEvents[0] ?? null,
    });

    if (payoutRejection) {
      return NextResponse.json({ error: payoutRejection.error }, { status: payoutRejection.status });
    }

    const payoutAmount = getPartnerPlacementPayoutUsd();
    const amountCents = Math.round(payoutAmount * 100);
    const idempotencyKey = buildPartnerPayoutIdempotencyKey(partnerId, placementId);

    const transfer = await createPayoutTransfer(amountCents, partner.stripeConnectId, {
      partnerId,
      placementId,
      triggeredBy: user.id,
    }, idempotencyKey);

    await persistEvent({
      userId: placement.userId,
      eventName: 'partner_payout_sent',
      entityType: 'PlacementRecord',
      entityId: placementId,
      metadata: {
        partnerId,
        transferId: transfer.id,
        amountCents,
        triggeredBy: user.id,
      },
      sourcePage: '/api/partner/payout',
    }, prisma);

    auditLog({ actorUserId: user.id, action: 'partner_payout_sent', targetType: 'PlacementRecord', targetId: placementId, metadata: { partnerId, transferId: transfer.id, amountCents } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'PartnerPayout', id: transfer.id }, result: { success: true, extensions: { partnerId, placementId, amountCents } } }).catch(() => {});
    return NextResponse.json({
      transferId: transfer.id,
      amount: payoutAmount,
    });
  } catch (error) {
    console.error('[partner/payout] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
