import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { sendNewJobApplicationEmail } from '@/lib/email';
import { z } from 'zod';
import { trackEvent } from '@/lib/events/track';
import { syncCuratedJobToTracker } from '@/lib/jobs/syncCuratedJobToTracker';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { awardPoints } from '@/lib/member/points';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  isResumeObjectPathOwnedByUser,
  removeResumeObjectsWithRetry,
} from '@/lib/resume/atomicResumeObjectSwap';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'node:crypto';
import { captureApiError } from '@/lib/observability/captureApiError';

const RESUME_BUCKET = 'member-resumes';

const applySchema = z.object({
  coverLetter: z.string().max(5000).optional(),
  resumeUrl: z.string().url().optional(),
  shareProfile: z.boolean(),
  shareResume: z.boolean().optional(),
});

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getUser();
    if (!authUser) throw ApiError.unauthorized();

    const [dbUser, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: authUser.id },
        select: { fullName: true, email: true },
      }),
      prisma.profile.findUnique({
        where: { userId: authUser.id },
        select: { resumeOriginalPath: true, resumeEnhancedPath: true },
      }),
    ]);
    if (!dbUser) throw ApiError.unauthorized('User not found');

    const { id } = await params;
    const job = await prisma.job.findFirst({
      where: {
        id,
        status: 'live',
        AND: [
          ACTIVE_EMPLOYER_JOB_WHERE,
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
        ],
      },
      include: { employer: { select: { contactEmail: true, companyName: true } } },
    });

    if (!job) throw ApiError.notFound('Job not found');

    const body = await request.json().catch(() => null);
    const parsed = applySchema.safeParse(body ?? {});

    if (!parsed.success || !parsed.data.shareProfile) {
      throw ApiError.badRequest('Profile sharing consent required');
    }

    const existing = await prisma.jobPostingApplication.findUnique({
      where: { jobId_studentId: { jobId: id, studentId: authUser.id } },
    });
    if (existing) throw ApiError.conflict('Already applied');

    const currentResumePath = parsed.data.shareResume
      ? (profile?.resumeEnhancedPath || profile?.resumeOriginalPath)
      : undefined;
    if (parsed.data.shareResume && !currentResumePath) {
      throw ApiError.badRequest('Upload a resume before sharing it with an employer');
    }
    if (currentResumePath && !isResumeObjectPathOwnedByUser(authUser.id, currentResumePath)) {
      throw ApiError.conflict('Your saved resume record is invalid. Upload it again before applying.');
    }

    const applicationId = randomUUID();
    let snapshotPath: string | undefined;
    const storage = currentResumePath
      ? getSupabaseAdmin().storage.from(RESUME_BUCKET)
      : null;
    if (currentResumePath && storage) {
      const extension = currentResumePath.split('.').pop()?.toLowerCase();
      if (!extension || !['pdf', 'docx', 'txt'].includes(extension)) {
        throw ApiError.conflict('Your saved resume format is invalid. Upload it again before applying.');
      }
      snapshotPath = `${authUser.id}/application-${applicationId}-resume.${extension}`;
      const { error: copyError } = await storage.copy(currentResumePath, snapshotPath);
      if (copyError) {
        console.error('[apply] resume snapshot copy failed', copyError);
        throw ApiError.unavailable('Could not attach your resume. Your application was not submitted; please try again.');
      }
    }

    let app: { id: string };
    try {
      app = await prisma.$transaction(async (tx) => {
        const created = await tx.jobPostingApplication.create({
          data: {
            id: applicationId,
            jobId: id,
            studentId: authUser.id,
            coverLetter: parsed.data.coverLetter,
            resumeUrl: parsed.data.resumeUrl,
            resumePath: snapshotPath,
            profileShared: true,
          },
          select: { id: true },
        });
        await tx.job.update({
          where: { id },
          data: { applicationsCount: { increment: 1 } },
        });
        return created;
      });
    } catch (error) {
      let committedApplication: { id: string } | null;
      try {
        committedApplication = await prisma.jobPostingApplication.findFirst({
          where: {
            id: applicationId,
            jobId: id,
            studentId: authUser.id,
            resumePath: snapshotPath ?? null,
          },
          select: { id: true },
        });
      } catch (verificationError) {
        captureApiError(verificationError, {
          route: 'POST /api/jobs/[id]/apply commit verification',
          userId: authUser.id,
          extra: { applicationId, snapshotRetained: Boolean(snapshotPath) },
        });
        throw ApiError.unavailable(
          'Could not confirm whether your application was submitted. Check My Applications before retrying.',
        );
      }

      if (committedApplication) {
        app = committedApplication;
        captureApiError(error, {
          route: 'POST /api/jobs/[id]/apply commit acknowledgement recovered',
          userId: authUser.id,
          extra: { applicationId },
        });
      } else {
        if (snapshotPath && storage) {
          await removeResumeObjectsWithRetry({
            paths: [snapshotPath],
            removeObjects: (paths) => storage.remove(paths),
            onCleanupError: (cleanupError, paths) => {
              captureApiError(cleanupError, {
                route: 'POST /api/jobs/[id]/apply resume snapshot rollback',
                userId: authUser.id,
                extra: { applicationId, orphanedObjectCount: paths.length },
              });
            },
          });
        }
        throw error;
      }
    }

    await sendNewJobApplicationEmail({
      to: job.employer.contactEmail,
      jobTitle: job.title,
      applicantName: dbUser.fullName ?? dbUser.email ?? 'Applicant',
      applicantEmail: dbUser.email,
      applicationId: app.id,
    }).catch((error) => console.error('[apply] application email failed after commit', error));

    await trackEvent({
      userId: authUser.id,
      eventName: 'application_added',
      entityType: 'job_application',
      entityId: app.id,
      metadata: { jobId: id, jobTitle: job.title },
      sourcePage: `/dashboard/jobs/${id}`,
    }).catch((error) => console.error('[apply] application event failed after commit', error));

    // Award points (idempotent on application id)
    awardPoints(authUser.id, 'job_application', app.id).catch(() => {});

    try {
      await syncCuratedJobToTracker(
        authUser.id,
        { id: job.id, title: job.title, employer: { companyName: job.employer.companyName } },
        { status: 'APPLIED', markAppliedDate: true, source: 'DIRECT' }
      );
    } catch (e) {
      console.error('[apply] tracker sync:', e);
    }

    return NextResponse.json({ ok: true, applicationId: app.id });
  } catch (error) {
    return handleApiError(error, 'POST /api/jobs/[id]/apply');
  }
}
export const POST = withApiGuc(_POST);
