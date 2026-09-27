import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  isApplicationResumeSnapshotPath,
  isLegacyResumeProfilePath,
  removeResumeObjectsWithRetry,
} from '@/lib/resume/atomicResumeObjectSwap';
import { captureApiError } from '@/lib/observability/captureApiError';
import { inspectStoredEnhancedResume } from '@/lib/resume/inspectStoredEnhancedResume';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  MemberUploadCleanupError,
  MemberUploadLifecycleError,
  MemberUploadPersistenceOutcomeError,
  MemberUploadStorageOutcomeError,
  withMemberUploadClaim,
} from '@/lib/member/uploadLifecycle';

const BUCKET = 'member-resumes';

type Props = { params: Promise<{ id: string }> };

function isStorageAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = String(value.statusCode ?? value.status ?? '');
  const message = typeof value.message === 'string' ? value.message : '';
  return status === '409' || /already exists|duplicate/i.test(message);
}

class ResumeBackfillFailure extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ResumeBackfillFailure';
  }
}

export const GET = withApiGuc(async (_request: Request, { params }: Props) => {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const superAdmin = await isSuperAdmin(user.id);
  const employer = await getEmployerForUser(user.id, { isSuperAdminHint: superAdmin });
  if (!employer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const application = await prisma.jobPostingApplication.findFirst({
    where: { id, job: { employerId: employer.employerId } },
    select: { studentId: true, resumePath: true },
  });
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  if (!application.resumePath) {
    return NextResponse.json({ error: 'The applicant did not share a resume' }, { status: 404 });
  }
  let resumePath = application.resumePath;
  const isSnapshot = isApplicationResumeSnapshotPath(application.studentId, id, resumePath);

  if (!isSnapshot && !isLegacyResumeProfilePath(application.studentId, resumePath)) {
    console.error('[employer/application/resume] rejected a non-snapshot resume path', {
      applicationId: id,
    });
    return NextResponse.json({ error: 'Resume record is invalid' }, { status: 409 });
  }

  const storage = getSupabaseAdmin().storage.from(BUCKET);

  if (!isSnapshot) {
    // The destination is a fixed historical key, so it may already exist.
    // Claim before copy, then clean up only when this request created it and
    // a fresh database read proves the application does not reference it.
    try {
      resumePath = await withMemberUploadClaim({
        userId: application.studentId,
        // No generic attempted-path cleanup: a 409 destination may belong to
        // an earlier successful migration. The callback handles new copies.
        removeObjects: async () => ({ error: null }),
        run: async () => {
          const latest = await prisma.jobPostingApplication.findFirst({
            where: { id, job: { employerId: employer.employerId } },
            select: { studentId: true, resumePath: true },
          });
          if (!latest || latest.studentId !== application.studentId || !latest.resumePath) {
            throw new ResumeBackfillFailure(404, 'Application not found');
          }
          if (isApplicationResumeSnapshotPath(application.studentId, id, latest.resumePath)) {
            return latest.resumePath;
          }
          if (!isLegacyResumeProfilePath(application.studentId, latest.resumePath)) {
            throw new ResumeBackfillFailure(409, 'Resume record is invalid');
          }

          const sourcePath = latest.resumePath;
          const extension = sourcePath.split('.').pop()?.toLowerCase();
          if (!extension) throw new ResumeBackfillFailure(409, 'Resume record is invalid');
          if (extension === 'txt') {
            const { data: legacyFile, error: legacyError } = await storage.download(sourcePath);
            if (legacyError || !legacyFile) {
              throw new ResumeBackfillFailure(502, 'Could not verify the shared resume');
            }
            if (!(await inspectStoredEnhancedResume(
              Buffer.from(await legacyFile.arrayBuffer()),
              sourcePath,
            )).readable) {
              throw new ResumeBackfillFailure(422, 'The shared resume is not readable');
            }
          }

          const snapshotPath = `${application.studentId}/application-${id}-resume.${extension}`;
          let createdByThisRequest = false;
          try {
            const { error: copyError } = await storage.copy(sourcePath, snapshotPath);
            if (copyError && !isStorageAlreadyExists(copyError)) throw copyError;
            createdByThisRequest = !copyError;
          } catch (copyError) {
            captureApiError(copyError, {
              route: 'GET /api/employer/applications/[id]/resume legacy copy',
              userId: user.id,
              extra: { applicationId: id, reconciliationRequired: true },
            });
            // Even a failed/timed-out copy may finish after the deletion sweep.
            // Keep the claim; the fixed destination cannot be removed blindly.
            throw new MemberUploadStorageOutcomeError(copyError);
          }

          const cleanupUnreferencedCopy = async () => {
            if (!createdByThisRequest) return;
            const cleaned = await removeResumeObjectsWithRetry({
              paths: [snapshotPath],
              removeObjects: (paths) => storage.remove(paths),
              onCleanupError: (cleanupError, paths) => {
                captureApiError(cleanupError, {
                  route: 'GET /api/employer/applications/[id]/resume legacy rollback',
                  userId: user.id,
                  extra: { applicationId: id, orphanedObjectCount: paths.length },
                });
              },
            });
            if (!cleaned) throw new MemberUploadPersistenceOutcomeError(
              new Error('Copied resume cleanup could not be confirmed'),
            );
          };

          let migrated: { count: number } | null = null;
          let writeError: unknown = null;
          try {
            migrated = await prisma.jobPostingApplication.updateMany({
              where: { id, studentId: application.studentId, resumePath: sourcePath },
              data: { resumePath: snapshotPath },
            });
          } catch (error) {
            writeError = error;
          }
          if (migrated?.count === 1) return snapshotPath;

          let current: { studentId: string; resumePath: string | null } | null;
          try {
            current = await prisma.jobPostingApplication.findFirst({
              where: { id, job: { employerId: employer.employerId } },
              select: { studentId: true, resumePath: true },
            });
          } catch (verificationError) {
            throw new MemberUploadPersistenceOutcomeError(verificationError);
          }
          if (current?.studentId === application.studentId && current.resumePath === snapshotPath) {
            return snapshotPath;
          }
          await cleanupUnreferencedCopy();
          if (writeError) {
            captureApiError(writeError, {
              route: 'GET /api/employer/applications/[id]/resume legacy persist',
              userId: user.id,
              extra: { applicationId: id },
            });
            throw new ResumeBackfillFailure(502, 'Could not migrate the shared resume');
          }
          throw new ResumeBackfillFailure(409, 'Resume record changed; retry the download');
        },
      });
    } catch (error) {
      if (error instanceof ResumeBackfillFailure) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof MemberUploadLifecycleError) {
        return NextResponse.json({ error: 'Applicant account is no longer active' }, { status: 409 });
      }
      if (error instanceof MemberUploadStorageOutcomeError
        || error instanceof MemberUploadPersistenceOutcomeError
        || error instanceof MemberUploadCleanupError) {
        return NextResponse.json({ error: 'Could not migrate the shared resume; reconciliation is required' }, { status: 503 });
      }
      captureApiError(error, {
        route: 'GET /api/employer/applications/[id]/resume legacy migration',
        userId: user.id,
        extra: { applicationId: id },
      });
      return NextResponse.json({ error: 'Could not migrate the shared resume' }, { status: 502 });
    }
  }

  if (!isApplicationResumeSnapshotPath(application.studentId, id, resumePath)) {
    console.error('[employer/application/resume] rejected a non-snapshot resume path', {
      applicationId: id,
    });
    return NextResponse.json({ error: 'Resume record is invalid' }, { status: 409 });
  }

  if (resumePath.toLowerCase().endsWith('.txt')) {
    const { data: snapshotFile, error: snapshotError } = await storage.download(resumePath);
    if (snapshotError || !snapshotFile) {
      return NextResponse.json({ error: 'Could not verify the shared resume' }, { status: 502 });
    }
    if (!(await inspectStoredEnhancedResume(
      Buffer.from(await snapshotFile.arrayBuffer()),
      resumePath,
    )).readable) {
      return NextResponse.json({ error: 'The shared resume is not readable' }, { status: 422 });
    }
  }

  const { data, error } = await storage.createSignedUrl(resumePath, 300);
  if (error || !data?.signedUrl) {
    console.error('[employer/application/resume] signing failed', error);
    return NextResponse.json({ error: 'Could not create resume download link' }, { status: 502 });
  }

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
});
