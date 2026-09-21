/**
 * One rule for "which staff messages has this member not read yet", shared by
 * the nav badge (lib/portal/navBadges.ts) and the Messages page
 * (app/(portal)/dashboard/messages/page.tsx) so the two cannot drift.
 *
 * A null `memberLastReadAt` means the member has never opened Messages, so
 * every staff-authored message is unread. (Treating the missing marker as
 * "nothing unread" hid an 81-day-old staff reply behind no badge at all.)
 * Archived fixture rows are never counted.
 */
export const ARCHIVED_FIXTURE_MARKER = '[ARCHIVED FIXTURE]';

export type MemberUnreadStaffMessagesWhere = {
  threadId: string;
  authorId: { not: string };
  createdAt?: { gt: Date };
  NOT: { body: { contains: string } };
};

export function memberUnreadStaffMessagesWhere(args: {
  threadId: string;
  memberUserId: string;
  memberLastReadAt: Date | string | null | undefined;
}): MemberUnreadStaffMessagesWhere {
  const lastRead = args.memberLastReadAt ? new Date(args.memberLastReadAt) : null;
  return {
    threadId: args.threadId,
    authorId: { not: args.memberUserId },
    ...(lastRead && !Number.isNaN(lastRead.getTime()) ? { createdAt: { gt: lastRead } } : {}),
    NOT: { body: { contains: ARCHIVED_FIXTURE_MARKER } },
  };
}
