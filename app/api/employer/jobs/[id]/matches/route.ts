import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { employerVisibleMatchReasons } from '@/lib/employer/matchReasons';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employerCtx = await getEmployerForUser(user.id);
  if (!employerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: jobId } = await ctx.params;

  const job = await prisma.$transaction((tx) => tx.job.findFirst({
    where: { id: jobId, employerId: employerCtx.employerId, status: 'live' },
    select: { id: true, title: true },
  }));
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const matches = await prisma.$transaction((tx) => tx.aIJobMatch.findMany({
    where: { jobId },
    orderBy: { matchScore: 'desc' },
    include: {
      student: { select: { id: true, fullName: true, email: true, enrolledProgram: true } },
    },
    take: 100,
  }));

  // Rows stored before 2026-09-23 can still carry the staff-only
  // assessment-score reason; employers never receive it.
  return NextResponse.json({
    job,
    matches: matches.map((m) => ({ ...m, matchReasons: employerVisibleMatchReasons(m.matchReasons) })),
  });

  } catch (error) {
    console.error('/employer/jobs/[id]/matches error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

