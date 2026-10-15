import 'server-only';

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { parseWioaQualificationSnapshot } from './wioaQualification';

/** Actual apply answers, including partial screenings; never synthesize questionnaire answers. */
export const applyWioaReviewSelect = {
  id: true, organizationId: true, createdAt: true, q1: true, q2: true, q3: true,
  qualifies: true, yesCount: true, receivingUnemployment: true,
  exhaustedUnemployment: true, layoffCompany: true, snapWic: true,
  publicAssistancePrograms: true, publicAssistanceHelpRequested: true,
} satisfies Prisma.ApplyEligibilityScreeningSelect;

export type ApplyWioaReviewScreening = Prisma.ApplyEligibilityScreeningGetPayload<{ select: typeof applyWioaReviewSelect }>;
export type ApplyWioaReviewScreeningDto = Omit<ApplyWioaReviewScreening, 'createdAt'> & { createdAt: string };

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  });
}

/** createdAt survives an apply upsert, so only a fingerprint of the answers is a review revision. */
export function buildWioaReviewEvidence(raw: unknown, applyScreening: ApplyWioaReviewScreening | null | undefined, organizationId: string) {
  const snapshot = parseWioaQualificationSnapshot(raw);
  const apply = applyScreening?.organizationId === organizationId ? applyScreening : null;
  if (!snapshot && !apply) return null;
  return {
    snapshot,
    applyScreening: apply ? { ...apply, createdAt: apply.createdAt.toISOString() } : null,
    submittedAt: snapshot?.submittedAt ?? apply!.createdAt.toISOString(),
    revision: createHash('sha256').update(stableJson({ selfScreening: raw ?? null, applyScreening: apply })).digest('hex'),
  };
}
