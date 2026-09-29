import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { partnerDataAccess, withPartnerMemberVisibility } from '@/lib/partner/dataAccess';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const postSchema = z.object({
  memberId: z.string().uuid(),
  channel: z.enum(['email', 'call', 'text', 'other']),
  note: z.string().min(1).max(10000),
});async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Minor rule (lib/partner/dataAccess.ts): outreach about a member this
  // partner may not see is not listed, the same as every other partner view.
  const access = partnerDataAccess(ctx.partner);
  const logs = await prisma.$transaction((tx) => tx.partnerOutreachLog.findMany({
    where: { partnerId: ctx.partnerId, member: withPartnerMemberVisibility({}, access) },
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: {
      member: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
    },
  }));

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      memberId: l.memberId,
      memberName: l.member.fullName,
      channel: l.channel,
      note: l.note,
      createdAt: l.createdAt.toISOString(),
      createdByName: l.createdBy?.fullName ?? 'User',
    })),
  });

  } catch (error) {
    console.error('/partner/outreach error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: NextRequest) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // A member hidden from this partner (lib/partner/dataAccess.ts) answers
  // exactly like a member it never referred: 404, and no log row. One answer
  // for both, so the status code cannot tell a partner which of its referrals
  // is a hidden minor.
  const access = partnerDataAccess(ctx.partner);
  const referral = await prisma.$transaction((tx) => tx.partnerReferral.findFirst({
    where: {
      partnerId: ctx.partnerId,
      memberId: parsed.data.memberId,
      member: withPartnerMemberVisibility({}, access),
    },
  }));
  if (!referral) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const log = await prisma.$transaction((tx) => tx.partnerOutreachLog.create({
    data: {
      partnerId: ctx.partnerId,
      memberId: parsed.data.memberId,
      channel: parsed.data.channel,
      note: parsed.data.note,
      createdByUserId: user.id,
    },
    include: {
      member: { select: { fullName: true } },
    },
  }));

  await recordPartnerWorkflowEvent({
    partnerId: ctx.partnerId,
    actorUserId: user.id,
    kind: 'outreach',
    headline: `Outreach (${parsed.data.channel}) · ${log.member.fullName}`,
    detail: parsed.data.note.slice(0, 500),
    entityType: 'PartnerOutreachLog',
    entityId: log.id,
  });

  auditLog({
    actorUserId: user.id,
    action: 'partner_outreach_logged',
    targetType: 'User',
    targetId: parsed.data.memberId,
    metadata: { logId: log.id, channel: parsed.data.channel, partnerId: ctx.partnerId },
  }).catch(() => {});
  logAuditEvent({
    user: { id: user.id, role: 'partner' },
    verb: 'logged',
    object: { type: 'PartnerOutreachLog', id: log.id },
    result: { success: true, extensions: { memberId: parsed.data.memberId, channel: parsed.data.channel } },
  }).catch(() => {});

  return NextResponse.json({
    id: log.id,
    memberId: log.memberId,
    memberName: log.member.fullName,
    channel: log.channel,
    note: log.note,
    createdAt: log.createdAt.toISOString(),
  });

  } catch (error) {
    console.error('/partner/outreach error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);

