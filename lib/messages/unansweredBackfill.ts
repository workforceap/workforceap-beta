import type { Prisma, PrismaClient } from '@prisma/client';
import { counselorMemberThreadLink } from './staffLinks';

/**
 * Historical repair for WAP-168 fix 2.
 *
 * The admin fallback notification for member messages landed on 2026-09-18
 * and only covers messages sent from then on. A member message sent earlier
 * into a thread with nobody on the other end (or pinned to a staff account
 * that never read it) has no notification row anywhere, so nobody is pushed
 * to answer it. This module finds every member thread whose latest member
 * message still has no staff reply AND no `type = 'message'` notification to
 * a staff user created at or after that message, and creates the missing
 * notification for the thread's counselor of record or, failing that, the
 * org's admins.
 *
 * Pure planning is separated from writing so the script can run as a dry run
 * and so the decision table is unit-testable without a database.
 */

export type UnansweredThreadRow = {
  threadId: string;
  memberId: string;
  organizationId: string;
  memberLabel: string;
  counselorUserId: string | null;
  messageId: string;
  messagePreview: string;
  memberLastMessageAt: Date;
  staffNotificationsSince: number;
};

export type BackfillPlanEntry = {
  threadId: string;
  memberId: string;
  messageId: string;
  memberLastMessageAt: Date;
  recipientUserIds: string[];
  route: 'counselor' | 'admins' | 'none';
  title: string;
  body: string;
  link: string;
};

export type NotificationWriter = (input: {
  userId: string;
  type: 'message';
  title: string;
  body: string;
  data: Record<string, unknown>;
}) => Promise<void>;

type Db = Pick<PrismaClient, '$queryRawUnsafe' | 'profile' | 'userRole' | 'user' | 'notification'>;

/** Threads still awaiting a staff reply with no staff notification since the member wrote. */
export async function findUnansweredThreadsMissingStaffNotification(db: Db): Promise<UnansweredThreadRow[]> {
  const rows = await db.$queryRawUnsafe<Array<{
    thread_id: string;
    member_id: string;
    organization_id: string;
    member_label: string;
    counselor_user_id: string | null;
    message_id: string;
    body: string;
    member_last_msg_at: Date;
    staff_notifications_since: number;
  }>>(
    `WITH latest_member_message AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id, m.id AS message_id, m.body, m.created_at AS member_last_msg_at
       FROM messages m
       JOIN message_threads t ON m.thread_id = t.id
       WHERE t.kind = 'member' AND t.member_id IS NOT NULL AND m.author_id = t.member_id
       ORDER BY m.thread_id, m.created_at DESC
     )
     SELECT
       t.id AS thread_id,
       t.member_id,
       u.organization_id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), u.email, 'member') AS member_label,
       t.counselor_user_id,
       lmm.message_id,
       lmm.body,
       lmm.member_last_msg_at,
       (
         SELECT COUNT(*)::int FROM notifications n
         WHERE n.type = 'message'
           AND n.data->>'threadId' = t.id
           AND n.user_id <> t.member_id
           AND n.created_at >= lmm.member_last_msg_at
       ) AS staff_notifications_since
     FROM latest_member_message lmm
     JOIN message_threads t ON t.id = lmm.thread_id
     JOIN users u ON u.id = t.member_id AND u.deleted_at IS NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM messages m2
       WHERE m2.thread_id = t.id AND m2.author_id <> t.member_id AND m2.created_at > lmm.member_last_msg_at
     )
     ORDER BY lmm.member_last_msg_at ASC`,
  );
  return rows
    .filter((row) => row.staff_notifications_since === 0)
    .map((row) => ({
      threadId: row.thread_id,
      memberId: row.member_id,
      organizationId: row.organization_id,
      memberLabel: row.member_label,
      counselorUserId: row.counselor_user_id,
      messageId: row.message_id,
      messagePreview: row.body.slice(0, 200),
      memberLastMessageAt: row.member_last_msg_at,
      staffNotificationsSince: row.staff_notifications_since,
    }));
}

/** Active (non-deleted) admin user ids for an organization, from both role authorities. */
export async function resolveOrgAdminUserIds(db: Db, organizationId: string): Promise<string[]> {
  const [profileAdmins, userRoleAdmins] = await Promise.all([
    db.profile.findMany({
      where: { role: { in: ['admin', 'super_admin'] }, user: { organizationId, deletedAt: null } },
      select: { userId: true },
    }),
    db.userRole.findMany({
      where: { role: { name: 'admin' }, user: { organizationId, deletedAt: null } },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...profileAdmins.map((row) => row.userId), ...userRoleAdmins.map((row) => row.userId)])];
}

/**
 * Decide who gets the back-filled notification. Prefers the thread's
 * counselor of record when that user still exists and is not the member;
 * otherwise the org admins, mirroring `notifyUnassignedMemberMessage`.
 */
export function planBackfillEntry(
  row: UnansweredThreadRow,
  input: { counselorExists: boolean; adminUserIds: string[] },
): BackfillPlanEntry {
  const base = {
    threadId: row.threadId,
    memberId: row.memberId,
    messageId: row.messageId,
    memberLastMessageAt: row.memberLastMessageAt,
    body: row.messagePreview,
  };
  if (row.counselorUserId && row.counselorUserId !== row.memberId && input.counselorExists) {
    return {
      ...base,
      recipientUserIds: [row.counselorUserId],
      route: 'counselor',
      title: `Unanswered message from ${row.memberLabel}`,
      link: counselorMemberThreadLink(row.memberId),
    };
  }
  const recipientUserIds = input.adminUserIds.filter((id) => id !== row.memberId);
  return {
    ...base,
    recipientUserIds,
    route: recipientUserIds.length > 0 ? 'admins' : 'none',
    title: `Unanswered member message from ${row.memberLabel}`,
    link: '/admin/messages',
  };
}

export async function planUnansweredBackfill(db: Db): Promise<BackfillPlanEntry[]> {
  const rows = await findUnansweredThreadsMissingStaffNotification(db);
  const adminCache = new Map<string, string[]>();
  const plan: BackfillPlanEntry[] = [];
  for (const row of rows) {
    let adminUserIds = adminCache.get(row.organizationId);
    if (!adminUserIds) {
      adminUserIds = await resolveOrgAdminUserIds(db, row.organizationId);
      adminCache.set(row.organizationId, adminUserIds);
    }
    const counselorExists = row.counselorUserId
      ? Boolean(await db.user.findFirst({ where: { id: row.counselorUserId, deletedAt: null }, select: { id: true } }))
      : false;
    plan.push(planBackfillEntry(row, { counselorExists, adminUserIds }));
  }
  return plan;
}

/** Writes the same row shape `createNotification` does, without its push/Discord side effects. */
export function prismaNotificationWriter(db: Pick<PrismaClient, 'notification'>): NotificationWriter {
  return async (input) => {
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue,
      },
    });
  };
}

export async function applyUnansweredBackfill(
  plan: BackfillPlanEntry[],
  write: NotificationWriter,
): Promise<{ notificationsCreated: number; threadsNotified: number; threadsWithoutRecipient: number }> {
  let notificationsCreated = 0;
  let threadsNotified = 0;
  let threadsWithoutRecipient = 0;
  for (const entry of plan) {
    if (entry.route === 'none') {
      threadsWithoutRecipient += 1;
      continue;
    }
    for (const userId of entry.recipientUserIds) {
      await write({
        userId,
        type: 'message',
        title: entry.title,
        body: entry.body,
        data: {
          threadId: entry.threadId,
          memberId: entry.memberId,
          messageId: entry.messageId,
          link: entry.link,
          unassigned: entry.route === 'admins',
          backfill: 'wap-168',
          memberLastMessageAt: entry.memberLastMessageAt.toISOString(),
        },
      });
      notificationsCreated += 1;
    }
    threadsNotified += 1;
  }
  return { notificationsCreated, threadsNotified, threadsWithoutRecipient };
}
