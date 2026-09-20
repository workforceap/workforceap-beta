import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getResend } from '@/lib/email';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { plainTextEmailHtml } from '@/lib/email/plainTextEmail';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { auditLog } from '@/lib/audit';
import { getProfileRole } from '@/lib/auth/roles';
import { withDbRetry } from '@/lib/db/withDbRetry';

export const POST = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    // Partner IS in TENANT_SCOPED_MODELS — wrap reads + writes so an
    // Org A admin cannot approve an Org B partner by guessing its UUID.
    const orgId = await getActorOrganizationId(user.id);

    const partner = await withTenantScope(orgId, (db) =>
      db.partner.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          contactEmail: true,
          contactName: true,
          name: true,
          slug: true,
          referralCode: true,
        },
      }),
    );

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (partner.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Partner is not pending approval' }, { status: 400 });
    }

    await withTenantScope(orgId, (db) =>
      db.partner.update({
        where: { id },
        data: {
          status: 'active',
          active: true,
          approvedAt: new Date(),
          approvedById: user.id,
        },
      }),
    );

    const profileRole = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      console.error('[api:admin-partner-approve] profileRole lookup failed; degrading to member', err);
      return 'member';
    });
    await logAuditEvent({
      user: { id: user.id, role: profileRole ?? undefined },
      verb: 'approved',
      object: { type: 'Partner', id },
      result: { success: true },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] partner approve:', err));
    auditLog({ actorUserId: user.id, action: 'admin_partner_approved', targetType: 'User', targetId: id, metadata: { orgId } }).catch(() => {});

    // Send approval email
    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    if (resend && partner.contactEmail) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
        const refParam = partner.referralCode ?? partner.slug;
        const referralApplyUrl = `${siteUrl}/apply?ref=${encodeURIComponent(refParam)}`;

        const text = [
            `Hi ${partner.contactName || 'there'},`,
            '',
            `Great news — ${partner.name} has been approved as a WorkforceAP referral partner!`,
            '',
            'You can now start referring members using your unique referral link:',
            referralApplyUrl,
            '',
            'Log in to your partner portal to track referrals, view member progress, and manage payouts.',
            '',
            `Portal: ${siteUrl}/partner`,
            '',
            'Questions? Reply to this email or contact us at info@workforceap.org.',
            '',
            '— WorkforceAP Team',
          ].join('\n');
        await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: partner.contactEmail,
          subject: sanitizeEmailSubjectLine('Your WorkforceAP partner account has been approved'),
          html: plainTextEmailHtml(text),
          text,
        });
      } catch (e) {
        console.error('Partner approval email failed:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/admin/partners/[id]/approve:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
