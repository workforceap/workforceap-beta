import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { getResend } from '@/lib/email';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml, sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { createNotification } from '@/lib/notifications/create';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import { checkBulkEmailRateLimit } from '@/lib/rate-limit';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const MAX_MEMBERS = 100;
const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

const bodySchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(MAX_MEMBERS),
  subject: z.string().min(1).max(MAX_SUBJECT),
  body: z.string().min(1).max(MAX_BODY),
  sendAsEmail: z.boolean().default(true),
  createMessage: z.boolean().default(true),
});

function getFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => vars[key] ?? '');
}

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Per-admin rate limit (3 calls/hr). Each call can fan out to 100
    // Resend sends; a compromised admin token without this gate can
    // blast every member repeatedly and burn the domain's bulk-sender
    // reputation. Apply BEFORE body parsing so an unauthenticated attacker
    // can't shape the 429 response based on parse errors.
    const { success: bulkRateOk } = await checkBulkEmailRateLimit(user.id);
    if (!bulkRateOk) {
      return NextResponse.json(
        { error: 'Bulk-email rate limit reached. Please wait an hour before sending another.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { memberIds, subject: rawSubject, body: rawBodyText, sendAsEmail, createMessage } = parsed.data;
    const orgId = await getActorOrganizationId(user.id);

    // Fetch members within tenant scope
    const members = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: { id: { in: memberIds }, deletedAt: null },
        select: {
          id: true,
          email: true,
          fullName: true,
          enrolledProgram: true,
          organizationId: true,
        },
      }),
    );

    if (members.length === 0) {
      return NextResponse.json({ error: 'No valid members found' }, { status: 404 });
    }

    const resend = sendAsEmail ? getResend() : null;
    if (sendAsEmail && !resend) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    const branding = await getOrganizationBranding(orgId);
    let sentCount = 0;
    let messageCount = 0;
    const errors: string[] = [];

    for (const member of members) {
      const firstName = member.fullName.trim().split(/\s+/)[0] || 'there';
      const vars = {
        firstName,
        fullName: member.fullName,
        email: member.email,
        programName: member.enrolledProgram ?? 'your program',
      };

      const subject = substituteVars(rawSubject, vars);
      const bodyText = substituteVars(rawBodyText, vars);

      try {
        if (sendAsEmail && resend) {
          const html = brandedEmailLayout({
            title: subject,
            bodyHtml: `<p style="white-space:pre-wrap;">${escapeHtml(bodyText)}</p>`,
            ctaText: 'Open Portal',
            ctaUrl: `${branding.domain}/dashboard`,
            branding,
          });

          const { error: sendError } = await resend.emails.send({
            from: getFrom(),
            to: member.email,
            subject: sanitizeEmailSubjectLine(subject),
            html,
          });
          if (sendError) throw new Error(sendError.message || 'Email provider rejected the request.');
          sentCount++;
        }

        if (createMessage) {
          const thread = await getOrCreateMemberCounselorThread(member.id);
          await prisma.$transaction(async (tx) => {
            await tx.message.create({
              data: {
                threadId: thread.id,
                authorId: user.id,
                body: bodyText,
              },
            });
            await tx.messageThread.update({
              where: { id: thread.id },
              data: { updatedAt: new Date(), staffUserId: user.id, staffLastReadAt: new Date() },
            });
          });
          await createNotification({
            userId: member.id,
            type: 'broadcast',
            title: subject,
            body: bodyText.slice(0, 200),
            data: { threadId: thread.id, authorId: user.id },
          });
          messageCount++;
        }

        await auditLog({
          actorUserId: user.id,
          action: 'bulk_email_member',
          targetType: 'user',
          targetId: member.id,
          metadata: { subject, sentAsEmail: sendAsEmail, createdMessage: createMessage },
        });
        await logAuditEvent({
          user: { id: user.id, role: 'admin' },
          verb: 'emailed',
          object: { type: 'MemberBulkEmail', id: member.id },
          result: {
            success: true,
            extensions: {
              orgId,
              subject,
              sentAsEmail: sendAsEmail,
              createdMessage: createMessage,
            },
          },
          request: auditRequestMeta(request),
          orgId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${member.fullName} (${member.email}): ${msg}`);
        console.error(`[bulk-email] failed for ${member.id}:`, err);
      }
    }

    return NextResponse.json({
      sent: sentCount,
      messagesCreated: messageCount,
      total: members.length,
      errors,
    });
  } catch (error) {
    console.error('/admin/members/bulk-email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
