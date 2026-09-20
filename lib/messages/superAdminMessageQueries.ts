import { prisma } from '@/lib/db/prisma';

const HOURS_48_MS = 48 * 60 * 60 * 1000;
const HOURS_72_MS = 72 * 60 * 60 * 1000;

export type ThreadSlaRow = {
  threadId: string;
  memberLastMessageAt: Date | null;
  needsCounselorReply: boolean;
  breached48h: boolean;
  breached72h: boolean;
};

/**
 * For each thread: if the latest message from the member has no later counselor/staff message,
 * the thread "needs" a counselor reply. SLA breach when that member message is older than 48h / 72h.
 *
 * Uses a single raw query to avoid loading entire thread histories (N+1 / memory bloat).
 */
export async function getSlaStatusForThreads(threadIds: string[]): Promise<Map<string, ThreadSlaRow>> {
  const map = new Map<string, ThreadSlaRow>();
  if (threadIds.length === 0) return map;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ thread_id: string; member_last_msg_at: Date; has_staff_after: boolean }>
  >(
    `WITH latest_member_message AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id,
         m.created_at AS member_last_msg_at
       FROM messages m
       JOIN message_threads t ON m.thread_id = t.id
       WHERE m.thread_id = ANY($1)
         AND m.author_id = t.member_id
         AND t.kind = 'member'
       ORDER BY m.thread_id, m.created_at DESC
     )
     SELECT
       lmm.thread_id,
       lmm.member_last_msg_at,
       EXISTS (
         SELECT 1 FROM messages m2
         JOIN message_threads t2 ON m2.thread_id = t2.id
         WHERE m2.thread_id = lmm.thread_id
           AND m2.author_id != t2.member_id
           AND m2.created_at > lmm.member_last_msg_at
       ) AS has_staff_after
     FROM latest_member_message lmm`,
    threadIds,
  );

  const now = Date.now();
  for (const row of rows) {
    const needsCounselorReply = !row.has_staff_after;
    const ageMs = now - row.member_last_msg_at.getTime();

    map.set(row.thread_id, {
      threadId: row.thread_id,
      memberLastMessageAt: row.member_last_msg_at,
      needsCounselorReply,
      breached48h: needsCounselorReply && ageMs >= HOURS_48_MS,
      breached72h: needsCounselorReply && ageMs >= HOURS_72_MS,
    });
  }

  return map;
}

export async function countThreadsWithSlaBreach(minHours: 48 | 72, organizationId?: string): Promise<number> {
  const thresholdMs = minHours === 48 ? HOURS_48_MS : HOURS_72_MS;
  const threshold = new Date(Date.now() - thresholdMs);

  const result = await prisma.$queryRawUnsafe<
    Array<{ count: number }>
  >(
    `WITH latest_member_message AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id,
         m.created_at AS member_last_msg_at
       FROM messages m
       JOIN message_threads t ON m.thread_id = t.id
       WHERE t.kind = 'member'
         AND m.author_id = t.member_id
         AND t.member_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = t.member_id AND u.deleted_at IS NULL
           AND ($2::text IS NULL OR u.organization_id = $2))
       ORDER BY m.thread_id, m.created_at DESC
     )
     SELECT COUNT(*)::int AS count
     FROM latest_member_message lmm
     JOIN message_threads t ON lmm.thread_id = t.id
     WHERE lmm.member_last_msg_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM messages m2
         JOIN message_threads t2 ON m2.thread_id = t2.id
         WHERE m2.thread_id = lmm.thread_id
           AND m2.author_id != t2.member_id
           AND m2.created_at > lmm.member_last_msg_at
       )`,
    threshold,
    organizationId ?? null,
  );

  return result[0]?.count ?? 0;
}

/**
 * Member threads whose latest member message has no staff reply after it,
 * regardless of age. This is the staff-facing "unanswered member messages"
 * count (WAP-168 fix 3); the SLA counters above only start at 48h, so a
 * message sent yesterday was invisible to every badge and dashboard.
 */
export async function countUnansweredMemberThreads(organizationId?: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `WITH latest_member_message AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id,
         m.created_at AS member_last_msg_at
       FROM messages m
       JOIN message_threads t ON m.thread_id = t.id
       WHERE t.kind = 'member'
         AND m.author_id = t.member_id
         AND t.member_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = t.member_id AND u.deleted_at IS NULL
           AND ($1::text IS NULL OR u.organization_id = $1))
       ORDER BY m.thread_id, m.created_at DESC
     )
     SELECT COUNT(*)::int AS count
     FROM latest_member_message lmm
     WHERE NOT EXISTS (
       SELECT 1 FROM messages m2
       JOIN message_threads t2 ON m2.thread_id = t2.id
       WHERE m2.thread_id = lmm.thread_id
         AND m2.author_id != t2.member_id
         AND m2.created_at > lmm.member_last_msg_at
     )`,
    organizationId ?? null,
  );
  return result[0]?.count ?? 0;
}

export async function countMessageThreadsWithActivity(): Promise<number> {
  return prisma.messageThread.count({
    where: { kind: 'member', messages: { some: {} } },
  });
}

/** Thread IDs where the latest member message has no staff reply after it and member message is older than `threshold`. */
export async function getThreadIdsBreachingSla(threshold: Date, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ thread_id: string; member_last_msg_at: Date }>
  >(
    `WITH latest_member_message AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id,
         m.created_at AS member_last_msg_at
       FROM messages m
       JOIN message_threads t ON m.thread_id = t.id
       WHERE t.kind = 'member'
         AND m.author_id = t.member_id
         AND t.member_id IS NOT NULL
         AND t.member_id IN (SELECT id FROM users WHERE deleted_at IS NULL)
       ORDER BY m.thread_id, m.created_at DESC
     )
     SELECT lmm.thread_id, lmm.member_last_msg_at
     FROM latest_member_message lmm
     WHERE lmm.member_last_msg_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM messages m2
         JOIN message_threads t2 ON m2.thread_id = t2.id
         WHERE m2.thread_id = lmm.thread_id
           AND m2.author_id != t2.member_id
           AND m2.created_at > lmm.member_last_msg_at
       )
     ORDER BY lmm.member_last_msg_at ASC
     LIMIT $2`,
    threshold,
    limit,
  );

  return rows.map(r => r.thread_id);
}
