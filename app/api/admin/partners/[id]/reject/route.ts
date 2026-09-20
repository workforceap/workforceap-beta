import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getResend } from '@/lib/email';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { plainTextEmailHtml } from '@/lib/email/plainTextEmail';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';

export const POST = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
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
        },
      }),
    );

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (partner.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Partner is not pending approval' }, { status: 400 });
    }

    let notes: string | null = null;
    try {
      const body = await request.json();
      notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    } catch {
      notes = null;
    }

    await withTenantScope(orgId, (db) =>
      db.partner.update({
        where: { id },
        data: {
          status: 'rejected',
          active: false,
          rejectedAt: new Date(),
          rejectedById: user.id,
          rejectionNotes: notes,
        },
      }),
    );

    // Send rejection email
    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    if (resend && partner.contactEmail) {
      try {
        const lines = [
          `Hi ${partner.contactName || 'there'},`,
          '',
          `Thank you for your interest in partnering with WorkforceAP.`,
          '',
          `After review, we are not able to approve ${partner.name} as a referral partner at this time.`,
        ];
        if (notes) {
          lines.push('', `Reason: ${notes}`);
        }
        lines.push(
          '',
          'If you believe this was in error or your circumstances have changed, feel free to reach out to us at info@workforceap.org.',
          '',
          '— WorkforceAP Team'
        );

        const text = lines.join('\n');
        await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: partner.contactEmail,
          subject: sanitizeEmailSubjectLine('Update on your WorkforceAP partner application'),
          html: plainTextEmailHtml(text),
          text,
        });
      } catch (e) {
        console.error('Partner rejection email failed:', e);
      }
    }

    await auditLog({
      actorUserId: user.id,
      action: 'partner_reject',
      targetType: 'partner',
      targetId: id,
      metadata: { orgId, notes },
    });
    const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
    await logAuditEvent({
      user: { id: user.id, role: actorRole },
      verb: 'voided',
      object: { type: 'Partner', id },
      result: { success: true, extensions: { notes, orgId } },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] partner reject:', err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/admin/partners/[id]/reject:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
