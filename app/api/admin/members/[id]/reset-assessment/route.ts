import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, getProfileRole } from '@/lib/auth/roles';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { allowAssessmentRetake } from '@/lib/assessment/retake';
import { getActorOrganizationId } from "@/lib/tenant/organization";

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

export const POST = withApiGuc(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });

    const { id } = await params;
    const orgId = await getActorOrganizationId(user.id);

    // Ops (10/9/26): archive the previous result to assessment history before
    // clearing it (this used to delete the score and answers outright). The
    // member's program interest is kept; the retake asks for it again anyway.
    const result = await allowAssessmentRetake({ memberId: id, staffUserId: user.id, staffRole: 'admin' });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Member not found' }, { status: 404 })
        : NextResponse.json({ error: 'This member has not completed the preassessment yet.' }, { status: 409 });
    }

    const profileRole = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      console.error('[api:admin-reset-assessment] profileRole lookup failed; degrading to member', err);
      return 'member';
    });
    auditLog({ actorUserId: user.id, action: 'admin_member_reset_assessment', targetType: 'User', targetId: id, metadata: { orgId } }).catch((err) => console.error('[audit] admin_member_reset_assessment:', err));
    await logAuditEvent({
      user: { id: user.id, role: profileRole ?? undefined },
      verb: 'reset_assessment',
      object: { type: 'User', id },
      result: { success: true },
      request: auditRequestMeta(request),
      orgId,
    }).catch((err) => console.error('[audit] reset-assessment:', err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/members/[id]/reset-assessment POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
