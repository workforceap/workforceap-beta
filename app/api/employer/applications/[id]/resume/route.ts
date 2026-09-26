import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  isApplicationResumeSnapshotPath,
  isLegacyResumeProfilePath,
} from '@/lib/resume/atomicResumeObjectSwap';
import { captureApiError } from '@/lib/observability/captureApiError';
import { inspectStoredEnhancedResume } from '@/lib/resume/inspectStoredEnhancedResume';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const BUCKET = 'member-resumes';

type Props = { params: Promise<{ id: string }> };

function isStorageAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = String(value.statusCode ?? value.status ?? '');
  const message = typeof value.message === 'string' ? value.message : '';
  return status === '409' || /already exists|duplicate/i.test(message);
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
    // Applications created before immutable snapshots stored one of the old
    // fixed profile keys. Copy that exact historical object before changing the
    // row; never substitute the member's current profile pointer.
    const extension = resumePath.split('.').pop()?.toLowerCase();
    if (!extension) {
      return NextResponse.json({ error: 'Resume record is invalid' }, { status: 409 });
    }
    if (extension === 'txt') {
      const { data: legacyFile, error: legacyError } = await storage.download(resumePath);
      if (legacyError || !legacyFile) {
        return NextResponse.json({ error: 'Could not verify the shared resume' }, { status: 502 });
      }
      if (!(await inspectStoredEnhancedResume(
        Buffer.from(await legacyFile.arrayBuffer()),
        resumePath,
      )).readable) {
        return NextResponse.json({ error: 'The shared resume is not readable' }, { status: 422 });
      }
    }
    const snapshotPath = `${application.studentId}/application-${id}-resume.${extension}`;
    const { error: copyError } = await storage.copy(resumePath, snapshotPath);
    if (copyError && !isStorageAlreadyExists(copyError)) {
      captureApiError(copyError, {
        route: 'GET /api/employer/applications/[id]/resume legacy copy',
        userId: user.id,
        extra: { applicationId: id },
      });
      return NextResponse.json({ error: 'Could not migrate the shared resume' }, { status: 502 });
    }
    try {
      const migrated = await prisma.jobPostingApplication.updateMany({
        where: {
          id,
          studentId: application.studentId,
          resumePath,
        },
        data: { resumePath: snapshotPath },
      });
      if (migrated.count !== 1) {
        const current = await prisma.jobPostingApplication.findFirst({
          where: { id, job: { employerId: employer.employerId } },
          select: { studentId: true, resumePath: true },
        });
        if (current?.studentId !== application.studentId || current.resumePath !== snapshotPath) {
          // The deterministic object is bounded to one key per application.
          // Leave it for reconciliation rather than deleting across a CAS race.
          return NextResponse.json({ error: 'Resume record changed; retry the download' }, { status: 409 });
        }
      }
      resumePath = snapshotPath;
    } catch (error) {
      const current = await prisma.jobPostingApplication.findFirst({
        where: { id, job: { employerId: employer.employerId } },
        select: { studentId: true, resumePath: true },
      }).catch(() => null);
      if (current?.studentId === application.studentId && current.resumePath === snapshotPath) {
        resumePath = snapshotPath;
      } else {
        captureApiError(error, {
          route: 'GET /api/employer/applications/[id]/resume legacy persist',
          userId: user.id,
          extra: { applicationId: id, reconciliationRequired: true },
        });
        return NextResponse.json({ error: 'Could not migrate the shared resume' }, { status: 502 });
      }
      // A concurrent request already completed the same deterministic repair.
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
