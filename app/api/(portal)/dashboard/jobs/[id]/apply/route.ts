import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { sendNewJobApplicationEmail } from '@/lib/email';
import { z } from 'zod';
import { persistEvent } from '@/lib/events/track';
import { syncCuratedJobToTracker } from '@/lib/jobs/syncCuratedJobToTracker';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { awardPoints } from '@/lib/member/points';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  isResumeObjectPathOwnedByUser,
} from '@/lib/resume/atomicResumeObjectSwap';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { captureApiError } from '@/lib/observability/captureApiError';
import { inspectStoredEnhancedResume } from '@/lib/resume/inspectStoredEnhancedResume';
import type { Prisma } from '@prisma/client';
import {
  assertMemberUploadWritable,
  MemberUploadCleanupError,
  MemberUploadLifecycleError,
  MemberUploadPersistenceOutcomeError,
  MemberUploadStorageOutcomeError,
  withMemberUploadClaim,
} from '@/lib/member/uploadLifecycle';

const RESUME_BUCKET = 'member-resumes';

class JobApplicationEffectOutcomeError extends MemberUploadPersistenceOutcomeError {
  constructor(causeValue: unknown) {
    super(causeValue);
    this.name = 'JobApplicationEffectOutcomeError';
  }
}

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

    let currentResumePath = parsed.data.shareResume
      ? (profile?.resumeEnhancedPath || profile?.resumeOriginalPath)
      : undefined;
    if (parsed.data.shareResume && !currentResumePath) {
      throw ApiError.badRequest('Upload a resume before sharing it with an employer');
    }
    const applicationId = randomUUID();
    let snapshotPath: string | undefined;
    const storage = currentResumePath
      ? getSupabaseAdmin().storage.from(RESUME_BUCKET)
      : null;
    if (currentResumePath && currentResumePath === profile?.resumeEnhancedPath && storage) {
      if (!isResumeObjectPathOwnedByUser(authUser.id, currentResumePath)) {
        throw ApiError.conflict('Your saved resume record is invalid. Upload it again before applying.');
      }
      const { data, error } = await storage.download(currentResumePath);
      if (error || !data) {
        throw ApiError.unavailable('Could not verify your AI-built resume. Your application was not submitted; please try again.');
      }
      const inspected = await inspectStoredEnhancedResume(
        Buffer.from(await data.arrayBuffer()),
        currentResumePath,
      );
      if (!inspected.readable) {
        currentResumePath = profile?.resumeOriginalPath ?? undefined;
        if (!currentResumePath) {
          throw ApiError.badRequest('The AI-built resume is not readable. Upload a readable resume before sharing it with an employer.');
        }
      }
    }
    if (currentResumePath && !isResumeObjectPathOwnedByUser(authUser.id, currentResumePath)) {
      throw ApiError.conflict('Your saved resume record is invalid. Upload it again before applying.');
    }
    if (currentResumePath && storage) {
      const extension = currentResumePath.split('.').pop()?.toLowerCase();
      if (!extension || !['pdf', 'docx', 'txt'].includes(extension)) {
        throw ApiError.conflict('Your saved resume format is invalid. Upload it again before applying.');
      }
      snapshotPath = `${authUser.id}/application-${applicationId}-resume.${extension}`;
    }

    const persistApplication = async (operationId: string): Promise<{ id: string }> => {
      const write = async (tx: Prisma.TransactionClient) => {
        await assertMemberUploadWritable(tx, authUser.id, operationId);
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
      };
      try {
        return await prisma.$transaction(write);
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
          throw new MemberUploadPersistenceOutcomeError(verificationError);
        }

        if (committedApplication) {
          captureApiError(error, {
            route: 'POST /api/jobs/[id]/apply commit acknowledgement recovered',
            userId: authUser.id,
            extra: { applicationId },
          });
          return committedApplication;
        }
        throw error;
      }
    };

    // Claim every application, even without a resume. The claim prevents erase
    // from overtaking the DB commit, employer email, and member-side effects.
    const app = await withMemberUploadClaim({
      userId: authUser.id,
      removeObjects: (paths) => storage?.remove(paths) ?? Promise.resolve({ error: null }),
      onCleanupError: (cleanupError, paths) => {
        captureApiError(cleanupError, {
          route: 'POST /api/jobs/[id]/apply resume snapshot rollback',
          userId: authUser.id,
          extra: { applicationId, orphanedObjectCount: paths.length },
        });
      },
      run: async (operationId, recordAttempt) => {
        if (currentResumePath && snapshotPath && storage) {
            recordAttempt(snapshotPath);
            try {
              const { error: copyError } = await storage.copy(currentResumePath, snapshotPath);
              if (copyError) throw copyError;
            } catch (copyError) {
              captureApiError(copyError, {
                route: 'POST /api/jobs/[id]/apply resume snapshot copy',
                userId: authUser.id,
                extra: { applicationId },
              });
              throw new MemberUploadStorageOutcomeError(copyError);
            }
        }
        const committed = await persistApplication(operationId);
        try {
          const email = await sendNewJobApplicationEmail({
            to: job.employer.contactEmail,
            jobTitle: job.title,
            applicantName: dbUser.fullName ?? dbUser.email ?? 'Applicant',
            applicantEmail: dbUser.email,
            applicationId: committed.id,
          });
          // An unconfigured sender or fixture-recipient skip did not contact
          // the provider. Any other failure can have an uncertain send result.
          if (!email.ok && !email.skipped && email.error !== 'Email not configured') {
            throw new Error(`Employer notification outcome is uncertain: ${email.error ?? 'unknown error'}`);
          }
          await persistEvent({
            userId: authUser.id,
            eventName: 'application_added',
            entityType: 'job_application',
            entityId: committed.id,
            metadata: { jobId: id, jobTitle: job.title },
            sourcePage: `/dashboard/jobs/${id}`,
          }, prisma);
          // Award points is idempotent on the committed application id.
          await awardPoints(authUser.id, 'job_application', committed.id);
          await syncCuratedJobToTracker(
            authUser.id,
            { id: job.id, title: job.title, employer: { companyName: job.employer.companyName } },
            { status: 'APPLIED', markAppliedDate: true, source: 'DIRECT' },
          );
        } catch (effectError) {
          captureApiError(effectError, {
            route: 'POST /api/jobs/[id]/apply post-commit effects',
            userId: authUser.id,
            extra: { applicationId: committed.id, operationId, reconciliationRequired: true },
          });
          // The application already references the snapshot. Keep the claim
          // and object if any downstream provider or DB result is uncertain.
          throw new JobApplicationEffectOutcomeError(effectError);
        }
        return committed;
      },
    });

    return NextResponse.json({ ok: true, applicationId: app.id });
  } catch (error) {
    if (error instanceof MemberUploadLifecycleError) {
      return handleApiError(ApiError.conflict('This account is no longer accepting applications.'), 'POST /api/jobs/[id]/apply');
    }
    if (error instanceof MemberUploadStorageOutcomeError || error instanceof MemberUploadCleanupError) {
      return handleApiError(ApiError.unavailable('Could not attach your resume. Your application was not submitted; contact support before retrying.'), 'POST /api/jobs/[id]/apply');
    }
    if (error instanceof MemberUploadPersistenceOutcomeError) {
      if (error instanceof JobApplicationEffectOutcomeError) {
        return handleApiError(ApiError.unavailable('Your application was submitted, but confirmation could not finish. Check My Applications and contact support.'), 'POST /api/jobs/[id]/apply');
      }
      return handleApiError(ApiError.unavailable('Could not confirm whether your application was submitted. Check My Applications before retrying.'), 'POST /api/jobs/[id]/apply');
    }
    return handleApiError(error, 'POST /api/jobs/[id]/apply');
  }
}
export const POST = withApiGuc(_POST);
