/**
 * Staff-granted retake of the WIOA Preassessment (ops 10/9/26).
 *
 * Archives the current result (score, answers, program interest, who allowed
 * the retake) to the assessment history, then clears the completed flag so
 * the member can take it again. The next attempt gets a new shuffled layout
 * (questions and answers in a different order). Members cannot reset
 * themselves; only admins and staff with access to the member record.
 *
 * Tenant-scoped to the member's organization. The clear is guarded on the
 * completed flag, so a double click cannot archive and clear twice; if the
 * clear loses that race the extra archive row is removed.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getSubjectOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

export const ASSESSMENT_HISTORY_WORKFLOW = 'member_assessment_history';

export type RetakeResult =
  | { ok: true; previousScorePct: number | null }
  | { ok: false; reason: 'not_found' | 'not_completed' };

export async function allowAssessmentRetake(input: {
  memberId: string;
  staffUserId: string;
  staffRole: 'admin' | 'counselor';
  reason?: string | null;
}): Promise<RetakeResult> {
  const orgId = await getSubjectOrganizationId(input.memberId).catch(() => null);
  if (!orgId) return { ok: false, reason: 'not_found' };

  return withTenantScope(orgId, async (db) => {
    const member = await db.user.findFirst({
      where: { id: input.memberId },
      select: {
        assessmentCompleted: true,
        assessmentScore: true,
        assessmentScorePct: true,
        assessmentCompletedAt: true,
        assessmentAnswers: true,
        programInterest: true,
      },
    });
    if (!member) return { ok: false, reason: 'not_found' } as const;
    if (!member.assessmentCompleted) return { ok: false, reason: 'not_completed' } as const;

    // WorkflowDiagnostic is not a tenant model (it carries no organizationId).
    const archive = await prisma.workflowDiagnostic.create({
      data: {
        workflow: ASSESSMENT_HISTORY_WORKFLOW,
        status: 'inspection',
        actorUserId: input.staffUserId,
        entityType: 'User',
        entityId: input.memberId,
        method: `${input.staffRole}_allowed_retake`,
        summary: `Retake allowed by ${input.staffRole}. Previous score: ${member.assessmentScorePct ?? 0}% (${member.assessmentScore ?? 0} pts).`,
        metadata: {
          memberId: input.memberId,
          organizationId: orgId,
          previousScore: member.assessmentScore,
          previousScorePct: member.assessmentScorePct,
          previousAnswers: (member.assessmentAnswers ?? null) as Prisma.InputJsonValue | null,
          previousProgramInterest: member.programInterest,
          completedAt: member.assessmentCompletedAt?.toISOString() ?? null,
          allowedBy: input.staffUserId,
          allowedByRole: input.staffRole,
          reason: input.reason?.trim().slice(0, 500) || null,
          resetAt: new Date().toISOString(),
        },
      },
      select: { id: true },
    });

    const cleared = await clearCompletedAssessment(orgId, input.memberId);
    if (cleared.count === 0) {
      await prisma.workflowDiagnostic.delete({ where: { id: archive.id } }).catch(() => {});
      return { ok: false, reason: 'not_completed' } as const;
    }
    return { ok: true, previousScorePct: member.assessmentScorePct } as const;
  });
}

/** Clear the result only if it is still completed (guards a double click). */
function clearCompletedAssessment(orgId: string, memberId: string) {
  return withTenantScope(orgId, (db) =>
    db.user.updateMany({
      where: { id: memberId, assessmentCompleted: true },
      data: {
        assessmentCompleted: false,
        assessmentCompletedAt: null,
        assessmentScore: null,
        assessmentScorePct: null,
        assessmentAnswers: Prisma.JsonNull,
      },
    }),
  );
}
