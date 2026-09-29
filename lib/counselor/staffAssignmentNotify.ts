import { createNotification } from '@/lib/notifications/create';

export type StaffAssignedMember = {
  memberId: string;
  memberName?: string | null;
  previousCounselorUserId: string | null;
};

/**
 * Tell the receiving counselor that staff moved members onto their caseload,
 * as self-serve assignment already does. One notification per request: a
 * single member deep-links to their record, several get one summary.
 *
 * Skipped for an unassign, for a counselor acting on their own caseload, and
 * for members who already had this counselor. Best-effort: the assignment is
 * committed before this runs, so a failure is logged and never thrown.
 */
export async function notifyCounselorOfStaffAssignment(input: {
  counselorUserId: string | null;
  actorUserId: string;
  members: StaffAssignedMember[];
  logPrefix: string;
}): Promise<void> {
  const { counselorUserId, actorUserId, logPrefix } = input;
  if (!counselorUserId || counselorUserId === actorUserId) return;
  const received = input.members.filter((m) => m.previousCounselorUserId !== counselorUserId);
  if (received.length === 0) return;

  const [only] = received;
  const notification = received.length === 1
    ? {
        title: 'A member was assigned to you',
        body: `${only.memberName?.trim() || 'A member'} was assigned to you.`,
        data: { memberId: only.memberId, link: `/counselor/students/${only.memberId}` },
      }
    : {
        title: `${received.length} members were assigned to you`,
        body: `${received.length} members were added to your caseload.`,
        data: { count: received.length, link: '/counselor/students' },
      };

  try {
    await createNotification({ userId: counselorUserId, type: 'task_assigned', ...notification });
  } catch (error) {
    console.error(`${logPrefix} assignment committed but counselor notification failed`, error);
  }
}
