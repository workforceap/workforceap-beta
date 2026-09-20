import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { captureApiError } from '@/lib/observability/captureApiError';
import { persistEvent } from '@/lib/events/track';
export const PATCH = withApiGuc(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let nextStatus: 'DISMISSED' | 'COMPLETED' = 'DISMISSED';
  try {
    const body = await req.json();
    if (body?.status === 'COMPLETED') nextStatus = 'COMPLETED';
  } catch {
    // Keep backward compatibility with dismiss-only callers.
  }

  try {
    if (nextStatus === 'COMPLETED') {
      const existing = await prisma.$transaction((tx) => tx.memberNextBestAction.findFirst({
        where: { id, memberId: user.id },
        select: { id: true },
      }));
      if (!existing) return NextResponse.json({ ok: true });

      await prisma.$transaction((tx) => tx.memberNextBestAction.update({
        where: { id, memberId: user.id },
        data: { status: 'COMPLETED' },
      }));

      await prisma.$transaction((tx) => persistEvent({
        userId: user.id,
        eventName: 'member_next_best_action_clicked',
        entityType: 'MemberNextBestAction',
        entityId: id,
        sourcePage: '/dashboard',
      }, tx)).catch(() => {});
    } else {
      await prisma.$transaction((tx) => tx.memberNextBestAction.update({
        where: { id, memberId: user.id },
        data: { status: nextStatus },
      }));
    }

    auditLog({ actorUserId: user.id, action: nextStatus === 'COMPLETED' ? 'member.nba.complete' : 'member.nba.dismiss', targetType: 'MemberNextBestAction', targetId: id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'MemberNextBestAction', id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Missing/foreign-owned IDs remain a benign no-op, but connection and
    // other persistence failures must let the client restore its optimistic UI.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ ok: true });
    }
    throw error;
  }

  } catch (error) {
    captureApiError(error, { route: '/api/member/nba/[id]' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
