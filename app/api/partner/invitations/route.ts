import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getPartnerForUser } from '@/lib/auth/roles';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { sendPartnerReferralInviteEmail } from '@/lib/email';
import { eventNameReadCandidates } from '@/lib/events/names';
import { trackEvent } from '@/lib/events/track';
import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { checkAdminInviteRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

/**
 * P01 duplicate-safe referral: an email this partner (the caller or any
 * teammate) already invited within this many hours gets no second email.
 * Operational default; adjust here.
 */
const PARTNER_REINVITE_WINDOW_HOURS = 24;

const schema = z.object({
  email: z.string().email().max(320).transform((value) => value.toLowerCase().trim()),
  personalMessage: z.string().max(2000).optional().nullable(),
});

/**
 * When this partner last sent an invite to `email` inside the re-invite
 * window, read from the `partner_invite_sent` events the send path records.
 * A courtesy guard, not a security control: a failed lookup is logged and
 * returns null so the invite still sends (fail open).
 */
async function findRecentPartnerInvite(partnerId: string, email: string): Promise<Date | null> {
  try {
    const since = new Date(Date.now() - PARTNER_REINVITE_WINDOW_HOURS * 60 * 60 * 1000);
    const prior = await prisma.$transaction((tx) => tx.memberEvent.findFirst({
      where: {
        eventName: { in: eventNameReadCandidates('partner_invite_sent') },
        entityType: 'partner',
        entityId: partnerId,
        createdAt: { gte: since },
        metadata: { path: ['inviteeEmail'], equals: email },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }));
    return prior?.createdAt ?? null;
  } catch (error) {
    console.error('[POST /api/partner/invitations] repeat-invite lookup failed; sending anyway', error);
    return null;
  }
}

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { success } = await checkAdminInviteRateLimit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in a little while.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const partner = await prisma.$transaction((tx) => tx.partner.findUnique({
      where: { id: ctx.partnerId },
      select: {
        id: true,
        name: true,
        slug: true,
        referralCode: true,
      },
    }));
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

    const inviter = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, email: true },
    }));

    const refParam = partner.referralCode ?? partner.slug;
    const inviteUrl = `${SITE_URL}/apply?ref=${encodeURIComponent(refParam)}`;
    const inviterName =
      inviter?.fullName?.trim() || inviter?.email?.trim() || partner.name || 'Your WorkforceAP partner';
    const personalMessage = parsed.data.personalMessage?.trim() || null;

    const priorInviteAt = await findRecentPartnerInvite(ctx.partnerId, parsed.data.email);
    if (priorInviteAt) {
      // No send and no new partner_invite_sent event, so the window runs from
      // the email the person actually received.
      auditLog({ actorUserId: user.id, action: 'partner_invitation_repeat_suppressed', targetType: 'User', targetId: user.id, metadata: { partnerId: ctx.partnerId, inviteeEmail: parsed.data.email, priorInviteAt: priorInviteAt.toISOString() } }).catch(() => {});
      const priorDay = priorInviteAt.toLocaleDateString('en-US', { timeZone: PORTAL_TIMEZONE, month: 'short', day: 'numeric' });
      return NextResponse.json({
        ok: true,
        alreadyInvited: true,
        inviteUrl,
        message: `You already invited ${parsed.data.email} on ${priorDay}. We didn't send another email.`,
      });
    }

    const emailResult = await sendPartnerReferralInviteEmail({
      to: parsed.data.email,
      inviterName,
      partnerName: partner.name,
      personalMessage,
      inviteUrl,
    });

    if (!emailResult.ok) {
      // `emailResult.error` is the provider's text (Resend / network); log it,
      // answer the partner with one plain sentence.
      console.error('[partner/invitations] invite email failed:', emailResult.error ?? 'unknown');
      return NextResponse.json(
        { error: 'Invite email failed to send. Please try again in a few minutes.' },
        { status: 500 }
      );
    }

    try {
      await recordPartnerWorkflowEvent({
        partnerId: partner.id,
        actorUserId: user.id,
        kind: 'member_invite',
        headline: `Invite sent · ${parsed.data.email}`,
        detail: personalMessage,
      });

      await trackEvent({
        userId: user.id,
        eventName: 'partner_invite_sent',
        entityType: 'partner',
        entityId: partner.id,
        metadata: { inviteeEmail: parsed.data.email },
        sourcePage: '/partner/referred-members',
      });
    } catch (error) {
      console.error('[POST /api/partner/invitations] post-send tracking failed', error);
    }

    auditLog({ actorUserId: user.id, action: 'partner_invitation_sent', targetType: 'User', targetId: user.id, metadata: { partnerId: ctx.partnerId, inviteeEmail: parsed.data.email } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'partner' }, verb: 'invited', object: { type: 'PartnerInvitation', id: ctx.partnerId }, result: { success: true, extensions: { inviteeEmail: parsed.data.email } } }).catch(() => {});

    return NextResponse.json({
      ok: true,
      inviteUrl,
      message: `Invitation sent to ${parsed.data.email}.`,
    });
  } catch (error) {
    console.error('[POST /api/partner/invitations]', error);
    return NextResponse.json(
      { error: 'We could not send that invite right now. Please try again.' },
      { status: 500 }
    );
  }
});
