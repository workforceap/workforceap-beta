import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { prisma } from '@/lib/db/prisma';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { ifAiUnconfigured } from '@/lib/ai/aiUnavailableResponse';
import {
  tailorResumeForJob,
  JobTailorUnavailableError,
  type JobTailorResponse,
} from '@/lib/ai/jobTailor';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error } satisfies JobTailorResponse, { status });
}

export const POST = withApiGuc(
  async (
    _request: NextRequest,
    context: { params: Promise<{ jobId: string }> }
  ) => {
    try {
      const user = await getUser();
      if (!user) return fail('Unauthorized', 401);

      const unconfigured = ifAiUnconfigured();
      if (unconfigured) {
        return fail('Career writing tools are not configured yet. Ask your counselor if you need help now.', 503);
      }

      const { success: withinRateLimit } = await checkAIToolRateLimit(user.id);
      if (!withinRateLimit) {
        return fail('Rate limit exceeded. Please try again in a few minutes.', 429);
      }

      const { jobId } = await context.params;

      // GUC contexts require explicit transactions for RLS visibility.
      // Callback form — the array form's results are shifted by the injected
      // GUC query (see lib/db/prisma.ts override).
      const job = await prisma.$transaction((tx) =>
        tx.job.findFirst({
          where: { id: jobId, status: 'live', AND: [ACTIVE_EMPLOYER_JOB_WHERE] },
          select: {
            id: true,
            title: true,
            description: true,
            requirements: true,
            employer: { select: { companyName: true } },
          },
        }),
      );
      if (!job) return fail('Job not found', 404);

      const resumeText = await getMemberResumePlainText(user.id, 8000, { preferOriginal: true });
      if (!resumeText || resumeText.length < 100) {
        return fail(
          'We need your resume first. Upload it in Resume Studio, then come back and tailor it to this job.',
          409
        );
      }

      let result;
      try {
        result = await tailorResumeForJob({
          userId: user.id,
          jobId: job.id,
          jobTitle: job.title,
          employerName: job.employer?.companyName ?? 'the hiring employer',
          jobDescription: job.description ?? '',
          requirements: job.requirements ?? [],
          resumeText,
        });
      } catch (err) {
        if (err instanceof JobTailorUnavailableError) {
          return fail(
            'Our resume coach is taking a quick break — nothing was saved. Please try again in a few minutes.',
            503
          );
        }
        throw err;
      }

      const response: JobTailorResponse = {
        ok: true,
        matchScoreBefore: result.matchScoreBefore,
        matchScoreAfter: result.matchScoreAfter,
        tailoredResume: result.tailoredResume,
        changes: result.changes,
        gaps: result.gaps,
        aiToolResultId: result.aiToolResultId,
      };
      return NextResponse.json(response);
    } catch (err) {
      console.error('[job-tailor] unhandled error:', err instanceof Error ? err.message : err);
      return fail('Internal server error', 500);
    }
  }
);
