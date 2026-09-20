import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml } from '@/lib/email/escapeHtml';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { auditLog } from '@/lib/audit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

const bodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(200).optional(),
});

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }

    const { email, name } = parsed.data;

    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    if (!resend) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    const safeName = escapeHtml(name || 'Partner');
    const bodyHtml = `
      <p>Hi ${safeName},</p>
      <p>You've been invited to access the WorkforceAP Partner Portal. The portal gives you visibility into the progress of members you've referred — including program enrollment, course completion, certifications, and job placement.</p>
      <p>To get started, create your account or sign in at the link below.</p>
      <p style="color: #666;">If you have questions, reply to this email or contact us at info@workforceap.org.</p>
      <p style="color: #666;">— WorkforceAP Team</p>
    `;

    const html = brandedEmailLayout({
      title: 'Partner Portal Access',
      bodyHtml,
      ctaText: 'Access Partner Portal',
      ctaUrl: `${SITE_URL}/partner`,
    });

    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: emailFrom,
        to: email,
        subject: '[WorkforceAP] Partner Portal Access Invitation',
        html,
      });

      await auditLog({
        actorUserId: user.id,
        action: 'partner_invite_send',
        targetType: 'partner',
        targetId: email,
        metadata: { recipientEmail: email, recipientName: name ?? null },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('Partner invite email failed:', err);
      return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/partners/invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
