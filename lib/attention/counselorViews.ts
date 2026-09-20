/**
 * Pure projections of one `AttentionQueue` onto the four counselor surfaces.
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
