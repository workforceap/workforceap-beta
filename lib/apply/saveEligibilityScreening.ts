import type { Prisma } from '@prisma/client';
import type { EligibilityScreeningFields } from './eligibilityScreeningFields';

/** Shared persistence only: each caller retains its existing qualification policy. */
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
  if (!answers.q1 || !answers.q2) return null;
  const screening = {
    organizationId, q1: answers.q1, q2: answers.q2, q3: answers.q3 ?? null,
    qualifies, yesCount,
    receivingUnemployment: answers.receivingUnemployment ?? null,
    exhaustedUnemployment: answers.exhaustedUnemployment ?? null,
    layoffCompany: answers.layoffCompany ?? null,
    snapWic: answers.snapWic ?? null,
    hearAbout: answers.hearAbout ?? null,
    hearAboutOther: answers.hearAboutOther ?? null,
    partnerAmbassadorReferral: answers.partnerAmbassadorReferral ?? null,
  };
  return tx.applyEligibilityScreening.upsert({
    where: { userId }, create: { userId, ...screening }, update: screening,
  });
}
