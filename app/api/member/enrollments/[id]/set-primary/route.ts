import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { getUser } from '@/lib/auth/server';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
export const POST = withApiGuc(async (
  _request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: enrollmentId } = await context.params;
  if (!enrollmentId || typeof enrollmentId !== 'string') {
    return NextResponse.json({ error: 'Missing enrollment id' }, { status: 400 });
  }

  const outcome = await withActiveMemberWrite(user.id, async (tx) => {
    // Match self-serve enrollment's lock order: lifecycle key, then the
    // member enrollment key. This also serializes two primary promotions.
    if (interactiveTransactionsGuaranteed()) {
      const lockKey = `member-program-enroll:${user.id}`;
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `);
    }
    const enrollment = await tx.courseEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, userId: true, programSlug: true, isPrimary: true },
    });
    if (!enrollment || enrollment.userId !== user.id) return { kind: 'missing' as const };
    if (enrollment.isPrimary) return { kind: 'unchanged' as const, enrollment };

    // Demote first; the partial unique index rejects a second primary row.
    await tx.courseEnrollment.updateMany({
      where: {
        userId: user.id,
        isPrimary: true,
        id: { not: enrollment.id },
      },
      data: { isPrimary: false },
    });
    await tx.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { isPrimary: true },
    });
    // The xAPI pipeline still reads this legacy pointer.
    await tx.user.update({
      where: { id: user.id },
      data: { enrolledProgram: enrollment.programSlug },
    });
    return { kind: 'changed' as const, enrollment };
  });

  if (outcome.kind === 'missing') {
    // Don't disclose the row exists for a different user.
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }

  const enrollment = outcome.enrollment;
  if (outcome.kind === 'unchanged') {
    return NextResponse.json({
      ok: true,
      enrollmentId: enrollment.id,
      programSlug: enrollment.programSlug,
      changed: false,
    });
  }

  auditLog({ actorUserId: user.id, action: 'member.enrollment.setPrimary', targetType: 'CourseEnrollment', targetId: enrollment.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'CourseEnrollment', id: enrollment.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({
    ok: true,
    enrollmentId: enrollment.id,
    programSlug: enrollment.programSlug,
    changed: true,
  });

  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('/member/enrollments/[id]/set-primary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

