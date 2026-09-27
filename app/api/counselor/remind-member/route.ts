import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getSubjectOrganizationId } from "@/lib/tenant/organization";
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { sendInactiveNudgeEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw: unknown = await request.json().catch(() => null);
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const memberId = typeof body.userId === 'string' ? body.userId : '';
  const daysInactive = typeof body.daysInactive === 'number' ? body.daysInactive : 0;

  if (!memberId) {
    return NextResponse.json({ error: 'Member ID required' }, { status: 400 });
  }

  const allowed = await assertStaffCanAccessMemberRecord(user.id, memberId);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = await getSubjectOrganizationId(memberId);
  const member = await withTenantScope(orgId, (db) =>
    db.user.findFirst({
      where: { id: memberId },
      select: { email: true, fullName: true },
    }),
  );

  if (!member?.email) {
    return NextResponse.json({ error: 'Member has no email on file' }, { status: 400 });
  }

  const emailResult = await sendInactiveNudgeEmail({
    to: member.email,
    recipientUserId: memberId,
    fullName: member.fullName ?? '',
  });

  if (!emailResult.ok && emailResult.error === 'inactive_member') {
    return NextResponse.json({ error: 'Member is no longer active' }, { status: 409 });
  }

  await prisma.$executeRaw`
    INSERT INTO member_events (id, user_id, event_name, entity_type, entity_id, metadata, created_at)
    VALUES (
      gen_random_uuid(),
      ${memberId},
      'reminder_sent',
      'counselor_action',
      ${user.id},
      ${JSON.stringify({
        daysInactive,
        sentBy: user.id,
        sentAt: new Date().toISOString(),
        emailDelivered: emailResult.ok,
        emailError: emailResult.error ?? null,
      })},
      NOW()
    )
  `;

  auditLog({
    actorUserId: user.id,
    action: 'counselor_remind_member',
    targetType: 'User',
    targetId: memberId,
    metadata: { daysInactive, emailDelivered: emailResult.ok },
  }).catch(() => {});
  logAuditEvent({
    user: { id: user.id, role: 'counselor' },
    verb: 'reminded',
    object: { type: 'User', id: memberId },
    result: { success: emailResult.ok, extensions: { daysInactive } },
  }).catch(() => {});

  if (!emailResult.ok) {
    return NextResponse.json(
      { ok: false, message: 'Reminder logged but email failed to send.', error: emailResult.error ?? 'Email not configured' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: 'Reminder email sent.' });

  } catch (error) {
    console.error('/counselor/remind-member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

