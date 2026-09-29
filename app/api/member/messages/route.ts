import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { prisma } from '@/lib/db/prisma';
import {
  getOrCreateMemberCounselorThread,
  refreshMemberCounselorThread,
  assertMemberCanAccessThread,
  normalizeMessageBody,
  serializeMessage,
} from '@/lib/messages/counselorThread';
import { checkMessageRateLimit } from '@/lib/messages/rateLimit';
import { createNotification } from '@/lib/notifications/create';
import { notifyUnassignedMemberMessage } from '@/lib/messages/unassignedNotify';
import { counselorMemberThreadLink } from '@/lib/messages/staffLinks';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
async function _GET() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const thread = await getOrCreateMemberCounselorThread(user.id, {
    assignIfUnassigned: true,
  });
  const threadCounselorUserId = thread.counselorUserId;

  const [messages, counselor] = await Promise.all([
    prisma.$transaction((tx) => tx.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })),
    threadCounselorUserId
      ? prisma.$transaction((tx) => tx.user.findUnique({
          where: { id: threadCounselorUserId },
          select: { fullName: true },
        }))
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    thread: {
      id: thread.id,
      memberId: thread.memberId,
      counselorUserId: thread.counselorUserId,
      memberLastReadAt: thread.memberLastReadAt?.toISOString() ?? null,
      counselorLastReadAt: thread.counselorLastReadAt?.toISOString() ?? null,
    },
    counselorName: counselor?.fullName ?? null,
    messages: messages.map(serializeMessage),
  });

  } catch (error) {
    console.error('/member/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: NextRequest) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await readJsonObjectBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body : '';
  const normalized = normalizeMessageBody(text);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const rl = await checkMessageRateLimit(user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many messages. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const thread = await getOrCreateMemberCounselorThread(user.id, {
    assignIfUnassigned: true,
  });
  const ok = await assertMemberCanAccessThread(user.id, thread.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { msg, recipientId } = await prisma.$transaction(async (tx) => {
    // Resolve again under the same lock used by handoffs before persisting the
    // message, so an earlier inbox read cannot route a new message to old staff.
    const routedThread = await refreshMemberCounselorThread(tx, user.id);
    const m = await tx.message.create({
      data: {
        threadId: thread.id,
        authorId: user.id,
        body: normalized.body,
      },
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    return { msg: m, recipientId: routedThread.counselorUserId };
  });

  // Prefer the member's display name over their email in staff notifications;
  // fall back gracefully when the profile row is missing.
  const sender = await prisma.user
    .findUnique({ where: { id: user.id }, select: { fullName: true, organizationId: true } })
    .catch(() => null);
  const senderLabel = sender?.fullName || user.email || 'member';
  const messagePreview = normalized.body.slice(0, 200);

  if (recipientId) {
    // Staff open the member's thread from the notification, never the member
    // inbox (/dashboard/messages). A counselor of record lands on the thread in
    // /counselor/messages; any other staff recipient uses /admin/messages.
    const recipientCounselor = await prisma.counselor
      .findFirst({ where: { userId: recipientId, active: true }, select: { id: true } })
      .catch(() => null);
    const link = recipientCounselor ? counselorMemberThreadLink(user.id) : '/admin/messages';
    await createNotification({
      userId: recipientId,
      type: 'message',
      title: `New message from ${senderLabel}`,
      body: messagePreview,
      data: { threadId: thread.id, memberId: user.id, link },
    });
  } else {
    // Assignment should have already run on thread open. If the org still
    // has no counselor of record, notify the WAP counselor pool, then admins.
    await notifyUnassignedMemberMessage({
      memberId: user.id,
      organizationId: sender?.organizationId ?? null,
      threadId: thread.id,
      senderLabel,
      messagePreview,
    });
  }

  auditLog({ actorUserId: user.id, action: 'member.message.send', targetType: 'Message', targetId: msg.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'Message', id: msg.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ message: serializeMessage(msg) });

  } catch (error) {
    console.error('/member/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);async function _PATCH() {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const thread = await getOrCreateMemberCounselorThread(user.id);
  const ok = await assertMemberCanAccessThread(user.id, thread.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  await prisma.$transaction((tx) => tx.messageThread.update({
    where: { id: thread.id },
    data: { memberLastReadAt: now },
  }));

  auditLog({ actorUserId: user.id, action: 'member.messages.markRead', targetType: 'MessageThread', targetId: thread.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'MessageThread', id: thread.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true, memberLastReadAt: now.toISOString() });

  } catch (error) {
    console.error('/member/messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);

