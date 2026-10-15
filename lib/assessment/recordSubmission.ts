import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { canSubmitAssessment, type AssessmentAttemptState } from './attempts';

/** Only the winning compare-and-set may trigger emails, points or analytics. */
export async function recordAssessmentSubmission(input: {
  memberId: string; organizationId: string;
  expected: AssessmentAttemptState & { assessmentCompleted: boolean };
  raw: number; pct: number; programInterest: string; answers: Record<number, string>;
}): Promise<boolean> {
  if (!canSubmitAssessment(input.expected)) return false;
  const updated = await prisma.$transaction((tx) => withTenantScope(input.organizationId, (db) => db.user.updateMany({
    where: { id: input.memberId, deletedAt: null, assessmentAttemptCount: input.expected.assessmentAttemptCount,
      ...(input.expected.assessmentAttemptCount === 0
        ? { assessmentCompleted: false, assessmentRetakeRequestedAt: null }
        : { assessmentRetakeRequestedAt: input.expected.assessmentRetakeRequestedAt }),
    },
    data: {
      assessmentCompleted: true,
      assessmentAttemptCount: { increment: 1 }, assessmentRetakeRequestedAt: null,
      assessmentCompletedAt: new Date(), assessmentScore: input.raw, assessmentScorePct: input.pct,
      programInterest: input.programInterest, assessmentAnswers: input.answers,
    },
  }), tx));
  return updated.count === 1;
}
