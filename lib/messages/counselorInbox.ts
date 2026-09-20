import { Prisma } from '@prisma/client';
import type { MessageThread } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';

export type CounselorInboxRow = {
  memberId: string;
  memberName: string;
  threadId: string;
  programSubtitle: string;
  enrollmentStatus: 'enrolled' | 'not_enrolled';
  lastActivityLabel: string | null;
  preview: string;
  timeLabel: string;
  sortAt: string;
  unreadCount: number;
  /** Last message was from the member — counselor should reply. */
  needsReply: boolean;
};

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Unread member-authored messages per thread, as the counselor inbox counts
 * them: a thread the counselor has never opened (`counselor_last_read_at IS
 * NULL`) has every member message unread. The rail badge sums the same rows,
 * so the two can never disagree about which messages are unread. (Whether the
 * badge should count messages or threads is still an open product question.)
 */
export async function countUnreadMemberMessagesByThread(
  threadIds: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(threadIds)];
  const counts = new Map<string, number>(unique.map((id) => [id, 0]));
  if (unique.length === 0) return counts;
  const rows = await prisma.$queryRaw<Array<{ threadId: string; unread: number }>>`
    SELECT
      t.id AS "threadId",
      COUNT(m.id)::int AS unread
    FROM message_threads t
    LEFT JOIN messages m
      ON m.thread_id = t.id
     AND m.author_id = t.member_id
     AND (
       t.counselor_last_read_at IS NULL
       OR m.created_at > t.counselor_last_read_at
     )
    WHERE t.id IN (${Prisma.join(unique)})
    GROUP BY t.id
  `;
  for (const row of rows) counts.set(row.threadId, Number(row.unread ?? 0));
  return counts;
}

/**
 * Unread badges count THREADS, not messages (Mike, 2026-09-20 "Unreads as
 * threads"): a thread is unread when it holds at least one unread message.
 * The counselor rail badge, the inbox "Unread" tab and the member Messages
 * badge all apply this to the same per-thread counts.
 */
export function countThreadsWithUnread(unreadByThread: ReadonlyMap<string, number>): number {
  let threads = 0;
  for (const count of unreadByThread.values()) if (count > 0) threads += 1;
  return threads;
}

export async function buildCounselorInboxRows(
  memberIds: string[],
  opts: { readOnlyAudit?: boolean } = {},
): Promise<CounselorInboxRow[]> {
  if (memberIds.length === 0) return [];

  const members = await prisma.user.findMany({
    take: 500,
    where: { id: { in: memberIds } },
    select: {
      id: true,
      fullName: true,
      enrolledProgram: true,
      programInterest: true,
    },
  });
  const memberById = new Map(members.map((m) => [m.id, m]));

  const existingThreads = await prisma.messageThread.findMany({
    take: 500,
    where: { memberId: { in: memberIds } },
  });
  const threadByMemberId = new Map(
    existingThreads.filter((t) => t.memberId).map((t) => [t.memberId!, t])
  );

  const idsNeedingThread = memberIds.filter(
    (id) => memberById.has(id) && !threadByMemberId.has(id)
  );
  if (idsNeedingThread.length > 0 && !opts.readOnlyAudit) {
    const assignments = await prisma.counselorAssignment.findMany({
      take: 500,
      where: { memberId: { in: idsNeedingThread }, active: true },
      orderBy: { assignedAt: 'desc' },
      select: {
        memberId: true,
        counselor: { select: { userId: true, active: true } },
      },
    });
    const counselorUserIdByMember = new Map<string, string>();
    for (const row of assignments) {
      if (!row.counselor?.active) continue;
      if (!counselorUserIdByMember.has(row.memberId)) {
        counselorUserIdByMember.set(row.memberId, row.counselor.userId);
      }
    }

    try {
      await prisma.messageThread.createMany({
        data: idsNeedingThread.map((memberId) => ({
          kind: 'member',
          memberId,
          counselorUserId: counselorUserIdByMember.get(memberId) ?? null,
        })),
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        throw e;
      }
    }

    let ensured = await prisma.messageThread.findMany({
      take: 500,
      where: { memberId: { in: idsNeedingThread } },
    });
    const haveId = new Set(
      ensured.flatMap((t) => (t.memberId ? [t.memberId] : []))
    );
    const stillMissing = idsNeedingThread.filter((id) => !haveId.has(id));
    if (stillMissing.length > 0) {
      const fallback = await Promise.all(
        stillMissing.map((id) => getOrCreateMemberCounselorThread(id))
      );
      ensured = ensured.concat(fallback);
    }
    for (const t of ensured) {
      if (t.memberId) threadByMemberId.set(t.memberId, t);
    }
  }

  type LastMsgRow = {
    threadId: string;
    authorId: string | null;
    body: string;
    createdAt: Date;
  };
  type LastEventRow = { userId: string; createdAt: Date };

  const orderedMembers = memberIds.filter((id) => memberById.has(id));
  const threadsOrdered = orderedMembers
    .map((memberId) => {
      const thread = threadByMemberId.get(memberId);
      return thread ? { memberId, thread } : null;
    })
    .filter((x): x is { memberId: string; thread: MessageThread } => x !== null);

  const threadIds = [...new Set(threadsOrdered.map((x) => x.thread.id))];
  const uniqueMemberIds = [...new Set(orderedMembers)];

  const [latestMsgs, unreadByThread, lastEventRows] = await Promise.all([
    threadIds.length === 0
      ? ([] as LastMsgRow[])
      : prisma.$queryRaw<LastMsgRow[]>`
          SELECT DISTINCT ON (m.thread_id)
            m.thread_id AS "threadId",
            m.author_id AS "authorId",
            m.body,
            m.created_at AS "createdAt"
          FROM messages m
          WHERE m.thread_id IN (${Prisma.join(threadIds)})
          ORDER BY m.thread_id ASC, m.created_at DESC
        `,
    countUnreadMemberMessagesByThread(threadIds),
    uniqueMemberIds.length === 0
      ? ([] as LastEventRow[])
      : prisma.$queryRaw<LastEventRow[]>`
          SELECT DISTINCT ON (e.user_id)
            e.user_id AS "userId",
            e.created_at AS "createdAt"
          FROM member_events e
          WHERE e.user_id IN (${Prisma.join(uniqueMemberIds)})
          ORDER BY e.user_id ASC, e.created_at DESC
        `,
  ]);

  const lastMsgByThread = new Map(latestMsgs.map((r) => [r.threadId, r]));
  const lastEventByUser = new Map(lastEventRows.map((r) => [r.userId, r.createdAt]));

  const rows: CounselorInboxRow[] = [];

  for (const { memberId, thread } of threadsOrdered) {
    const m = memberById.get(memberId)!;

    const lastMsg = lastMsgByThread.get(thread.id);
    const unreadCount = unreadByThread.get(thread.id) ?? 0;

    const program = m.enrolledProgram ?? m.programInterest ?? '—';
    const sortAt = lastMsg?.createdAt ?? thread.createdAt;
    const needsReply = lastMsg ? lastMsg.authorId === memberId : false;
    const preview = lastMsg?.body?.slice(0, 100) ?? 'No messages yet';

    const lastMsgAt = lastMsg?.createdAt ?? null;
    const lastEventAt = lastEventByUser.get(memberId) ?? null;

    let activityAt: Date | null = null;
    if (lastMsgAt && lastEventAt) {
      activityAt = lastMsgAt > lastEventAt ? lastMsgAt : lastEventAt;
    } else {
      activityAt = lastMsgAt ?? lastEventAt ?? null;
    }

    const lastActivityLabel = activityAt
      ? `Last activity ${formatTimeLabel(activityAt.toISOString())}`
      : null;

    rows.push({
      memberId,
      memberName: m.fullName ?? 'Member',
      threadId: thread.id,
      programSubtitle: program,
      enrollmentStatus: m.enrolledProgram ? 'enrolled' : 'not_enrolled',
      lastActivityLabel,
      preview,
      timeLabel: formatTimeLabel(sortAt.toISOString()),
      sortAt: sortAt.toISOString(),
      unreadCount,
      needsReply,
    });
  }

  rows.sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0;
  });

  return rows;
}
