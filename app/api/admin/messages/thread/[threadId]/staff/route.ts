import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { assertStaffCanPost, normalizeMessageBody, serializeMessage } from '@/lib/messages/counselorThread';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { createNotification } from '@/lib/notifications/create';
import { STAFF_MESSAGE_NOTIFICATION_TITLE } from '@/lib/messages/staffMessageNotification';

import { withApiGuc } from '@/lib/db/withRequestGuc';

type Props = { params: Promise<{ threadId: string }> };async function _POST(request: NextRequest, { params }: Props) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { threadId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof (body as { body?: unknown }).body === 'string' ? (body as { body: string }).body : '';
  const normalized = normalizeMessageBody(text);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const canPost = await assertStaffCanPost(user.id, threadId);
  if (!canPost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { msg, thread } = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        threadId,
        authorId: user.id,
        body: normalized.body,
      },
    });
    const t = await tx.messageThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(),
        staffUserId: user.id,
        staffLastReadAt: new Date(),
      },
      select: { kind: true, memberId: true },
    });
    return { msg: m, thread: t };
  });

  // A member thread gets the same in-app notification the counselor route
  // creates; employer / partner threads have their own portal badges.
  if (thread.kind === 'member' && thread.memberId) {
    await createNotification({
      userId: thread.memberId,
      type: 'message',
      title: STAFF_MESSAGE_NOTIFICATION_TITLE,
      body: normalized.body.slice(0, 200),
      data: { threadId, authorId: user.id, link: '/dashboard/messages' },
    });
  }

  auditLog({
    actorUserId: user.id,
    action: 'admin_message_sent',
    targetType: 'MessageThread',
    targetId: threadId,
    metadata: { messageId: msg.id },
  }).catch((err) => console.error('[messages/thread/staff] audit log failed:', err));
  logAuditEvent({
    user: { id: user.id, role: 'super_admin' },
    verb: 'sent',
    object: { type: 'StaffMessage', id: msg.id },
    result: { success: true, extensions: { threadId } },
    request: auditRequestMeta(request),
  }).catch((err) => console.error('[messages/thread/staff] xAPI audit log failed:', err));

  return NextResponse.json({ message: serializeMessage(msg) });

  } catch (error) {
    console.error('/admin/messages/thread/[threadId]/staff error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);async function _PATCH(_request: NextRequest, { params }: Props) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { threadId } = await params;

  const access = await assertStaffCanPost(user.id, threadId);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  await prisma.$transaction((tx) => tx.messageThread.update({
    where: { id: threadId },
    data: {
      staffLastReadAt: now,
      staffUserId: user.id,
    },
  }));

  return NextResponse.json({ ok: true, staffLastReadAt: now.toISOString() });

  } catch (error) {
    console.error('/admin/messages/thread/[threadId]/staff error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);

