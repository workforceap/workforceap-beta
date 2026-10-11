import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { renderTemplate, getDefaultSampleData } from '@/lib/admin/emailTemplate';
import { getResend } from '@/lib/email';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { FixtureRecipientSkippedError, ResendResolvedSendError, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES, emailTemplateTestAttemptAge, readEmailTemplateTestAttempt } from '@/lib/admin/emailTemplateTestAttempt';

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
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'Test inputs are too large.' }, { status: 400 });
    }
    let body;
    try { body = readEmailTemplateTestAttempt(JSON.parse(rawBody)); } catch { body = null; }
    if (!body) return NextResponse.json({ error: 'A valid saved test attempt is required.' }, { status: 400 });
    if (body.actorId !== user.id) return NextResponse.json({ error: 'This test belongs to another admin.' }, { status: 403 });
    if (body.templateId !== id) return NextResponse.json({ error: 'This test belongs to another template.' }, { status: 400 });
    const age = emailTemplateTestAttemptAge(body);
    if (age === 'future') return NextResponse.json({ error: 'Test timestamp is in the future. Check your device clock.' }, { status: 400 });
    if (age === 'expired') return NextResponse.json({
      error: 'The retry window expired. Check the previous test in your inbox before explicitly sending a new test.',
      code: 'attempt_expired', deliveryStatus: 'unknown',
    }, { status: 409 });

    const template = await prisma.$transaction((tx) => tx.emailTemplate.findUnique({ where: { id } }));
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (template.updatedAt.getTime() !== Date.parse(body.templateUpdatedAt)) return NextResponse.json({
      error: 'The template changed. Check the previous test in your inbox before explicitly sending a new test.',
      code: 'template_changed', deliveryStatus: 'unknown',
    }, { status: 409 });

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

    let providerMessageId: string;
    try {
      const result = await sendBrandedEmailOrThrowOnSkip(resend, {
        from: getFrom(),
        to,
        subject: sanitizeEmailSubjectLine(rendered.subject),
        html: rendered.html,
        // Same actor/template/logical attempt always keeps the same key.
        // Changed server payloads must conflict, never silently get a new key.
        idempotencyKey: `email-template-test/${createHash('sha256').update(JSON.stringify([user.id, id, body.attemptId])).digest('hex')}`,
        templateKey: 'admin_email_template_test', userId: user.id, entityType: 'EmailTemplate', entityId: id,
      });
      providerMessageId = result.data!.id;
    } catch (err) {
      if (err instanceof FixtureRecipientSkippedError) {
        return NextResponse.json(
          { error: 'That recipient is a fixture/test address; the test email was not sent.' },
          { status: 422 }
        );
      }
      console.error('Test email send failed:', err);
      if (err instanceof ResendResolvedSendError && (err.statusCode === 409 || err.code === 'invalid_idempotent_request' || err.code === 'concurrent_idempotent_requests')) {
        const concurrent = err.code === 'concurrent_idempotent_requests';
        return NextResponse.json({
          error: concurrent
            ? 'The previous test is still processing. Wait, then retry the same test.'
            : 'The email payload changed. Check the previous test in your inbox before explicitly sending a new test.',
          code: concurrent ? 'provider_attempt_in_progress' : 'provider_payload_conflict', deliveryStatus: 'unknown',
        }, { status: 409 });
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Send failed', deliveryStatus: 'unknown' },
        { status: 502 }
      );
    }

    void auditLog({ actorUserId: user.id, action: 'admin_email_template_test_sent', targetType: 'User', targetId: user.id, metadata: { templateId: id, sentTo: to } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'EmailTemplateTest', id }, result: { success: true, extensions: { sentTo: to } } }).catch(() => {});
    return NextResponse.json({ ok: true, sentTo: to, subject: rendered.subject, providerMessageId });
  } catch (error) {
    console.error('/admin/email-templates/[id]/test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
