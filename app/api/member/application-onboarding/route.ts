import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

const bodySchema = z.object({
  programInterest: z.string().min(1).max(500),
});export const PATCH = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  const { programInterest } = parsed.data;

  // Keep the Application and User copies together behind the deletion lock.
  // A stale authenticated request must not recreate onboarding data after
  // the member was anonymized.
  await withActiveMemberWrite(user.id, async (tx) => {
    const latest = await tx.application.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (latest) {
      await tx.application.update({
        where: { id: latest.id },
        data: { programInterest },
      });
    } else {
      await tx.application.create({
        data: {
          userId: user.id,
          programInterest,
          status: ApplicationStatus.PENDING,
          submittedAt: new Date(),
        },
      });
    }

    await tx.user.update({
      where: { id: user.id },
      data: { programInterest },
    });
  });

  auditLog({ actorUserId: user.id, action: 'member.applicationOnboarding.update', targetType: 'ApplicationOnboarding', targetId: user.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'ApplicationOnboarding', id: user.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('/member/application-onboarding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

