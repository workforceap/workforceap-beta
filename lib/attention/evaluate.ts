/**
 * Per-member evaluation and queue aggregation for the attention model.
 *
 * `evaluateMemberAttention` turns one member's facts into their reasons;
 * `buildAttentionQueue` runs it over a roster and produces the shared shape
 * every surface renders from. Both are pure; `loadFacts.ts` fetches inputs.
 */

import {
  ATTENTION_REASON_META,
  ATTENTION_REASON_RANK,
  ATTENTION_THRESHOLDS as T,
  emptyReasonCounts,
  type AttentionReason,
  type AttentionSeverity,
} from './reasons';
import {
  applicationReason,
  daysBetween,
  hoursBetween,
  isApplicationStalled,
  isCounselorContactOverdue,
  isMilestoneRecent,
  isNewWithoutCounselor,
  isNoActivityCritical,
  isNoActivityWarning,
  isResumeMissing,
  isStaleTraining,
  needsComputerSupportFollowUp,
  quietDays,
  replyOverdue,
} from './rules';

/** Everything the rules need to know about one member. */
export type MemberAttentionInput = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  createdAt: Date;
  /** Active counselor assignment date; null when nobody owns the member. */
  assignedAt: Date | null;
  hasResume: boolean;
  /** Most recent MemberEvent, or null when none was ever recorded. */
  lastActivityAt: Date | null;
  /** The member's latest message, only when it is the newest in its thread (unanswered). */
  unansweredMessage: { threadId: string; at: Date; preview: string } | null;
  /** Most recent staff-authored message in the member's thread(s). */
  lastStaffMessageAt: Date | null;
  /** Latest enrollment application. `anchorAt` = submittedAt ?? createdAt. */
  application: { status: string; anchorAt: Date } | null;
  /** Highest-scoring active saved at-risk alert. */
  riskAlert: { alertId: string; score: number; status: string } | null;
  staleTrainingDetectedAt: Date | null;
  needsComputerSupportFollowUp: boolean;
  lastComputerFollowUpAt: Date | null;
  /** Most recent course_completed / certification_earned event. */
  milestone: { eventName: string; at: Date } | null;
};

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AttentionContext = {
  /** Whole days since the last activity event; null when none is recorded. */
  daysInactive?: number | null;
  hoursWaiting?: number;
  threadId?: string;
  lastMessagePreview?: string;
  /** Days since the counselor last wrote; null when they never have. */
  daysSinceLastContact?: number | null;
  daysSinceAssignment?: number;
  daysSinceApplication?: number;
  daysSinceJoined?: number;
  atRiskScore?: number;
  atRiskLevel?: RiskLevel;
  alertId?: string;
  alertStatus?: string;
  staleSince?: Date;
  milestoneEventName?: string;
  milestoneAt?: Date;
};

export type MemberAttention = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  /** All matching reasons, highest rank first. */
  reasons: AttentionReason[];
  primaryReason: AttentionReason;
  /** Severity of the primary reason. */
  severity: AttentionSeverity;
  /** Larger is more pressing within a severity (days quiet, hours waiting, risk score…). */
  urgency: number;
  context: AttentionContext;
  lastActivityAt: Date | null;
};

export type OnTrackMember = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  lastActivityAt: Date | null;
};

export type AttentionTotals = {
  critical: number;
  warning: number;
  /** critical + warning — the one number every surface prints as "needs attention". */
  flagged: number;
  celebrate: number;
  onTrack: number;
  /** Every member evaluated (flagged + celebrate-only + on track). */
  roster: number;
  /** Members with an enrolled program (the "active students" number). */
  enrolled: number;
  /** Members matching each reason, counting additional reasons too. */
  byReason: Record<AttentionReason, number>;
};

export type AttentionQueue = {
  /** Members needing attention (critical or warning), most pressing first. */
  rows: MemberAttention[];
  /** Members whose only reasons are celebrations. */
  celebrate: MemberAttention[];
  /** Members with no reason at all. */
  onTrack: OnTrackMember[];
  totals: AttentionTotals;
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, celebrate: 2 };

export function sortReasons(reasons: readonly AttentionReason[]): AttentionReason[] {
  return [...new Set(reasons)].sort((a, b) => ATTENTION_REASON_RANK[a] - ATTENTION_REASON_RANK[b]);
}

export function pickPrimaryReason(
  reasons: readonly AttentionReason[],
): { primary: AttentionReason; severity: AttentionSeverity; additional: AttentionReason[] } | null {
  const sorted = sortReasons(reasons);
  if (sorted.length === 0) return null;
  const primary = sorted[0];
  return { primary, severity: ATTENTION_REASON_META[primary].severity, additional: sorted.slice(1) };
}

/** Evaluate one member. Returns null when nothing applies (on track). */
export function evaluateMemberAttention(
  input: MemberAttentionInput,
  now: Date,
): MemberAttention | null {
  const reasons: AttentionReason[] = [];
  const context: AttentionContext = {};
  const isEnrolled = input.enrolledProgram !== null;
  const quietAnchor = input.enrolledAt ?? input.createdAt;

  // At risk = not active lately AND in a program (Mike, 2026-09-20). The saved
  // alert is the inactivity signal; a member with no program is not a risk
  // alert here, matching the persisted at-risk loader the Command Center reads.
  if (input.riskAlert && isEnrolled) {
    reasons.push('risk_alert');
    context.atRiskScore = input.riskAlert.score;
    context.atRiskLevel = riskLevelFromScore(input.riskAlert.score);
    context.alertId = input.riskAlert.alertId;
    context.alertStatus = input.riskAlert.status;
  }

  if (isNoActivityCritical(input.lastActivityAt, isEnrolled, quietAnchor, now)) {
    reasons.push('no_activity_30d');
  } else if (isNoActivityWarning(input.lastActivityAt, isEnrolled, quietAnchor, now)) {
    reasons.push('no_activity_10d');
  }
  if (reasons.includes('no_activity_30d') || reasons.includes('no_activity_10d')) {
    // Only a real event yields a day count; with none recorded the UI says
    // "no activity recorded" instead of inventing a recency.
    const { days, measured } = quietDays(input.lastActivityAt, quietAnchor, now);
    context.daysInactive = measured ? days : null;
  }

  const reply = replyOverdue(input.unansweredMessage?.at ?? null, now);
  if (reply && input.unansweredMessage) {
    reasons.push(reply);
    context.threadId = input.unansweredMessage.threadId;
    context.lastMessagePreview = input.unansweredMessage.preview;
    context.hoursWaiting = hoursBetween(input.unansweredMessage.at, now);
  }

  if (isStaleTraining(input.staleTrainingDetectedAt, now)) {
    reasons.push('stale_training');
    context.staleSince = input.staleTrainingDetectedAt ?? undefined;
  }

  if (isCounselorContactOverdue(input.assignedAt, input.lastStaffMessageAt, now)) {
    reasons.push('no_counselor_contact_7d');
    context.daysSinceLastContact = input.lastStaffMessageAt
      ? daysBetween(input.lastStaffMessageAt, now)
      : null;
  }

  const resumeAnchor = input.assignedAt ?? input.createdAt;
  if (isResumeMissing(input.hasResume, resumeAnchor, now)) {
    reasons.push('resume_missing_3d');
    context.daysSinceAssignment = daysBetween(resumeAnchor, now);
  }

  if (input.application) {
    const appReason = applicationReason(input.application.status);
    if (appReason) {
      if (isApplicationStalled(input.application.anchorAt, input.application.status, now)) {
        reasons.push('application_stalled_5d');
      }
      reasons.push(appReason);
      context.daysSinceApplication = daysBetween(input.application.anchorAt, now);
    }
  }

  if (isNewWithoutCounselor(input.createdAt, input.assignedAt, now)) {
    reasons.push('new_no_counselor');
    context.daysSinceJoined = daysBetween(input.createdAt, now);
  }

  if (needsComputerSupportFollowUp(input.needsComputerSupportFollowUp, input.lastComputerFollowUpAt)) {
    reasons.push('computer_support_followup');
  }

  if (isMilestoneRecent(input.milestone?.at ?? null, input.lastStaffMessageAt, now) && input.milestone) {
    reasons.push('milestone_reached');
    context.milestoneEventName = input.milestone.eventName;
    context.milestoneAt = input.milestone.at;
  }

  const picked = pickPrimaryReason(reasons);
  if (!picked) return null;

  return {
    memberId: input.memberId,
    memberName: input.memberName,
    memberEmail: input.memberEmail,
    enrolledProgram: input.enrolledProgram,
    reasons: [picked.primary, ...picked.additional],
    primaryReason: picked.primary,
    severity: picked.severity,
    urgency: urgencyOf(picked.primary, context),
    context,
    lastActivityAt: input.lastActivityAt,
  };
}

/** Within one severity, larger sorts first. Units differ per reason on purpose. */
export function urgencyOf(primary: AttentionReason, context: AttentionContext): number {
  switch (primary) {
    case 'risk_alert':
      return context.atRiskScore ?? 0;
    case 'no_activity_30d':
    case 'no_activity_10d':
      return context.daysInactive ?? T.NO_ACTIVITY_CRITICAL_DAYS;
    case 'sla_breach_48h':
    case 'sla_warning_24h':
      return context.hoursWaiting ?? 0;
    case 'no_counselor_contact_7d':
      return context.daysSinceLastContact ?? T.COUNSELOR_CONTACT_DAYS + 1;
    case 'resume_missing_3d':
      return context.daysSinceAssignment ?? T.RESUME_MISSING_DAYS;
    case 'application_stalled_5d':
    case 'pending_application':
    case 'missing_info':
      return context.daysSinceApplication ?? 0;
    case 'new_no_counselor':
      return context.daysSinceJoined ?? 0;
    case 'stale_training':
      return context.staleSince ? 1 : 0;
    case 'computer_support_followup':
      return 0;
    case 'milestone_reached':
      return context.milestoneAt?.getTime() ?? 0;
  }
}

export function compareAttention(a: MemberAttention, b: MemberAttention): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const byRank = ATTENTION_REASON_RANK[a.primaryReason] - ATTENTION_REASON_RANK[b.primaryReason];
  if (byRank !== 0) return byRank;
  if (b.urgency !== a.urgency) return b.urgency - a.urgency;
  return a.memberName.localeCompare(b.memberName);
}

export function emptyAttentionQueue(): AttentionQueue {
  return {
    rows: [],
    celebrate: [],
    onTrack: [],
    totals: {
      critical: 0,
      warning: 0,
      flagged: 0,
      celebrate: 0,
      onTrack: 0,
      roster: 0,
      enrolled: 0,
      byReason: emptyReasonCounts(),
    },
  };
}

/** Evaluate a roster. Every member lands in exactly one of rows / celebrate / onTrack. */
export function buildAttentionQueue(
  inputs: readonly MemberAttentionInput[],
  now: Date,
): AttentionQueue {
  const queue = emptyAttentionQueue();
  const seen = new Set<string>();

  for (const input of inputs) {
    if (seen.has(input.memberId)) continue;
    seen.add(input.memberId);
    queue.totals.roster += 1;
    if (input.enrolledProgram !== null) queue.totals.enrolled += 1;

    const result = evaluateMemberAttention(input, now);
    if (!result) {
      queue.onTrack.push({
        memberId: input.memberId,
        memberName: input.memberName,
        memberEmail: input.memberEmail,
        enrolledProgram: input.enrolledProgram,
        lastActivityAt: input.lastActivityAt,
      });
      continue;
    }

    for (const reason of result.reasons) queue.totals.byReason[reason] += 1;

    if (result.severity === 'celebrate') {
      queue.celebrate.push(result);
    } else {
      queue.rows.push(result);
      if (result.severity === 'critical') queue.totals.critical += 1;
      else queue.totals.warning += 1;
    }
  }

  queue.rows.sort(compareAttention);
  queue.celebrate.sort(
    (a, b) => (b.context.milestoneAt?.getTime() ?? 0) - (a.context.milestoneAt?.getTime() ?? 0),
  );
  queue.onTrack.sort((a, b) => a.memberName.localeCompare(b.memberName));

  queue.totals.flagged = queue.totals.critical + queue.totals.warning;
  queue.totals.celebrate = queue.celebrate.length;
  queue.totals.onTrack = queue.onTrack.length;
  return queue;
}

/** Members whose reasons include `reason` (primary or additional). */
export function selectByReason(queue: AttentionQueue, reason: AttentionReason): MemberAttention[] {
  const pool = ATTENTION_REASON_META[reason].severity === 'celebrate' ? [...queue.rows, ...queue.celebrate] : queue.rows;
  return pool.filter((row) => row.reasons.includes(reason));
}

/** Flagged member ids — the set every surface must agree on. */
export function flaggedMemberIds(queue: AttentionQueue): Set<string> {
  return new Set(queue.rows.map((row) => row.memberId));
}
