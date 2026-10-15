/** Client-safe attempt policy; authoritative eligibility is also in write predicates. */
export const MAX_ASSESSMENT_ATTEMPTS = 2;
export const ASSESSMENT_LIMIT_MESSAGE = 'This student has used both preassessment attempts. No further retakes are available.';

export type AssessmentAttemptState = {
  assessmentAttemptCount: number;
  assessmentRetakeRequestedAt: Date | string | null;
};

export function canSubmitAssessment(state: AssessmentAttemptState & { assessmentCompleted: boolean }): boolean {
  return state.assessmentAttemptCount === 0 && !state.assessmentCompleted && state.assessmentRetakeRequestedAt === null
    || state.assessmentAttemptCount === MAX_ASSESSMENT_ATTEMPTS - 1 && state.assessmentRetakeRequestedAt !== null;
}

export type PreviousAssessmentResult = { scorePct: number | null; completedAt: string | null };
export function previousAssessmentResults(history: unknown): PreviousAssessmentResult[] {
  if (!Array.isArray(history)) return [];
  return history.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    return [{ scorePct: typeof value.scorePct === 'number' ? value.scorePct : null,
      completedAt: typeof value.completedAt === 'string' ? value.completedAt : null }];
  });
}
