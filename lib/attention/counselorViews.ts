/**
 * Pure projections of one `AttentionQueue` onto the five counselor surfaces
 * (Today, Overview, Inbox zero, Triage, Work queue).
 *
 * Each page keeps its own layout and actions; what changes is that the rows
 * come from the same evaluated queue, so a member flagged on Inbox zero is
 * flagged on the Overview and in Triage, and the Work queue is visibly a
 * filter ("waiting on a reply") of that same set rather than a fourth opinion.
 */

import {
  ATTENTION_REASON_META,
  ATTENTION_REASON_RANK,
  attentionReasonLabel,
  emptyReasonCounts,
  type AttentionReason,
  type AttentionSeverity,
} from './reasons';
import type { AttentionContext, AttentionQueue, MemberAttention } from './evaluate';

// ─── Overview priority queue ─────────────────────────────────────────────────

export type PriorityBucket = 'critical' | 'warning' | 'ontrack';

export type PriorityQueueRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  bucket: PriorityBucket;
  /** Days since the member's last logged activity event; null when none is recorded. */
  daysSinceLogin: number | null;
  /** Hours since the last unanswered member message, if any. */
  hoursWaitingReply: number | null;
  /** Short human-readable primary reason for the row. */
  blockerReason: string;
  /** Stable timestamp for "recency of last contact" sort. */
  lastContactAt: Date | null;
  /** Every attention reason on the member, primary first. */
  flags: AttentionReason[];
  /** Thread id for the counselor-member thread, when a reply is owed. */
  threadId: string | null;
};

export type PriorityQueueData = {
  rows: PriorityQueueRow[];
  totals: { critical: number; warning: number; ontrack: number; total: number };
};

/** On-track rows are capped so an admin viewing a large cohort does not blow up the page. */
export const PRIORITY_QUEUE_ON_TRACK_DISPLAY_CAP = 50;

export function severityToBucket(severity: AttentionSeverity): PriorityBucket {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'ontrack';
}

function attentionToPriorityRow(row: MemberAttention, bucket: PriorityBucket): PriorityQueueRow {
  return {
    memberId: row.memberId,
    memberName: row.memberName,
    memberEmail: row.memberEmail,
    enrolledProgram: row.enrolledProgram,
    bucket,
    daysSinceLogin: row.context.daysInactive ?? null,
    hoursWaitingReply: row.context.hoursWaiting ?? null,
    blockerReason: attentionReasonLabel(row.primaryReason),
    lastContactAt: row.context.staleSince ?? row.context.milestoneAt ?? row.lastActivityAt,
    flags: row.reasons,
    threadId: row.context.threadId ?? null,
  };
}

export function toPriorityQueue(queue: AttentionQueue): PriorityQueueData {
  const flagged = queue.rows.map((row) => attentionToPriorityRow(row, severityToBucket(row.severity)));
  // Celebrations are not triage; they sit with the on-track members but keep their label.
  const onTrack: PriorityQueueRow[] = [
    ...queue.celebrate.map((row) => attentionToPriorityRow(row, 'ontrack')),
    ...queue.onTrack.map((member): PriorityQueueRow => ({
      memberId: member.memberId,
      memberName: member.memberName,
      memberEmail: member.memberEmail,
      enrolledProgram: member.enrolledProgram,
      bucket: 'ontrack',
      daysSinceLogin: null,
      hoursWaitingReply: null,
      blockerReason: 'On track',
      lastContactAt: member.lastActivityAt,
      flags: [],
      threadId: null,
    })),
  ];
  const onTrackTotal = onTrack.length;
  return {
    rows: [...flagged, ...onTrack.slice(0, PRIORITY_QUEUE_ON_TRACK_DISPLAY_CAP)],
    totals: {
      critical: queue.totals.critical,
      warning: queue.totals.warning,
      ontrack: onTrackTotal,
      total: flagged.length + onTrackTotal,
    },
  };
}

// ─── Inbox zero ──────────────────────────────────────────────────────────────

export type InboxZeroContext = AttentionContext;

export type InboxZeroRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  primaryFlag: AttentionReason;
  additionalFlags: AttentionReason[];
  /** 0 = critical ("Urgent"), 1 = warning ("Watch"). */
  priorityRank: number;
  severity: number;
  context: InboxZeroContext;
};

export type InboxZeroQueue = {
  rows: InboxZeroRow[];
  totals: {
    total: number;
    dismissedToday: number;
    byFlag: Record<AttentionReason, number>;
  };
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, celebrate: 2 };

export function toInboxZeroQueue(
  queue: AttentionQueue,
  options?: { handledToday?: ReadonlySet<string>; dismissedToday?: number },
): InboxZeroQueue {
  const handled = options?.handledToday ?? new Set<string>();
  const rows = queue.rows
    .filter((row) => !handled.has(row.memberId))
    .map((row): InboxZeroRow => ({
      memberId: row.memberId,
      memberName: row.memberName,
      memberEmail: row.memberEmail,
      enrolledProgram: row.enrolledProgram,
      primaryFlag: row.primaryReason,
      additionalFlags: row.reasons.slice(1),
      priorityRank: SEVERITY_RANK[row.severity],
      severity: row.urgency,
      context: row.context,
    }));
  const byFlag = emptyReasonCounts();
  for (const row of rows) {
    byFlag[row.primaryFlag] += 1;
    for (const flag of row.additionalFlags) byFlag[flag] += 1;
  }
  return {
    rows,
    totals: { total: rows.length, dismissedToday: options?.dismissedToday ?? 0, byFlag },
  };
}

// ─── Triage ──────────────────────────────────────────────────────────────────

export type TriagePriority = 'red' | 'yellow' | 'blue';
export type TriageContext = AttentionContext;

export type TriageRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  primaryFlag: AttentionReason;
  primaryPriority: TriagePriority;
  additionalFlags: AttentionReason[];
  context: TriageContext;
};

export type TriageQueue = {
  red: TriageRow[];
  yellow: TriageRow[];
  blue: TriageRow[];
  totals: {
    red: number;
    yellow: number;
    blue: number;
    total: number;
    byFlag: Record<AttentionReason, number>;
  };
};

export const SEVERITY_TO_TRIAGE_PRIORITY: Record<AttentionSeverity, TriagePriority> = {
  critical: 'red',
  warning: 'yellow',
  celebrate: 'blue',
};

export const FLAG_PRIORITY: Record<AttentionReason, TriagePriority> = Object.fromEntries(
  (Object.keys(ATTENTION_REASON_META) as AttentionReason[]).map((reason) => [
    reason,
    SEVERITY_TO_TRIAGE_PRIORITY[ATTENTION_REASON_META[reason].severity],
  ]),
) as Record<AttentionReason, TriagePriority>;

function attentionToTriageRow(row: MemberAttention): TriageRow {
  return {
    memberId: row.memberId,
    memberName: row.memberName,
    memberEmail: row.memberEmail,
    enrolledProgram: row.enrolledProgram,
    primaryFlag: row.primaryReason,
    primaryPriority: SEVERITY_TO_TRIAGE_PRIORITY[row.severity],
    additionalFlags: row.reasons.slice(1),
    context: row.context,
  };
}

export function toTriageQueue(queue: AttentionQueue): TriageQueue {
  const red = queue.rows.filter((r) => r.severity === 'critical').map(attentionToTriageRow);
  const yellow = queue.rows.filter((r) => r.severity === 'warning').map(attentionToTriageRow);
  const blue = queue.celebrate.map(attentionToTriageRow);
  const byFlag = emptyReasonCounts();
  for (const row of [...red, ...yellow, ...blue]) {
    byFlag[row.primaryFlag] += 1;
    for (const flag of row.additionalFlags) byFlag[flag] += 1;
  }
  return {
    red,
    yellow,
    blue,
    totals: { red: red.length, yellow: yellow.length, blue: blue.length, total: red.length + yellow.length + blue.length, byFlag },
  };
}

export function emptyTriageQueue(): TriageQueue {
  return { red: [], yellow: [], blue: [], totals: { red: 0, yellow: 0, blue: 0, total: 0, byFlag: emptyReasonCounts() } };
}

// ─── Work queue ──────────────────────────────────────────────────────────────

export type WorkQueueRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  threadId: string;
  lastMessageBody: string;
  lastMessageAt: Date;
  hoursWaiting: number;
};

export const WORK_QUEUE_REASONS: readonly AttentionReason[] = ['sla_breach_48h', 'sla_warning_24h'];

/** Members waiting on a reply (24h+), most overdue first. A filter of the flagged set, never a superset. */
export function toWorkQueueRows(queue: AttentionQueue, now: Date): WorkQueueRow[] {
  const HOUR_MS = 60 * 60 * 1000;
  return queue.rows
    .filter((row) => row.reasons.some((reason) => WORK_QUEUE_REASONS.includes(reason)))
    .flatMap((row): WorkQueueRow[] => {
      const threadId = row.context.threadId;
      const hoursWaiting = row.context.hoursWaiting;
      if (!threadId || hoursWaiting == null) return [];
      return [{
        memberId: row.memberId,
        memberName: row.memberName,
        memberEmail: row.memberEmail,
        threadId,
        lastMessageBody: row.context.lastMessagePreview ?? '',
        lastMessageAt: new Date(now.getTime() - hoursWaiting * HOUR_MS),
        hoursWaiting,
      }];
    })
    .sort((a, b) => b.hoursWaiting - a.hoursWaiting);
}

/** What the Work queue prints when it is empty but the shared queue is not. */
export type WorkQueueContext = {
  /** Members flagged for any reason (the number Inbox zero and the Overview print). */
  flaggedTotal: number;
  /** Of those, how many are waiting on a reply (the rows this page shows). */
  awaitingReply: number;
};

export function toWorkQueueContext(queue: AttentionQueue): WorkQueueContext {
  const awaitingReply = queue.rows.filter((row) =>
    row.reasons.some((reason) => WORK_QUEUE_REASONS.includes(reason)),
  ).length;
  return { flaggedTotal: queue.totals.flagged, awaitingReply };
}

/** Reasons in rank order — for the Triage page's per-reason strip. */
export function orderedReasonCounts(byFlag: Record<AttentionReason, number>): Array<{ reason: AttentionReason; count: number }> {
  return (Object.keys(byFlag) as AttentionReason[])
    .sort((a, b) => ATTENTION_REASON_RANK[a] - ATTENTION_REASON_RANK[b])
    .map((reason) => ({ reason, count: byFlag[reason] }));
}

// ─── Today ───────────────────────────────────────────────────────────────────

/**
 * The counselor landing page: one list of who needs attention today, grouped
 * by what kind of contact each member needs. A member appears once, in the
 * group of their primary (highest-ranked) reason; the rest of their reasons
 * ride along as `additionalReasons`. On-track members are never listed
 * (counselor audit 2026-09-20, §4.1: the queue must not list everyone).
 */
export type TodayGroupKey = 'at_risk' | 'reply_owed' | 'quiet' | 'follow_ups' | 'new' | 'celebrate';

export type TodayGroupMeta = {
  label: string;
  /** One line under the group title saying what lands here. */
  description: string;
  /** What the group prints when nobody is in it. */
  emptyTitle: string;
  reasons: readonly AttentionReason[];
};

/** Group order on the page — most pressing first (mirrors `ATTENTION_REASONS` rank). */
export const TODAY_GROUP_ORDER: readonly TodayGroupKey[] = [
  'at_risk',
  'reply_owed',
  'quiet',
  'follow_ups',
  'new',
  'celebrate',
];

export const TODAY_GROUPS: Record<TodayGroupKey, TodayGroupMeta> = {
  at_risk: {
    label: 'At risk',
    description: 'Saved risk alert, or no learning activity for 30+ days.',
    emptyTitle: 'Nobody at risk',
    reasons: ['risk_alert', 'no_activity_30d'],
  },
  reply_owed: {
    label: 'Reply owed',
    description: 'A member wrote and nobody on staff has answered in 24+ hours.',
    emptyTitle: 'No replies owed',
    reasons: ['sla_breach_48h', 'sla_warning_24h'],
  },
  quiet: {
    label: 'Quiet',
    description: 'Learning has gone quiet, training stalled, or you have not written in a week.',
    emptyTitle: 'Nobody has gone quiet',
    reasons: ['no_activity_10d', 'stale_training', 'no_counselor_contact_7d'],
  },
  follow_ups: {
    label: 'Follow-ups',
    description: 'Paperwork waiting on someone: resume, application, or a computer-access need.',
    emptyTitle: 'No follow-ups waiting',
    reasons: [
      'resume_missing_3d',
      'application_stalled_5d',
      'missing_info',
      'pending_application',
      'computer_support_followup',
    ],
  },
  new: {
    label: 'New to you',
    description: 'Joined this week and still has no counselor.',
    emptyTitle: 'No new members waiting for a counselor',
    reasons: ['new_no_counselor'],
  },
  celebrate: {
    label: 'Celebrate',
    description: 'A recent milestone you have not congratulated yet. Not counted as attention.',
    emptyTitle: 'No new milestones',
    reasons: ['milestone_reached'],
  },
};

const REASON_TO_TODAY_GROUP: Record<AttentionReason, TodayGroupKey> = Object.fromEntries(
  TODAY_GROUP_ORDER.flatMap((key) => TODAY_GROUPS[key].reasons.map((reason) => [reason, key])),
) as Record<AttentionReason, TodayGroupKey>;

export function todayGroupForReason(reason: AttentionReason): TodayGroupKey {
  return REASON_TO_TODAY_GROUP[reason];
}

export type TodayRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  group: TodayGroupKey;
  primaryReason: AttentionReason;
  additionalReasons: AttentionReason[];
  severity: AttentionSeverity;
  context: AttentionContext;
  /** Counselor-member thread when a reply is owed; the row links straight to it. */
  threadId: string | null;
};

export type TodayGroup = TodayGroupMeta & { key: TodayGroupKey; rows: TodayRow[] };

export type TodayQueue = {
  /** Every group, in `TODAY_GROUP_ORDER`, including empty ones (the page shows each empty state). */
  groups: TodayGroup[];
  totals: {
    /** critical + warning — the number the Overview, Inbox zero and Triage print. */
    flagged: number;
    critical: number;
    warning: number;
    /** Members waiting on a reply — the Work queue's row count. */
    awaitingReply: number;
    celebrate: number;
    onTrack: number;
    roster: number;
  };
};

function attentionToTodayRow(row: MemberAttention): TodayRow {
  return {
    memberId: row.memberId,
    memberName: row.memberName,
    memberEmail: row.memberEmail,
    enrolledProgram: row.enrolledProgram,
    group: todayGroupForReason(row.primaryReason),
    primaryReason: row.primaryReason,
    additionalReasons: row.reasons.slice(1),
    severity: row.severity,
    context: row.context,
    threadId: row.context.threadId ?? null,
  };
}

/** Group the shared queue for the Today page. Rows keep the queue's order inside each group. */
export function toTodayQueue(queue: AttentionQueue): TodayQueue {
  const groups: TodayGroup[] = TODAY_GROUP_ORDER.map((key) => ({ key, ...TODAY_GROUPS[key], rows: [] }));
  const byKey = new Map(groups.map((group) => [group.key, group]));
  for (const row of [...queue.rows, ...queue.celebrate]) {
    const today = attentionToTodayRow(row);
    byKey.get(today.group)?.rows.push(today);
  }
  return {
    groups,
    totals: {
      flagged: queue.totals.flagged,
      critical: queue.totals.critical,
      warning: queue.totals.warning,
      awaitingReply: toWorkQueueContext(queue).awaitingReply,
      celebrate: queue.totals.celebrate,
      onTrack: queue.totals.onTrack,
      roster: queue.totals.roster,
    },
  };
}
