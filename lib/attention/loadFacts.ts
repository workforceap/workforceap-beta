/**
 * Fetch the facts the attention rules need for a set of members.
 *
 * One loader for every surface: the counselor pages hand it their assigned
 * member ids, the admin pages hand it the member-only org roster. Rules never
 * run against a fact this loader did not fetch, which is what keeps the
 * numbers identical across pages.
 *
 * Every raw query binds the ids as `text[]` — `message_threads.member_id` and
 * `member_events.user_id` are text columns, and a `uuid[]` bind fails with
 * Postgres 42883 (regression covered in lib/attention/loadFacts.test.ts).
 */

import { prisma } from '@/lib/db/prisma';
import { ATTENTION_THRESHOLDS as T } from './reasons';
import type { MemberAttentionInput } from './evaluate';

/** Alerts still owned by someone: open, acknowledged or escalated. Resolved ones never count. */
export const ACTIVE_RISK_ALERT_STATUSES = ['open', 'acknowledged', 'escalated'] as const;

const MILESTONE_EVENTS = ['course_completed', 'certification_earned'];
const FOLLOW_UP_EVENTS = ['computer_support_followup_recorded', 'counselor_followup_recorded'];
const FOLLOW_UP_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The slice of the Prisma client the loader touches; a tenant-scoped client satisfies it too. */
export type AttentionDb = Pick<
  typeof prisma,
  'user' | 'counselorAssignment' | 'application' | 'atRiskAlert' | 'memberEvent' | '$queryRawUnsafe'
>;

type LastActivityRow = { user_id: string; last_at: Date | null };
type LatestMessageRow = {
  member_id: string | null;
  thread_id: string;
  author_id: string;
  body: string | null;
  created_at: Date;
};
type StaffMessageRow = { member_id: string | null; staff_last_at: Date | null };

export function previewMessageBody(body: string | null | undefined, maxLen = 100): string {
  if (!body) return '';
  const trimmed = body.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

export async function loadAttentionFacts(
  memberIds: readonly string[],
  now: Date = new Date(),
  db: AttentionDb = prisma,
): Promise<MemberAttentionInput[]> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return [];

  const milestoneCutoff = new Date(now.getTime() - T.MILESTONE_WINDOW_DAYS * DAY_MS);
  const followUpCutoff = new Date(now.getTime() - FOLLOW_UP_LOOKBACK_DAYS * DAY_MS);

  const [
    members,
    assignments,
    lastActivity,
    latestMessages,
    staffMessages,
    applications,
    riskAlerts,
    followUpEvents,
    milestoneEvents,
  ] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        enrolledAt: true,
        createdAt: true,
        staleTrainingDetectedAt: true,
        needsComputerSupportFollowUp: true,
        profile: { select: { resumeOriginalPath: true, resumeEnhancedPath: true } },
      },
    }),
    db.counselorAssignment.findMany({
      where: { memberId: { in: ids }, active: true },
      select: { memberId: true, assignedAt: true },
      orderBy: { assignedAt: 'desc' },
    }),
    db.$queryRawUnsafe<LastActivityRow[]>(
      `SELECT user_id, MAX(created_at) AS last_at
       FROM member_events
       WHERE user_id = ANY($1::text[])
       GROUP BY user_id`,
      ids,
    ),
    // Newest message per member thread. The SLA rules only fire when that
    // message is the member's own (i.e. nobody has answered yet).
    db.$queryRawUnsafe<LatestMessageRow[]>(
      `SELECT DISTINCT ON (t.member_id) t.member_id, t.id AS thread_id, m.author_id, m.body, m.created_at
       FROM messages m
       JOIN message_threads t ON t.id = m.thread_id
       WHERE t.member_id = ANY($1::text[])
         AND t.kind = 'member'
       ORDER BY t.member_id, m.created_at DESC, m.id DESC`,
      ids,
    ),
    // Most recent staff-authored message per member. Not derivable from the
    // newest message above: when the member replied last, the counselor's
    // earlier reply would be lost and the milestone nudge would re-fire.
    db.$queryRawUnsafe<StaffMessageRow[]>(
      `SELECT t.member_id, MAX(m.created_at) AS staff_last_at
       FROM messages m
       JOIN message_threads t ON t.id = m.thread_id
       WHERE t.member_id = ANY($1::text[])
         AND t.kind = 'member'
         AND m.author_id <> t.member_id
       GROUP BY t.member_id`,
      ids,
    ),
    db.application.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, status: true, submittedAt: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.atRiskAlert.findMany({
      where: { userId: { in: ids }, status: { in: [...ACTIVE_RISK_ALERT_STATUSES] } },
      select: { id: true, userId: true, score: true, status: true },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    }),
    db.memberEvent.findMany({
      where: { userId: { in: ids }, eventName: { in: FOLLOW_UP_EVENTS }, createdAt: { gte: followUpCutoff } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.memberEvent.findMany({
      where: { userId: { in: ids }, eventName: { in: MILESTONE_EVENTS }, createdAt: { gte: milestoneCutoff } },
      select: { userId: true, eventName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const firstBy = <K, V>(rows: readonly V[], key: (row: V) => K | null | undefined): Map<K, V> => {
    const map = new Map<K, V>();
    for (const row of rows) {
      const k = key(row);
      if (k == null || map.has(k)) continue;
      map.set(k, row);
    }
    return map;
  };

  const assignmentByMember = firstBy(assignments, (a) => a.memberId);
  const lastActivityByMember = new Map<string, Date>();
  for (const row of lastActivity) if (row.last_at) lastActivityByMember.set(row.user_id, new Date(row.last_at));
  const latestMessageByMember = firstBy(latestMessages, (m) => m.member_id);
  const staffMessageByMember = new Map<string, Date>();
  for (const row of staffMessages) {
    if (row.member_id && row.staff_last_at) staffMessageByMember.set(row.member_id, new Date(row.staff_last_at));
  }
  const applicationByMember = firstBy(applications, (a) => a.userId);
  const riskAlertByMember = firstBy(riskAlerts, (a) => a.userId);
  const followUpByMember = firstBy(followUpEvents, (e) => e.userId);
  const milestoneByMember = firstBy(milestoneEvents, (e) => e.userId);

  return members.map((m): MemberAttentionInput => {
    const latest = latestMessageByMember.get(m.id);
    const unanswered = latest && latest.author_id === m.id
      ? { threadId: latest.thread_id, at: new Date(latest.created_at), preview: previewMessageBody(latest.body) }
      : null;
    const app = applicationByMember.get(m.id);
    const alert = riskAlertByMember.get(m.id);
    const milestone = milestoneByMember.get(m.id);
    return {
      memberId: m.id,
      memberName: m.fullName ?? m.email,
      memberEmail: m.email,
      enrolledProgram: m.enrolledProgram,
      enrolledAt: m.enrolledAt,
      createdAt: m.createdAt,
      assignedAt: assignmentByMember.get(m.id)?.assignedAt ?? null,
      hasResume: Boolean(m.profile?.resumeOriginalPath || m.profile?.resumeEnhancedPath),
      lastActivityAt: lastActivityByMember.get(m.id) ?? null,
      unansweredMessage: unanswered,
      lastStaffMessageAt: staffMessageByMember.get(m.id) ?? null,
      application: app ? { status: app.status, anchorAt: app.submittedAt ?? app.createdAt } : null,
      riskAlert: alert ? { alertId: alert.id, score: alert.score, status: alert.status } : null,
      staleTrainingDetectedAt: m.staleTrainingDetectedAt,
      needsComputerSupportFollowUp: m.needsComputerSupportFollowUp,
      lastComputerFollowUpAt: followUpByMember.get(m.id)?.createdAt ?? null,
      milestone: milestone ? { eventName: milestone.eventName, at: milestone.createdAt } : null,
    };
  });
}
