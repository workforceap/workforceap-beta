/**
 * "Who needs attention" — the single vocabulary shared by the admin Command
 * Center, the admin Detailed overview and the four counselor surfaces
 * (Overview, Inbox zero, Triage, Work queue).
 *
 * Before 2026-09-20 each surface had its own rule set and thresholds, so the
 * same eight members read as "0 at risk" on one page and "8 need attention"
 * on the next (admin audit §4.1, counselor audit §4.1). Every rule now lives
 * here once, with an explicit threshold, a plain-language label and the
 * definition that the UI prints next to the number.
 *
 * Severity:
 *   - critical  → red   ("Urgent"): act today.
 *   - warning   → gold  ("Watch"): touch base this week.
 *   - celebrate → blue: a recent win to reinforce. NOT counted as attention.
 *
 * This file is pure (no Prisma, no server-only) so `node --test` can load it.
 */

export const ATTENTION_THRESHOLDS = Object.freeze({
  /** Enrolled member with no learning activity for this many days → critical. */
  NO_ACTIVITY_CRITICAL_DAYS: 30,
  /** Enrolled member quiet for this many days (but under 30) → warning. */
  NO_ACTIVITY_WARNING_DAYS: 10,
  /** Member message unanswered for this many hours → critical (SLA breach). */
  REPLY_BREACH_HOURS: 48,
  /** Member message unanswered for this many hours → warning. */
  REPLY_WARNING_HOURS: 24,
  /** Assigned counselor has not messaged the member for this many days. */
  COUNSELOR_CONTACT_DAYS: 7,
  /** No resume on file this many days after counselor assignment. */
  RESUME_MISSING_DAYS: 3,
  /** Application pending / needs info for this many days. */
  APPLICATION_STALLED_DAYS: 5,
  /** A stale-training cron flag counts for this many days. */
  STALE_TRAINING_WINDOW_DAYS: 14,
  /** A course / certification milestone earns a celebration for this many days. */
  MILESTONE_WINDOW_DAYS: 7,
  /** "New" member window for the no-counselor-yet rule. */
  NEW_MEMBER_WINDOW_DAYS: 7,
});

export type AttentionSeverity = 'critical' | 'warning' | 'celebrate';

/**
 * Ordered by rank: the first matching reason is a member's primary reason.
 * The order within a severity is deliberate — saved alerts beat heuristics,
 * message SLAs beat paperwork.
 */
export const ATTENTION_REASONS = [
  // critical
  'risk_alert',
  'no_activity_30d',
  'sla_breach_48h',
  // warning
  'sla_warning_24h',
  'no_activity_10d',
  'stale_training',
  'no_counselor_contact_7d',
  'resume_missing_3d',
  'application_stalled_5d',
  'missing_info',
  'pending_application',
  'new_no_counselor',
  'computer_support_followup',
  // celebrate
  'milestone_reached',
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export type AttentionReasonMeta = {
  /** Short label printed on a row chip or tile, e.g. "Risk alert". */
  label: string;
  /** One-line definition printed next to the number so two pages never disagree silently. */
  definition: string;
  severity: AttentionSeverity;
};

const T = ATTENTION_THRESHOLDS;

export const ATTENTION_REASON_META: Record<AttentionReason, AttentionReasonMeta> = {
  risk_alert: {
    label: 'Risk alert',
    definition: 'Saved at-risk alert that is open, acknowledged or escalated',
    severity: 'critical',
  },
  no_activity_30d: {
    label: `No activity ${T.NO_ACTIVITY_CRITICAL_DAYS}+ days`,
    definition: `Enrolled, no learning activity recorded in ${T.NO_ACTIVITY_CRITICAL_DAYS}+ days`,
    severity: 'critical',
  },
  sla_breach_48h: {
    label: `Reply overdue ${T.REPLY_BREACH_HOURS}h+`,
    definition: `Member message waiting ${T.REPLY_BREACH_HOURS}+ hours without a staff reply`,
    severity: 'critical',
  },
  sla_warning_24h: {
    label: `Reply overdue ${T.REPLY_WARNING_HOURS}h+`,
    definition: `Member message waiting ${T.REPLY_WARNING_HOURS}–${T.REPLY_BREACH_HOURS - 1} hours without a staff reply`,
    severity: 'warning',
  },
  no_activity_10d: {
    label: `Quiet ${T.NO_ACTIVITY_WARNING_DAYS}+ days`,
    definition: `Enrolled, no learning activity in ${T.NO_ACTIVITY_WARNING_DAYS}–${T.NO_ACTIVITY_CRITICAL_DAYS - 1} days`,
    severity: 'warning',
  },
  stale_training: {
    label: 'Training stalled',
    definition: `Stale-training check flagged the course in the last ${T.STALE_TRAINING_WINDOW_DAYS} days`,
    severity: 'warning',
  },
  no_counselor_contact_7d: {
    label: `No counselor contact ${T.COUNSELOR_CONTACT_DAYS}+ days`,
    definition: `Assigned counselor has not messaged in ${T.COUNSELOR_CONTACT_DAYS}+ days (or ever)`,
    severity: 'warning',
  },
  resume_missing_3d: {
    label: `Resume missing ${T.RESUME_MISSING_DAYS}+ days`,
    definition: `No resume on file ${T.RESUME_MISSING_DAYS}+ days after counselor assignment`,
    severity: 'warning',
  },
  application_stalled_5d: {
    label: `Application stalled ${T.APPLICATION_STALLED_DAYS}+ days`,
    definition: `Application pending or needing info for ${T.APPLICATION_STALLED_DAYS}+ days`,
    severity: 'warning',
  },
  missing_info: {
    label: 'Missing info',
    definition: 'Application returned to the applicant for more information',
    severity: 'warning',
  },
  pending_application: {
    label: 'Pending application',
    definition: 'Application submitted and waiting for staff review',
    severity: 'warning',
  },
  new_no_counselor: {
    label: 'New, no counselor yet',
    definition: `Joined in the last ${T.NEW_MEMBER_WINDOW_DAYS} days with no active counselor assignment`,
    severity: 'warning',
  },
  computer_support_followup: {
    label: 'Computer support follow-up',
    definition: 'Career quiz flagged a computer-access need and no follow-up is recorded',
    severity: 'warning',
  },
  milestone_reached: {
    label: 'Recent milestone',
    definition: `Course completed or certification earned in the last ${T.MILESTONE_WINDOW_DAYS} days, not yet congratulated`,
    severity: 'celebrate',
  },
};

export const ATTENTION_REASON_RANK: Record<AttentionReason, number> = Object.fromEntries(
  ATTENTION_REASONS.map((reason, index) => [reason, index]),
) as Record<AttentionReason, number>;

/** Reasons that count toward "needs attention" (everything except celebrations). */
export const ATTENTION_ONLY_REASONS: readonly AttentionReason[] = ATTENTION_REASONS.filter(
  (reason) => ATTENTION_REASON_META[reason].severity !== 'celebrate',
);

export function attentionReasonLabel(reason: AttentionReason): string {
  return ATTENTION_REASON_META[reason].label;
}

export function attentionReasonDefinition(reason: AttentionReason): string {
  return ATTENTION_REASON_META[reason].definition;
}

export function attentionSeverityOf(reason: AttentionReason): AttentionSeverity {
  return ATTENTION_REASON_META[reason].severity;
}

export function emptyReasonCounts(): Record<AttentionReason, number> {
  return Object.fromEntries(ATTENTION_REASONS.map((reason) => [reason, 0])) as Record<
    AttentionReason,
    number
  >;
}
