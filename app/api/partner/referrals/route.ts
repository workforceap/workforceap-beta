import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { partnerDataAccess, withPartnerMemberVisibility } from '@/lib/partner/dataAccess';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const postSchema = z.object({
  memberId: z.string().uuid(),
});async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const { pipelineMembers } = await loadPartnerReferralBundle(
      ctx.partnerId,
      ctx.partner.organizationId,
    );

    let rows = pipelineMembers.map((p) => ({
      memberId: p.member.id,
      fullName: p.member.fullName,
      stage: p.stage,
      progress: p.progress,
      programTitle: p.programTitle,
      referredAt: p.referredAt.toISOString(),
    }));

    if (statusFilter) {
      rows = rows.filter((r) => r.stage === statusFilter);
    }

    return NextResponse.json({ referrals: rows });
  } catch (error) {
    console.error('/partner/referrals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { memberId } = parsed.data;

    // A referral grants access to member records. Knowing a same-org UUID
    // must never let a partner grant themselves that access. Attribution is
    // created by the application flow or the separate admin assignment API.
    // Keep this endpoint idempotent for an already-authorized relationship.
    // A member hidden from this partner (a minor without FERPA consent under
    // a non-school partner, lib/partner/dataAccess.ts) is a 404 like any
    // other member it may not see.
    const access = partnerDataAccess(ctx.partner);
    const referral = await prisma.$transaction((tx) => tx.partnerReferral.findFirst({
      where: {
        partnerId: ctx.partnerId,
        memberId,
        partner: { organizationId: ctx.partner.organizationId, active: true },
        member: {
          organizationId: ctx.partner.organizationId,
          deletedAt: null,
          ...MEMBER_ONLY_WHERE,
        },
        AND: [{ member: withPartnerMemberVisibility({}, access) }],
      },
      select: { id: true, partnerId: true, memberId: true, referredAt: true },
    }));
    if (!referral) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: referral.id,
      partnerId: referral.partnerId,
      memberId: referral.memberId,
      referredAt: referral.referredAt.toISOString(),
    });
  } catch (error) {
    console.error('/partner/referrals POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
