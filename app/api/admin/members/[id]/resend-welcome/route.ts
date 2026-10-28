import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { checkWelcomeResendRateLimit } from '@/lib/rate-limit';
import { sendMemberWelcomeLetterEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

async function resendWelcome(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!await isAdmin(actor.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const superAdmin = await isSuperAdmin(actor.id);
    if (isReadOnlyPortalAuditHeader(request.headers)) {
      return NextResponse.json({ error: 'Sending is unavailable during a read-only audit.' }, { status: 403 });
    }

    const { id } = await context.params;
    const organizationId = await getActorOrganizationId(actor.id).catch(() => null);
    if (!organizationId?.trim()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const member = await withTenantScope(organizationId, (db) => db.user.findFirst({
      where: { id, organizationId, deletedAt: null, NOT: MEMBER_ONLY_ROLE_NOT },
      select: { email: true, fullName: true },
    }));
    if (!member?.email) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!(await checkWelcomeResendRateLimit(actor.id, id, request)).success) {
      return NextResponse.json({ error: 'Too many welcome letter requests. Please try again later.' }, { status: 429 });
    }
    const result = await sendMemberWelcomeLetterEmail({ to: member.email, fullName: member.fullName, memberId: id });
    if (!result.ok) return NextResponse.json({ error: 'Email provider acceptance could not be confirmed. Check before retrying.' }, { status: 502 });

    await auditLog({ actorUserId: actor.id, action: 'admin_member_welcome_letter_resent', targetType: 'User', targetId: id, metadata: { organizationId } }).catch(() => {});
    await logAuditEvent({
      user: { id: actor.id, role: superAdmin ? 'super_admin' : 'admin' }, verb: 'sent',
      object: { type: 'MemberWelcomeLetter', id },
      result: { success: true, extensions: { organizationId, providerAccepted: true } },
      request: auditRequestMeta(request), orgId: organizationId,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    console.error('Admin welcome letter resend failed');
    return NextResponse.json({ error: 'The welcome letter could not be sent. Please try again later.' }, { status: 500 });
  }
}

export const POST = withApiGuc(resendWelcome);
