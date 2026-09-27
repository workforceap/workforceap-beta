import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { sendAssessmentResetNotificationEmail } from '@/lib/email';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';
import { activeMemberNotificationTarget } from '@/lib/member/activeNotification';
export const POST = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    // Keep the history snapshot and reset in one transaction behind erasure's
    // lifecycle lock. A stale Auth request must never archive PII after erase.
    const outcome = await withActiveMemberWrite(user.id, async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          fullName: true,
          email: true,
          assessmentCompleted: true,
          assessmentScore: true,
          assessmentScorePct: true,
          assessmentCompletedAt: true,
          assessmentAnswers: true,
          programInterest: true,
        },
      });
      if (!dbUser) return { kind: 'missing' as const };
      if (!dbUser.assessmentCompleted) return { kind: 'not_completed' as const };

      await tx.workflowDiagnostic.create({
        data: {
          workflow: 'member_assessment_history',
          status: 'inspection',
          actorUserId: user.id,
          method: 'member_reset_request',
          summary: `Assessment reset by member. Previous score: ${dbUser.assessmentScorePct ?? 0}% (${dbUser.assessmentScore ?? 0} pts). Program: ${dbUser.programInterest ?? 'n/a'}`,
          metadata: {
            userId: user.id,
            email: dbUser.email,
            fullName: dbUser.fullName,
            previousScore: dbUser.assessmentScore,
            previousScorePct: dbUser.assessmentScorePct,
            previousAnswers: dbUser.assessmentAnswers,
            completedAt: dbUser.assessmentCompletedAt?.toISOString(),
            resetAt: new Date().toISOString(),
          },
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          assessmentCompleted: false,
          assessmentScore: null,
          assessmentScorePct: null,
          assessmentCompletedAt: null,
          assessmentAnswers: undefined,
        },
      });
      return { kind: 'reset' as const, dbUser };
    });

    if (outcome.kind === 'missing') return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (outcome.kind === 'not_completed') {
      return NextResponse.json({ error: 'Assessment not completed yet — nothing to reset' }, { status: 400 });
    }
    const { dbUser } = outcome;
  
    // Notify staff
    try {
      const target = await activeMemberNotificationTarget(user.id);
      if (target) {
        await sendAssessmentResetNotificationEmail({
          subjectMemberId: user.id,
          memberName: target.fullName ?? target.email,
          memberEmail: target.email,
          previousScore: dbUser.assessmentScorePct ?? 0,
          programInterest: dbUser.programInterest ?? 'Not specified',
        });
      }
    } catch (e) {
      console.error('[assessment/reset] notification email failed', e);
    }
  
    auditLog({ actorUserId: user.id, action: 'member.assessment.reset', targetType: 'AssessmentReset', targetId: user.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'AssessmentReset', id: user.id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({ ok: true, message: 'Assessment reset. You can now retake from the dashboard.' });
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('/member/assessment/reset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
