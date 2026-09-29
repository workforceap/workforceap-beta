import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/** Public job detail - only live jobs */
async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findFirst({
      where: { id, status: 'live', AND: [ACTIVE_EMPLOYER_JOB_WHERE] },
      include: {
        employer: { select: { companyName: true } },
      },
    });
    if (!job) throw ApiError.notFound('Job not found');
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error, 'GET /api/jobs/[id]');
  }
}
export const GET = withApiGuc(_GET);
