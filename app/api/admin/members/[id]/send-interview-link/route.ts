import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getSubjectOrganizationId, getActorOrganizationId } from '@/lib/tenant/organization';
import { sendInterviewPrepLink } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

/**
 * POST /api/admin/members/[id]/send-interview-link
 *
 * Admin-only. Emails an existing member a link to the login-gated WIOA
 * interview-prep tool. No token, no new page — just the portal link, which
 * the member opens after logging in. Reuses isAdmin + withApiGuc like the
 * other admin member routes.
 */
export const POST = withApiGuc(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    try {
      const user = await getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!(await isAdmin(user.id))) {
        return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
      }

      const { id } = await context.params;
      const superAdmin = await isSuperAdmin(user.id);
      const actorOrgId = superAdmin ? null : await getActorOrganizationId(user.id);
      const member = await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id, ...(actorOrgId ? { organizationId: actorOrgId } : {}) },
        select: { email: true, fullName: true },
      }));
      if (!member?.email) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }

      const orgId = await getSubjectOrganizationId(id).catch(() => null);
      const url = `${SITE_URL}/dashboard/ai-tools/interview-prep`;

      const result = await sendInterviewPrepLink({
        to: member.email,
        name: member.fullName,
        url,
        orgId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error ?? 'Could not send email' }, { status: 502 });
      }

      void auditLog({ actorUserId: user.id, action: 'admin_member_interview_link_sent', targetType: 'User', targetId: id, metadata: {} }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'InterviewLink', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('/admin/members/[id]/send-interview-link error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
