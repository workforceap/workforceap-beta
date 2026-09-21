/**
 * Presentation-only rules for the member dashboard's "Your approval status"
 * card. Nothing here reads facts or recomputes a status — it only answers
 * two questions about an already-built `MemberApprovalStatus`:
 *
 *  1. is there a live next step for the member (so the card keeps its place
 *     at the top of /dashboard), or is the pathway finished/closed (so the
 *     card drops below the dashboard content as one summary line)?
 *  2. what status was the card dismissed at, so a dismissal survives
 *     reloads but ends as soon as the member's status actually moves?
 */
import type { ApprovalStageKey, MemberApprovalStatus } from './memberApprovalStatus';

const STAGE_KEYS: readonly ApprovalStageKey[] = ['application', 'intake', 'training'];

export type MemberApprovalCardPlacement = 'primary' | 'demoted';

/**
 * True when the pathway still has a step in flight. False only for the two
 * shapes that leave the member nothing to wait on:
 *   • every step resolved (`currentStage === 'complete'`), or
 *   • a stage the workflow recorded as terminal — a closed application
 *     (`application: 'denied'`) or a not-eligible intake — which
 *     `buildMemberApprovalStatus` marks `state: 'blocked'`.
 */
export function hasLiveApprovalNextStep(status: MemberApprovalStatus): boolean {
  if (status.currentStage === 'complete') return false;
  // Defensive on `stages`: placement must never be the reason /dashboard
  // falls back to its error state.
  return !STAGE_KEYS.some((stage) => status.stages?.[stage]?.state === 'blocked');
}

/** `primary` keeps the card above the dashboard; `demoted` collapses it below. */
export function memberApprovalCardPlacement(status: MemberApprovalStatus): MemberApprovalCardPlacement {
  return hasLiveApprovalNextStep(status) ? 'primary' : 'demoted';
}

/**
 * The exact saved states the member was looking at. A dismissal stores this
 * string, so the card stays hidden while the three states and the current
 * stage are unchanged and returns the moment any of them moves.
 */
export function approvalStatusSignature(status: MemberApprovalStatus): string {
  return [status.application, status.intake, status.training, status.currentStage].join('|');
}

/** Per-member storage key (mirrors the `wa:tour:auto-started:*` convention). */
export function approvalDismissStorageKey(storageUserId: string): string {
  return `wa:approval-status:dismissed:${storageUserId}`;
}
