import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin, getProfileRole } from '@/lib/auth/roles';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { allowAssessmentRetake } from '@/lib/assessment/retake';
import { ASSESSMENT_LIMIT_MESSAGE } from '@/lib/assessment/attempts';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';

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
    // Org admins stay inside their own tenant. allowAssessmentRetake scopes
    // writes to the *subject* member's org, so an Org A admin who guesses an
    // Org B UUID would otherwise archive and clear that member's official
    // WIOA preassessment. Super-admins keep cross-tenant support access.
    const superAdmin = await isSuperAdmin(user.id);
    const subjectOrgId = await getSubjectOrganizationId(id).catch(() => null);
    if (!subjectOrgId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const actorOrgId = superAdmin ? null : await getActorOrganizationId(user.id);
    if (!canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId, superAdmin })) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const orgId = subjectOrgId;

    // Archive the prior result and prompt the student's final attempt.
    // Their completed result stays on file until that attempt is submitted.
    const result = await allowAssessmentRetake({ memberId: id, staffUserId: user.id, staffRole: 'admin' });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Member not found' }, { status: 404 })
        : NextResponse.json({ error: result.reason === 'limit_reached' ? ASSESSMENT_LIMIT_MESSAGE : result.reason === 'changed' ? 'The assessment changed. Reload and try again.' : 'This member has not completed the preassessment yet.' }, { status: 409 });
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

    return NextResponse.json({ ok: true, message: 'Final retake requested. The student will see a prompt in their portal. Previous results are saved.' });
  } catch (error) {
    console.error('[admin/members/[id]/reset-assessment POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
