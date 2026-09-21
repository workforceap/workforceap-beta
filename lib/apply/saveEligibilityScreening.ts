import type { Prisma } from '@prisma/client';
import { hasEligibilityScreeningAnswers, type EligibilityScreeningFields } from './eligibilityScreeningFields';
import { normalizePublicAssistanceFollowUp } from './publicAssistance';

/**
 * Shared persistence only: each caller retains its existing qualification
 * policy. Writes whenever any screening answer is present — a partial triad
 * (or none) is stored as null q1/q2, because `Application.notes` no longer
 * carries answers and this row is their only home (WAP-170/172).
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
  return tx.applyEligibilityScreening.upsert({
    where: { userId }, create: { userId, ...screening }, update: screening,
  });
}
