import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { employerVisibleMatchReasons } from '@/lib/employer/matchReasons';
import type { AIJobMatchStatus } from '@prisma/client';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const patchSchema = z.object({
  status: z.enum([
    'suggested',
    'employer_notified',
    'student_notified',
    'rejected',
    'contacted',
    'interviewing',
    'hired',
  ]),
});export const PATCH = withApiGuc(async (request: NextRequest, ctx: { params: Promise<{ id: string; studentId: string }> }) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employerCtx = await getEmployerForUser(user.id);
  if (!employerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: jobId, studentId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const job = await prisma.$transaction((tx) => tx.job.findFirst({
    where: { id: jobId, employerId: employerCtx.employerId, status: 'live' },
    select: { id: true },
  }));
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const match = await prisma.$transaction((tx) => tx.aIJobMatch.findFirst({
    where: { jobId, studentId },
  }));
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const updated = await prisma.$transaction((tx) => tx.aIJobMatch.update({
    where: { id: match.id },
    data: { status: parsed.data.status as AIJobMatchStatus, statusUpdatedAt: new Date() },
    include: {
      student: { select: { id: true, fullName: true, email: true } },
    },
  }));

  auditLog({ actorUserId: user.id, action: 'employer_job_match_update', targetType: 'AIJobMatch', targetId: match.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'employer' }, verb: 'updated', object: { type: 'AIJobMatch', id: match.id }, result: { success: true } }).catch(() => {});
  // Legacy rows can still carry the staff-only assessment-score reason.
  return NextResponse.json({ ...updated, matchReasons: employerVisibleMatchReasons(updated.matchReasons) });

  } catch (error) {
    console.error('/employer/jobs/[id]/matches/[studentId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

