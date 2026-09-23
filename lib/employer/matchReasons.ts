/**
 * Match reasons an employer may see, and the assessment line only staff see.
 *
 * `AIJobMatch.matchReasons` is stored and read by employer surfaces (the
 * pipeline list and Kanban, the matches API). A member's career-readiness
 * assessment score is not a hiring signal an employer should see (V08: avoid
 * irrelevant sensitive attributes; Mike, Slack 2026-09-23 05:08 UTC), so the
 * matcher no longer writes it there (`scoreAssessmentReadiness` in
 * lib/ai/matchWeights.ts). The assessment still counts toward `matchScore`
 * with the same weight.
 *
 * Rows written before that change still carry the line, so employer reads
 * pass the stored array through {@link employerVisibleMatchReasons}. Staff
 * views get the score from {@link staffAssessmentReason} instead.
 */

/** Matches the legacy "Assessment score NN%" reason the matcher used to store. */
const ASSESSMENT_REASON = /^\s*assessment score\b/i;

/** The stored reasons with any assessment-score line removed. */
export function employerVisibleMatchReasons(reasons: readonly string[] | null | undefined): string[] {
  return (reasons ?? []).filter((reason) => !ASSESSMENT_REASON.test(reason));
}

/** Staff-only reason line for a member's current assessment score, or null when there is none. */
export function staffAssessmentReason(assessmentScorePct: number | null | undefined): string | null {
  return assessmentScorePct == null ? null : `Assessment score ${assessmentScorePct}%`;
}
