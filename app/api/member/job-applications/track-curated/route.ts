import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { syncCuratedJobToTracker } from '@/lib/jobs/syncCuratedJobToTracker';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const bodySchema = z.object({
  jobId: z.string().uuid(),
});export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureUserInDb(user);

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const job = await prisma.$transaction((tx) => tx.job.findFirst({
      where: { id: parsed.data.jobId, status: 'live', AND: [ACTIVE_EMPLOYER_JOB_WHERE] },
      include: { employer: { select: { companyName: true } } },
    }));
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const row = await syncCuratedJobToTracker(
      user.id,
      { id: job.id, title: job.title, employer: { companyName: job.employer.companyName } },
      { status: 'SAVED', markAppliedDate: false, source: 'DIRECT' }
    );

    return NextResponse.json({ ok: true, applicationId: row.id });
  } catch (error) {
    captureApiError(error, { route: 'POST /api/member/job-applications/track-curated' });
    return NextResponse.json({ error: 'Failed to add to tracker' }, { status: 500 });
  }
});
