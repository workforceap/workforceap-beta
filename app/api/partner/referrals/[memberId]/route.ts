import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { partnerDataAccess, withPartnerMemberVisibility } from '@/lib/partner/dataAccess';

const patchSchema = z.object({
  assignedPartnerUserId: z.string().uuid().nullable(),
});export const PATCH = withApiGuc(async (request: NextRequest, ctx: { params: Promise<{ memberId: string }> }) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const partnerCtx = await getPartnerForUser(user.id);
  if (!partnerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { memberId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // A member hidden from this partner (lib/partner/dataAccess.ts) is a 404,
  // the same answer as a member it never referred.
  const access = partnerDataAccess(partnerCtx.partner);
  const referral = await prisma.$transaction((tx) => tx.partnerReferral.findFirst({
    where: {
      partnerId: partnerCtx.partnerId,
      memberId,
      member: withPartnerMemberVisibility({}, access),
    },
    include: { member: { select: { fullName: true } } },
  }));
  if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

  const { assignedPartnerUserId } = parsed.data;
  if (assignedPartnerUserId) {
    const pu = await prisma.$transaction((tx) => tx.partnerUser.findFirst({
      where: { partnerId: partnerCtx.partnerId, userId: assignedPartnerUserId },
    }));
    if (!pu) {
      return NextResponse.json({ error: 'Assignee must be a user on this partner account' }, { status: 400 });
    }
  }

  await prisma.$transaction((tx) => tx.partnerReferral.update({
    where: { id: referral.id },
    data: { assignedPartnerUserId },
  }));

  const assignee = assignedPartnerUserId
    ? await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id: assignedPartnerUserId },
        select: { fullName: true },
      }))
    : null;

  await recordPartnerWorkflowEvent({
    partnerId: partnerCtx.partnerId,
    actorUserId: user.id,
    kind: 'referral_assign',
    headline: assignedPartnerUserId
      ? `Owner → ${assignee?.fullName ?? 'partner user'} · ${referral.member.fullName}`
      : `Owner cleared · ${referral.member.fullName}`,
    entityType: 'PartnerReferral',
    entityId: referral.id,
  });

  auditLog({ actorUserId: user.id, action: 'partner_referral_assigned', targetType: 'User', targetId: memberId, metadata: { partnerId: partnerCtx.partnerId, referralId: referral.id, assignedPartnerUserId } }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'partner' }, verb: 'updated', object: { type: 'PartnerReferral', id: referral.id }, result: { success: true, extensions: { assignedPartnerUserId } } }).catch(() => {});

  return NextResponse.json({ ok: true, assignedPartnerUserId, assignedToName: assignee?.fullName ?? null });

  } catch (error) {
    console.error('/partner/referrals/[memberId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

