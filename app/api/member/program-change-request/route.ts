import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const createSchema = z.object({
  requestedProgramSlug: z.string().min(1).max(120),
  reason: z.string().min(10).max(8000),
});async function _GET() {
  try {
    const user = await getUser();
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await prisma.$transaction((tx) => tx.programChangeRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        currentProgramSlug: true,
        requestedProgramSlug: true,
        reason: true,
        status: true,
        adminNote: true,
        createdAt: true,
        reviewedAt: true,
      },
      take: 100,
    }));

    return NextResponse.json({ requests: rows });
  } catch (error) {
    captureApiError(error, { route: 'GET /api/member/program-change-request' });
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureUserInDb(user);

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
    }

    const organizationId = await getActorOrganizationId(user.id);
    const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: user.id },
      select: {
        enrolledProgram: true,
        courseEnrollments: { ...CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, where: { organizationId } },
      },
    }));
    const currentProgramSlug = dbUser
      ? resolveConfirmedProgramAssignment(dbUser).programSlug
      : null;

    const pending = await prisma.$transaction((tx) => tx.programChangeRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    }));
    if (pending) {
      return NextResponse.json(
        { error: 'You already have a pending program change request.' },
        { status: 409 }
      );
    }

    const row = await prisma.$transaction((tx) => tx.programChangeRequest.create({
      data: {
        userId: user.id,
        currentProgramSlug,
        requestedProgramSlug: parsed.data.requestedProgramSlug,
        reason: parsed.data.reason,
      },
    }));

    auditLog({ actorUserId: user.id, action: 'member.programChangeRequest.create', targetType: 'ProgramChangeRequest', targetId: row.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'ProgramChangeRequest', id: row.id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    captureApiError(error, { route: 'POST /api/member/program-change-request' });
    return NextResponse.json({ error: 'Could not submit request' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
