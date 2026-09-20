import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { auditLog } from '@/lib/audit';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { INBOX_ZERO_DISMISS_ACTION } from '@/lib/counselor/inboxZero';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { persistEvent } from '@/lib/events/track';

const bodySchema = z.object({
  memberId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  flags: z.array(z.string()).optional(),
});

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const counselor = await isCounselor(user.id);
    const admin = await isAdmin(user.id);
    if (!counselor && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { memberId, reason, flags } = parsed.data;
    const canAccess = await assertStaffCanAccessMemberRecord(user.id, memberId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const trimmedReason = reason.trim();

    await auditLog({
      actorUserId: user.id,
      action: INBOX_ZERO_DISMISS_ACTION,
      targetType: 'User',
      targetId: memberId,
      metadata: {
        memberId,
        reason: trimmedReason,
        flags: flags ?? [],
        dismissedAt: new Date().toISOString(),
      },
    }).catch((err) => console.error('[inbox-zero dismiss] auditLog failed:', err));

    logAuditEvent({
      user: { id: user.id, role: 'counselor' },
      verb: 'dismissed',
      object: { type: 'User', id: memberId },
      result: { success: true, extensions: { reason: trimmedReason, flags: flags ?? [] } },
      request: auditRequestMeta(request),
    }).catch(() => {});

    await persistEvent({
      userId: memberId,
      eventName: 'counselor_inbox_zero_dismissed',
      metadata: {
        dismissedBy: user.id,
        reason: trimmedReason,
        flags: flags ?? [],
      },
    }, prisma)
      .catch((err) => console.error('[inbox-zero dismiss] memberEvent failed:', err));

    return NextResponse.json({ ok: true, memberId });
  } catch (err) {
    console.error('[counselor/inbox-zero/dismiss] unhandled:', err);
    return NextResponse.json({ error: 'Dismiss failed' }, { status: 500 });
  }
});
