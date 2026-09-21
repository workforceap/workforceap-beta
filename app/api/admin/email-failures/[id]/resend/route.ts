import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { captureApiError } from '@/lib/observability/captureApiError';
import {
  EMAIL_RESEND_METHOD,
  EMAIL_SEND_WORKFLOW,
  EMAIL_TEMPLATE_ENTITY_TYPE,
  parseEmailFailureMetadata,
} from '@/lib/email/failureRecord';
import { getResendableTemplate, validateResendParams } from '@/lib/email/resendRegistry';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/** Provider retries can wait up to a minute; give the request room for one send. */
export const maxDuration = 60;

const ROUTE = 'admin/email-failures/resend';

/**
 * Re-send one failed email from its `workflow_diagnostics` row (WAP-163).
 *
 * The row must be an `email_send` error that was recorded with a template
 * name and the wrapper's params; the same wrapper is invoked with the same
 * payload. The outcome is written as a second diagnostic (method
 * `admin_resend`, success or error), the original row is stamped with the
 * result, and the action is audit-logged. Rows written before templates were
 * stored (the historical backlog) answer 422: replaying those is a decision
 * for staff, per template family, not a button.
 */
export const POST = withApiGuc(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const row = await prisma.workflowDiagnostic.findFirst({
      where: { id, workflow: EMAIL_SEND_WORKFLOW, status: 'error' },
      select: { id: true, metadata: true, createdAt: true },
    });
    if (!row) return NextResponse.json({ error: 'Failed send not found' }, { status: 404 });

    const failure = parseEmailFailureMetadata(row.metadata);
    if (failure.resentOk) {
      return NextResponse.json({ error: 'This email was already re-sent' }, { status: 409 });
    }
    const template = getResendableTemplate(failure.template);
    if (!template || !failure.templateParams) {
      return NextResponse.json(
        { error: 'This failure was recorded without a replayable template. Re-send it from the original workflow.' },
        { status: 422 },
      );
    }
    if (!failure.resendable) {
      return NextResponse.json(
        { error: 'The stored payload was redacted before it was written and cannot be replayed. Re-send it from the original workflow.' },
        { status: 422 },
      );
    }
    const missing = validateResendParams(template, failure.templateParams);
    if (missing) {
      return NextResponse.json({ error: 'The stored template payload is incomplete and cannot be replayed.' }, { status: 422 });
    }

    let result: { ok: boolean; skipped?: boolean; error?: string };
    try {
      result = await template.send(failure.templateParams);
    } catch (err) {
      captureApiError(err, { route: ROUTE, extra: { diagnosticId: row.id, template: failure.template } });
      result = { ok: false, error: 'Send threw' };
    }

    const resentAt = new Date();
    const outcome = await prisma.workflowDiagnostic.create({
      data: {
        workflow: EMAIL_SEND_WORKFLOW,
        status: result.ok ? 'success' : 'error',
        actorUserId: user.id,
        entityType: EMAIL_TEMPLATE_ENTITY_TYPE,
        entityId: failure.template,
        method: EMAIL_RESEND_METHOD,
        summary: result.ok
          ? `Admin re-sent ${failure.template ?? 'email'}`
          : `Admin re-send failed: ${failure.template ?? 'email'}`,
        provider: 'resend',
        failureReason: result.ok ? null : (result.error ?? 'Send failed'),
        metadata: {
          sourceDiagnosticId: row.id,
          template: failure.template,
          recipientHash: failure.recipientHash,
          recipientDomain: failure.recipientDomain,
          skipped: result.skipped === true,
        },
      },
      select: { id: true },
    });

    const originalMetadata = row.metadata !== null && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
    await prisma.workflowDiagnostic.update({
      where: { id: row.id },
      data: {
        metadata: {
          ...originalMetadata,
          resentAt: resentAt.toISOString(),
          resentOk: result.ok,
          resentDiagnosticId: outcome.id,
        },
      },
    });

    await auditLog({
      actorUserId: user.id,
      action: 'email_resend',
      targetType: 'workflow_diagnostic',
      targetId: row.id,
      metadata: {
        template: failure.template,
        recipientHash: failure.recipientHash,
        originallyFailedAt: row.createdAt.toISOString(),
        ok: result.ok,
        skipped: result.skipped === true,
        resendDiagnosticId: outcome.id,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.skipped
            ? 'The recipient is a fixture address; nothing was sent.'
            : 'The email provider did not accept the re-send. The new failure was recorded.',
          resendDiagnosticId: outcome.id,
        },
        { status: result.skipped ? 422 : 502 },
      );
    }
    return NextResponse.json({ ok: true, resendDiagnosticId: outcome.id, resentAt: resentAt.toISOString() });
  } catch (error) {
    captureApiError(error, { route: ROUTE });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
