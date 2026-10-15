import { Prisma } from '@prisma/client';
import { hasEligibilityScreeningAnswers, type EligibilityScreeningFields } from './eligibilityScreeningFields';
import { normalizePublicAssistanceFollowUp } from './publicAssistance';

const reviewAnswersSelect = {
  organizationId: true, q1: true, q2: true, q3: true, qualifies: true, yesCount: true,
  receivingUnemployment: true, exhaustedUnemployment: true, layoffCompany: true,
  snapWic: true, publicAssistancePrograms: true, publicAssistanceHelpRequested: true,
} satisfies Prisma.ApplyEligibilityScreeningSelect;

/** Referral changes do not change the evidence staff verified. */
function normalizedReviewAnswers(answers: EligibilityScreeningFields) {
  const text = (value: string | null | undefined) => value?.trim() || null;
  return {
    q1: text(answers.q1), q2: text(answers.q2), q3: text(answers.q3),
    qualifies: answers.qualifies ?? null, yesCount: answers.yesCount ?? null,
    receivingUnemployment: text(answers.receivingUnemployment),
    exhaustedUnemployment: text(answers.exhaustedUnemployment),
    layoffCompany: text(answers.layoffCompany), snapWic: text(answers.snapWic),
    ...normalizePublicAssistanceFollowUp({
      snapWic: answers.snapWic,
      publicAssistancePrograms: answers.publicAssistancePrograms,
      publicAssistanceHelpRequested: answers.publicAssistanceHelpRequested,
    }),
  };
}

/**
 * Each caller retains its existing qualification
 * policy. Writes whenever any screening answer is present — a partial triad
 * (or none) is stored as null q1/q2, because `Application.notes` no longer
 * carries answers and this row is their only home (WAP-170/172). A changed
 * screening returns staff review to pending under the shared member-row
 * lock. Identical evidence and referral-only edits preserve the review.
 */
export async function saveEligibilityScreening(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    answers: EligibilityScreeningFields;
    qualifies: boolean;
    yesCount: number;
  },
) {
  const { userId, organizationId, answers, qualifies, yesCount } = input;
  if (!hasEligibilityScreeningAnswers(answers)) return null;
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM users WHERE id = ${userId} AND organization_id = ${organizationId}
    AND deleted_at IS NULL FOR UPDATE
  `);
  if (locked.length !== 1) throw new Error('ELIGIBILITY_SUBJECT_UNAVAILABLE');
  const previous = await tx.applyEligibilityScreening.findUnique({
    where: { userId }, select: reviewAnswersSelect,
  });
  const screening = {
    organizationId, q1: answers.q1 ?? null, q2: answers.q2 ?? null, q3: answers.q3 ?? null,
    qualifies, yesCount,
    receivingUnemployment: answers.receivingUnemployment ?? null,
    exhaustedUnemployment: answers.exhaustedUnemployment ?? null,
    layoffCompany: answers.layoffCompany ?? null,
    snapWic: answers.snapWic ?? null,
    ...normalizePublicAssistanceFollowUp({
      snapWic: answers.snapWic,
      publicAssistancePrograms: answers.publicAssistancePrograms,
      publicAssistanceHelpRequested: answers.publicAssistanceHelpRequested,
    }),
    hearAbout: answers.hearAbout ?? null,
    hearAboutOther: answers.hearAboutOther ?? null,
    partnerAmbassadorReferral: answers.partnerAmbassadorReferral ?? null,
  };
  const saved = await tx.applyEligibilityScreening.upsert({
    where: { userId }, create: { userId, ...screening }, update: screening,
  });
  if (!previous || previous.organizationId !== organizationId ||
      JSON.stringify(normalizedReviewAnswers(previous)) !== JSON.stringify(normalizedReviewAnswers(screening))) {
    const reset = await tx.user.updateMany({
      where: { id: userId, organizationId, deletedAt: null },
      data: {
        wioaReviewStatus: 'pending', wioaReviewedAt: null,
        wioaReviewedByUserId: null, wioaReviewNotes: null,
      },
    });
    if (reset.count !== 1) throw new Error('ELIGIBILITY_FORM_CONFLICT');
  }
  return saved;
}
