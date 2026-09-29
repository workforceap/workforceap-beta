import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { sendCounselorAssignedEmail } from '@/lib/email';
import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { createNotification } from '@/lib/notifications/create';
import { notifyCounselorOfStaffAssignment } from '@/lib/counselor/staffAssignmentNotify';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const bodySchema = z.object({
  counselorUserId: z.string().uuid(),
});

type Props = { params: Promise<{ id: string }> };export const POST = withApiGuc(async (request: NextRequest, { params }: Props) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: memberId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  // Tenant scope: both member and counselor must belong to this admin's
  // org. Without this, an Org A admin could reassign an Org B member's
  // counselor (visible to wrong tenant) or assign an Org A counselor to
  // an Org B member.
  const orgId = await getActorOrganizationId(user.id);
  const member = await prisma.$transaction((tx) => tx.user.findFirst({
    where: { id: memberId, deletedAt: null, organizationId: orgId },
    select: { id: true, email: true, fullName: true, organizationId: true },
  }));
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const counselor = await prisma.$transaction((tx) => tx.counselor.findFirst({
    where: {
      userId: parsed.data.counselorUserId,
      active: true,
      user: { organizationId: orgId, deletedAt: null },
    },
    include: { user: { select: { id: true, fullName: true } } },
  }));
  if (!counselor) {
    return NextResponse.json({ error: 'Counselor not found or inactive' }, { status: 400 });
  }

  const { thread, previousCounselorUserId, previousCounselorName } = await prisma.$transaction((tx) => assignMemberCounselor(tx, {
    memberId, organizationId: orgId, counselorUserId: counselor.userId,
  }));

  let notificationEmailSent = false;
  try {
    const emailResult = await sendCounselorAssignedEmail({
      to: member.email,
      memberFullName: member.fullName,
      counselorFullName: counselor.user.fullName,
      orgId: member.organizationId,
    });
    notificationEmailSent = emailResult.ok;
  } catch (emailError) {
    console.error('[admin/member/counselor] assignment committed but email failed', emailError);
  }

  await createNotification({
    userId: memberId,
    type: 'task_assigned',
    title: 'You have a new advisor',
    body: `${counselor.user.fullName} has been assigned as your career advisor.`,
    data: { counselorId: counselor.id, counselorUserId: counselor.userId, threadId: thread.id },
  });

  await notifyCounselorOfStaffAssignment({
    counselorUserId: counselor.userId,
    actorUserId: user.id,
    members: [{ memberId, memberName: member.fullName, previousCounselorUserId }],
    logPrefix: '[admin/member/counselor]',
  });

  const handoff = {
    counselorUserId: counselor.userId,
    previousCounselorUserId,
    previousCounselorName,
  };
  void auditLog({ actorUserId: user.id, action: 'admin_member_counselor_assign', targetType: 'user', targetId: memberId, metadata: { ...handoff, counselorName: counselor.user.fullName } }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'updated', object: { type: 'CounselorAssignment', id: memberId }, result: { success: true, extensions: handoff } }).catch(() => {});

  return NextResponse.json({
    ok: true,
    counselorName: counselor.user.fullName,
    notificationEmailSent,
    warning: notificationEmailSent
      ? undefined
      : 'Counselor assigned, but the member notification email was not sent.',
  });

  } catch (error) {
    console.error('/admin/members/[id]/counselor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

