import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { allowAssessmentRetake } from '@/lib/assessment/retake';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

/**
 * Counselor/admin: allow a member to retake the WIOA Preassessment
 * (ops 10/9/26). The previous result is archived to assessment history,
 * not deleted. Access follows the same rule as other counselor actions on a
 * member record (assertStaffCanAccessMemberRecord).
 */
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw: unknown = await request.json().catch(() => null);
    const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason : null;
    if (!memberId) return NextResponse.json({ error: 'Member ID required' }, { status: 400 });
    if (memberId === user.id) return NextResponse.json({ error: 'Staff cannot reset their own preassessment' }, { status: 403 });

    if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const staffRole = (await isAdmin(user.id)) ? 'admin' : 'counselor';
    const result = await allowAssessmentRetake({ memberId, staffUserId: user.id, staffRole, reason });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Member not found' }, { status: 404 })
        : NextResponse.json({ error: 'This member has not completed the preassessment yet.' }, { status: 409 });
    }

    auditLog({
      actorUserId: user.id,
      action: 'staff_allowed_assessment_retake',
      targetType: 'User',
      targetId: memberId,
      metadata: { staffRole, previousScorePct: result.previousScorePct },
    }).catch((err) => console.error('[audit] staff_allowed_assessment_retake:', err));
    logAuditEvent({
      user: { id: user.id, role: staffRole },
      verb: 'update',
      object: { type: 'AssessmentRetake', id: memberId },
      result: { success: true },
      ...auditRequestMeta(request),
    }).catch(() => {});

    return NextResponse.json({ ok: true, message: 'Retake allowed. The previous score is saved in history.' });
  } catch (error) {
    console.error('/api/counselor/assessment-retake:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
