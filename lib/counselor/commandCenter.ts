import { prisma } from '@/lib/db/prisma';
import { COUNSELOR_ROSTER_CAP } from '@/lib/db/queryCaps';
import { loadPersistedAtRiskMembers, persistedRiskCommandRow } from '@/lib/member/persistedAtRisk';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { resolveAdminEnrolledMemberIds } from '@/lib/counselor/adminMemberScope';

/**
 * Counselor Command Center — Today's priorities.
 *
 * Per /plan-ceo-review brutal multi-persona review (2026-04-26): the
 * counselor portal was graded B but had no triage view. With 20+ active
 * members the counselor drowns within two weeks. This module gives the
 * counselor's home page three answers to "what should I do today?":
 *
 *   1. Members who messaged me — sorted oldest first, the 48h SLA stake
 *   2. Members with unresolved saved risk alerts
 *   3. Members interviewing this week — interview-prep tool was run
 *
 * Each row gets a one-click action so the counselor can resolve in seconds:
 * Open thread → Reply, Open profile → Check in, Open session → Run prep.
 */

export type CommandCenterRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
};

export type NeedsReplyRow = CommandCenterRow & {
  threadId: string;
  lastMessageBody: string | null;
  lastMessageAt: Date;
  hoursWaiting: number;
};

export type AtRiskRow = CommandCenterRow & {
  /** Whole days since the last MemberEvent; `null` when none was ever recorded. */
  daysInactive: number | null;
  enrolledProgram: string | null;
  riskScore?: number;
  alertStatus?: string;
  alertId?: string;
};

export type InterviewingRow = CommandCenterRow & {
  role: string | null;
  lastRunAt: Date;
};

export type CommandCenter = {
  needsReply: NeedsReplyRow[];
  atRisk: AtRiskRow[];
  interviewing: InterviewingRow[];
  totals: {
    needsReplyCount: number;
    atRiskCount: number;
    interviewingCount: number;
    /** Of needsReply, how many breach the 48h SLA (Decision 1) */
    slaBreachCount: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the Command Center for a counselor (or admin viewing the page).
 *
 * - For counselors: scopes to members in their active assignments.
 * - For admins (no counselor record): scopes to all enrolled members in the
 *   org — admin acts as a force-multiplier or stand-in counselor.
 */
export async function getCounselorCommandCenter(
  counselorUserId: string,
  options?: { isAdmin?: boolean; perSectionLimit?: number },
): Promise<CommandCenter> {
  const limit = Math.max(1, Math.min(100, Math.floor(options?.perSectionLimit ?? 5)));
  const organizationId = await getActorOrganizationId(counselorUserId);

  // Scope: which member IDs is this counselor responsible for?
  let memberIds: string[] = [];
  if (options?.isAdmin) {
    memberIds = await resolveAdminEnrolledMemberIds(counselorUserId, 200);
  } else {
    const counselor = await prisma.counselor.findFirst({
      where: { userId: counselorUserId, active: true, user: { organizationId, deletedAt: null } },
      select: { id: true },
    });
    if (!counselor) {
      return emptyCommandCenter();
    }
    const assignments = await prisma.counselorAssignment.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where: { counselorId: counselor.id, active: true, member: { organizationId, deletedAt: null } },
      select: { memberId: true },
    });
    memberIds = assignments.map((a) => a.memberId);
  }
  const now = new Date();
  const savedRisk = await loadPersistedAtRiskMembers({
    organizationId, ...(options?.isAdmin ? {} : { counselorUserId }),
  }, { limit });
  const atRisk: AtRiskRow[] = savedRisk.rows.map((row) => persistedRiskCommandRow(row, now));
  if (memberIds.length === 0) {
    const center = emptyCommandCenter();
    return { ...center, atRisk, totals: { ...center.totals, atRiskCount: savedRisk.total } };
  }
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const slaBreachThreshold = new Date(now.getTime() - 2 * DAY_MS); // 48h

  // ── 1. Needs reply: threads where the LAST message author is the member.
  const threads = await prisma.messageThread.findMany({
    take: COUNSELOR_ROSTER_CAP,
    where: { memberId: { in: memberIds }, kind: 'member' },
    select: { id: true, memberId: true },
  });
  const threadIds = threads.map((t) => t.id);
  const lastMessages = threadIds.length
    ? await prisma.$queryRawUnsafe<Array<{
        id: string;
        thread_id: string;
        author_id: string;
        body: string | null;
        created_at: Date;
      }>>(
        `SELECT DISTINCT ON (thread_id) id, thread_id, author_id, body, created_at
         FROM messages
         WHERE thread_id = ANY($1::text[])
         ORDER BY thread_id, created_at DESC`,
        threadIds,
      )
    : [];

  const memberLookup = new Map<string, { id: string; fullName: string | null; email: string }>();
  if (memberIds.length > 0) {
    const users = await prisma.user.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where: { id: { in: memberIds } },
      select: { id: true, fullName: true, email: true, enrolledProgram: true },
    });
    for (const u of users) {
      memberLookup.set(u.id, { id: u.id, fullName: u.fullName, email: u.email });
    }
  }

  const needsReply: NeedsReplyRow[] = [];
  for (const lm of lastMessages) {
    const thread = threads.find((t) => t.id === lm.thread_id);
    if (!thread?.memberId) continue;
    if (lm.author_id !== thread.memberId) continue;
    const member = memberLookup.get(thread.memberId);
    if (!member) continue;
    const hoursWaiting = Math.max(0, Math.round((now.getTime() - lm.created_at.getTime()) / (60 * 60 * 1000)));
    needsReply.push({
      memberId: member.id,
      memberName: member.fullName ?? member.email,
      memberEmail: member.email,
      threadId: lm.thread_id,
      lastMessageBody: lm.body,
      lastMessageAt: lm.created_at,
      hoursWaiting,
    });
  }
  needsReply.sort((a, b) => a.lastMessageAt.getTime() - b.lastMessageAt.getTime()); // oldest first
  const slaBreachCount = needsReply.filter((r) => r.lastMessageAt < slaBreachThreshold).length;

  // ── 3. Interviewing this week: interview_practice AI tool runs in the last 7 days.
  const interviewRuns = await prisma.aIToolResult.findMany({
    take: COUNSELOR_ROSTER_CAP,
    where: {
      userId: { in: memberIds },
      toolType: 'interview_practice',
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, inputSummary: true, createdAt: true },
  });
  const seenInterview = new Set<string>();
  const interviewing: InterviewingRow[] = [];
  for (const r of interviewRuns) {
    if (seenInterview.has(r.userId)) continue;
    seenInterview.add(r.userId);
    const member = memberLookup.get(r.userId);
    if (!member) continue;
    interviewing.push({
      memberId: member.id,
      memberName: member.fullName ?? member.email,
      memberEmail: member.email,
      role: r.inputSummary || null,
      lastRunAt: r.createdAt,
    });
  }

  return {
    needsReply: needsReply.slice(0, limit),
    atRisk,
    interviewing: interviewing.slice(0, limit),
    totals: {
      needsReplyCount: needsReply.length,
      atRiskCount: savedRisk.total,
      interviewingCount: interviewing.length,
      slaBreachCount,
    },
  };
}

function emptyCommandCenter(): CommandCenter {
  return {
    needsReply: [],
    atRisk: [],
    interviewing: [],
    totals: {
      needsReplyCount: 0,
      atRiskCount: 0,
      interviewingCount: 0,
      slaBreachCount: 0,
    },
  };
}
