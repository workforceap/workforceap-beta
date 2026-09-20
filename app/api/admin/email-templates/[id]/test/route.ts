import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { renderTemplate, getDefaultSampleData } from '@/lib/admin/emailTemplate';
import { getResend } from '@/lib/email';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { FixtureRecipientSkippedError, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

function getFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

export const POST = withApiGuc(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await requireAdmin(user.id); } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const template = await prisma.$transaction((tx) => tx.emailTemplate.findUnique({ where: { id } }));
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let body: { to?: string; variables?: Record<string, string> } = {};
    body = (await req.json().catch(() => ({}))) ?? {}; // no body is fine

    const to = body.to?.trim() || user.email;
    if (!to) {
      return NextResponse.json({ error: 'No recipient email available' }, { status: 400 });
    }

    const sampleData = body.variables ?? getDefaultSampleData(template.variables);
    const rendered = renderTemplate(template, sampleData);

    const resend = getResend();
    if (!resend) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: getFrom(),
        to,
        subject: sanitizeEmailSubjectLine(rendered.subject),
        html: rendered.html,
        // An admin re-sending the same test the same day expects a fresh
        // message, so opt out of the wrapper's content-based dedupe key.
        idempotencyKey: `email-template-test/${id}/${Date.now()}`,
      });
    } catch (err) {
      if (err instanceof FixtureRecipientSkippedError) {
        return NextResponse.json(
          { error: 'That recipient is a fixture/test address; the test email was not sent.' },
          { status: 422 }
        );
      }
      console.error('Test email send failed:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Send failed' },
        { status: 502 }
      );
    }

    void auditLog({ actorUserId: user.id, action: 'admin_email_template_test_sent', targetType: 'User', targetId: user.id, metadata: { templateId: id, sentTo: to } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'EmailTemplateTest', id }, result: { success: true, extensions: { sentTo: to } } }).catch(() => {});
    return NextResponse.json({ ok: true, sentTo: to, subject: rendered.subject });
  } catch (error) {
    console.error('/admin/email-templates/[id]/test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
